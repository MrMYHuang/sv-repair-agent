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
  verilator --lint-only --sv ${input.filePath}

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
    const assistantError = getLastAssistantError(session.state.messages);
    if (assistantError) {
      stderr = assistantError;
      exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr = message;
    exitCode = 1;
    logger.flushPi(attempt);
    logger.log(attempt, 'PI', message);
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

function getLastAssistantError(messages: readonly unknown[]): string | undefined {
  for (const message of [...messages].reverse()) {
    if (!isRecord(message) || message.role !== 'assistant') {
      continue;
    }

    if (message.stopReason === 'error') {
      const errorMessage = typeof message.errorMessage === 'string' ? message.errorMessage : undefined;
      return errorMessage ?? 'Pi SDK assistant message ended with stopReason=error';
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
