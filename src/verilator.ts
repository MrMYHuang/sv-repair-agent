import { execa } from 'execa';
import type { VerilatorResult } from './types.js';

export async function validateVerilator(): Promise<void> {
  try {
    await execa('verilator', ['--version']);
  } catch {
    throw new Error('Verilator is required but was not found in PATH.');
  }
}

export async function runVerilator(filePath: string): Promise<VerilatorResult> {
  const result = await execa('verilator', ['--lint-only', '--sv', filePath], {
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
