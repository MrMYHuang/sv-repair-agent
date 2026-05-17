import {
  AuthStorage,
  createAgentSession,
  createExtensionRuntime,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type ResourceLoader
} from '@earendil-works/pi-coding-agent';
import type { AppConfig, PiResult, RepairPromptInput } from './types.js';
import type { Logger } from './logger.js';

const OPENAI_COMPAT_PROVIDER = 'sv-repair-openai-compatible';

export function validatePiSdk(): void {
  // Static imports above validate that the SDK package is installed and loadable.
}

export function buildRepairPrompt(input: RepairPromptInput): string {
  return `You are an expert SystemVerilog repair agent.

Fix the Verilator syntax/lint errors in the target SystemVerilog file.

Target file:
${input.filePath}

Rules:
- Modify only the target SystemVerilog file.
- Preserve original design intent.
- Fix only syntax, lint, or compiler errors.
- Keep changes minimal.
- Do not create unrelated files.
- Do not rewrite the architecture unless required.
- After editing, the file must pass:
  ${input.verilatorCommand}

Verilator output:
${input.verilatorOutput}`;
}

export async function runPiRepair(
  prompt: string,
  cwd: string,
  attempt: number,
  config: AppConfig,
  logger: Logger,
  signal?: AbortSignal
): Promise<PiResult> {
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey(OPENAI_COMPAT_PROVIDER, config.openaiApiKey);

  const modelRegistry = ModelRegistry.inMemory(authStorage);
  modelRegistry.registerProvider(OPENAI_COMPAT_PROVIDER, {
    name: 'SystemVerilog repair OpenAI-compatible endpoint',
    baseUrl: config.openaiBaseUrl,
    apiKey: config.openaiApiKey,
    api: 'openai-completions',
    models: [
      {
        id: config.openaiModel,
        name: config.openaiModel,
        api: 'openai-completions',
        baseUrl: config.openaiBaseUrl,
        reasoning: false,
        input: ['text'],
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0
        },
        contextWindow: 128000,
        maxTokens: 8192
      }
    ]
  });

  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  const model = modelRegistry.find(OPENAI_COMPAT_PROVIDER, config.openaiModel);

  if (!model) {
    throw new Error(`Could not register Pi SDK model: ${config.openaiModel}`);
  }

  logger.log(
    attempt,
    'INFO',
    `Pi SDK endpoint: provider=${OPENAI_COMPAT_PROVIDER}, baseUrl=${config.openaiBaseUrl}, model=${config.openaiModel}`
  );

  const { session } = await createAgentSession({
    cwd,
    model,
    thinkingLevel: 'off',
    authStorage,
    modelRegistry,
    resourceLoader: createRepairResourceLoader(),
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: {
        enabled: false,
        provider: {
          maxRetries: 0
        }
      }
    }),
    tools: ['read', 'bash', 'edit', 'write']
  });

  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      stdout += event.assistantMessageEvent.delta;
      logger.streamPiChunk(attempt, event.assistantMessageEvent.delta);
    }
  });

  try {
    if (signal?.aborted) {
      throw new Error('Pi repair aborted before start');
    }

    const abortHandler = (): void => {
      session.dispose();
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    try {
      await session.prompt(prompt, { source: 'rpc' });
    } finally {
      signal?.removeEventListener('abort', abortHandler);
    }

    logger.flushPi(attempt);
    const assistantErrors = getAssistantErrorDetails(session.state.messages);
    if (assistantErrors.length > 0) {
      stderr = assistantErrors.join('\n\n');
      exitCode = 1;
      logger.log(attempt, 'ERROR', `Pi SDK assistant error:\n${stderr}`);
    }
  } catch (error) {
    const message = formatThrownError(error);
    stderr = message;
    exitCode = 1;
    logger.flushPi(attempt);
    logger.log(attempt, 'ERROR', `Pi SDK threw an error:\n${message}`);
  } finally {
    unsubscribe();
    session.dispose();
  }

  return {
    exitCode,
    stdout,
    stderr,
    output: [stdout, stderr].filter(Boolean).join('\n')
  };
}

function createRepairResourceLoader(): ResourceLoader {
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () =>
      [
        'You are a SystemVerilog repair coding agent.',
        'Use file editing tools to modify only the target file named by the user.',
        'Use bash only for focused verification commands requested by the user prompt.',
        'Keep edits minimal and preserve design intent.'
      ].join('\n'),
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {}
  };
}

function getAssistantErrorDetails(messages: readonly unknown[]): string[] {
  const details: string[] = [];

  for (const message of [...messages].reverse()) {
    if (!isRecord(message) || message.role !== 'assistant') {
      continue;
    }

    if (message.stopReason === 'error') {
      const errorMessage = typeof message.errorMessage === 'string' ? message.errorMessage : undefined;
      details.push(errorMessage ?? 'Pi SDK assistant message ended with stopReason=error');
      details.push(...formatDiagnostics(message.diagnostics));
      details.push(...formatTextContent(message.content));
      break;
    }
  }

  return uniqueNonEmpty(details);
}

function formatDiagnostics(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((diagnostic, index) => {
    if (!isRecord(diagnostic)) {
      return `diagnostic[${index}]: ${String(diagnostic)}`;
    }

    const type = typeof diagnostic.type === 'string' ? diagnostic.type : `diagnostic[${index}]`;
    const error = isRecord(diagnostic.error) ? diagnostic.error : undefined;
    const name = typeof error?.name === 'string' ? error.name : undefined;
    const code = typeof error?.code === 'string' || typeof error?.code === 'number' ? String(error.code) : undefined;
    const message = typeof error?.message === 'string' ? error.message : undefined;
    const stack = typeof error?.stack === 'string' ? error.stack : undefined;
    const details = isRecord(diagnostic.details) ? `details=${JSON.stringify(diagnostic.details)}` : undefined;
    return [type, name, code ? `code=${code}` : undefined, message, details, stack].filter(Boolean).join('\n');
  });
}

function formatTextContent(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    if (item.type === 'text' && typeof item.text === 'string') {
      return [`assistant text: ${item.text}`];
    }

    if (item.type === 'thinking' && typeof item.thinking === 'string') {
      return [`assistant thinking: ${item.thinking}`];
    }

    return [];
  });
}

function formatThrownError(error: unknown): string {
  const formatted = formatErrorLike(error);
  if (formatted) {
    return formatted;
  }

  return String(error);
}

function formatErrorLike(error: unknown, depth = 0): string | undefined {
  if (depth > 4) {
    return undefined;
  }

  if (error instanceof Error) {
    const extended = error as Error & {
      code?: unknown;
      status?: unknown;
      cause?: unknown;
      response?: unknown;
      type?: unknown;
    };
    const cause = formatErrorLike(extended.cause, depth + 1);
    const response = formatResponseLike(extended.response);
    return [
      `${error.name}: ${error.message}`,
      typeof extended.type === 'string' ? `type=${extended.type}` : undefined,
      typeof extended.code === 'string' || typeof extended.code === 'number' ? `code=${extended.code}` : undefined,
      typeof extended.status === 'string' || typeof extended.status === 'number' ? `status=${extended.status}` : undefined,
      response ? `response=${response}` : undefined,
      cause ? `cause:\n${indent(cause)}` : undefined,
      error.stack
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (typeof error === 'string') {
    return error;
  }

  if (isRecord(error)) {
    const cause = formatErrorLike(error.cause, depth + 1);
    const json = safeJson(error);
    return [json, cause ? `cause:\n${indent(cause)}` : undefined].filter(Boolean).join('\n');
  }

  return undefined;
}

function formatResponseLike(response: unknown): string | undefined {
  if (!isRecord(response)) {
    return undefined;
  }

  return safeJson({
    status: response.status,
    statusText: response.statusText,
    url: response.url
  });
}

function safeJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
}

function indent(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join('\n');
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
