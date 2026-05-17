import { execa } from 'execa';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig, PiResult, RepairPromptInput } from './types.js';
import type { Logger } from './logger.js';

export function validatePi(): void {
  if (!findExecutable('pi')) {
    throw new Error('Pi Coding Agent is required but was not found in PATH.');
  }
}

function findExecutable(command: string): string | undefined {
  const pathValue = process.env.PATH ?? '';
  const candidates = pathValue.split(path.delimiter).map((dir) => path.join(dir, command));

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Keep scanning PATH.
    }
  }

  return undefined;
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
  const child = execa('pi', [prompt], {
    cwd,
    reject: false,
    signal,
    env: {
      OPENAI_BASE_URL: config.openaiBaseUrl,
      OPENAI_API_KEY: config.openaiApiKey,
      OPENAI_MODEL: config.openaiModel
    }
  });

  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
    logger.streamPiChunk(attempt, chunk);
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
    logger.streamPiChunk(attempt, chunk);
  });

  const result = await child;
  logger.flushPi(attempt);

  return {
    exitCode: result.exitCode ?? 1,
    stdout,
    stderr,
    output: [stdout, stderr].filter(Boolean).join('\n')
  };
}
