import { execa } from 'execa';
import path from 'node:path';
import type { VerilatorResult } from './types.js';

export async function validateVerilator(): Promise<void> {
  try {
    await execa('verilator', ['--version']);
  } catch {
    throw new Error('Verilator is required but was not found in PATH.');
  }
}

export async function runVerilator(filePath: string): Promise<VerilatorResult> {
  const cwd = path.dirname(filePath);
  const target = path.basename(filePath);
  const result = await execa('verilator', ['--lint-only', '--sv', target], {
    cwd,
    reject: false,
    all: true
  });

  return {
    passed: result.exitCode === 0,
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
    output: result.all ?? [result.stdout, result.stderr].filter(Boolean).join('\n')
  };
}

export function buildVerilatorCommand(filePath: string): string {
  const cwd = path.dirname(filePath);
  const target = path.basename(filePath);
  return `cd ${shellQuote(cwd)} && verilator --lint-only --sv ${shellQuote(target)}`;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}
