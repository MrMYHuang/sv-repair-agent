import fs from 'node:fs';
import path from 'node:path';
import { buildRepairPrompt, runPiRepair } from './pi.js';
import { runVerilator } from './verilator.js';
import type { AppConfig, VerilatorResult } from './types.js';
import type { Logger } from './logger.js';

export async function runRepairLoop(
  filePath: string,
  config: AppConfig,
  logger: Logger,
  signal: AbortSignal
): Promise<number> {
  const absoluteFilePath = path.resolve(filePath);
  const workdir = path.dirname(absoluteFilePath);
  const backupPath = `${absoluteFilePath}.bak`;

  if (!fs.existsSync(absoluteFilePath)) {
    logger.log(0, 'ERROR', `Target file does not exist: ${absoluteFilePath}`);
    return 1;
  }

  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(absoluteFilePath, backupPath);
    logger.log(0, 'INFO', `Backed up original file to ${backupPath}`);
  } else {
    logger.log(0, 'WARN', `Backup already exists, preserving it: ${backupPath}`);
  }

  let lastResult: VerilatorResult | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    logger.log(attempt, 'INFO', 'Running Verilator');
    lastResult = await runVerilator(absoluteFilePath);

    if (lastResult.passed) {
      logger.log(attempt, 'SUCCESS', 'Syntax check PASS');
      console.log('Syntax check PASS');
      return 0;
    }

    logger.log(attempt, 'ERROR', 'Verilator syntax check failed');
    logger.log(attempt, 'ERROR', lastResult.output);

    const prompt = buildRepairPrompt({
      filePath: absoluteFilePath,
      verilatorOutput: lastResult.output
    });

    logger.log(attempt, 'PROMPT', prompt);
    logger.log(attempt, 'INFO', 'Invoking Pi Coding Agent');

    const piResult = await runPiRepair(prompt, workdir, attempt, config, logger, signal);
    logger.log(attempt, piResult.exitCode === 0 ? 'INFO' : 'WARN', `Pi exited with code ${piResult.exitCode}`);

    if (signal.aborted) {
      logger.log(attempt, 'WARN', 'Repair loop interrupted');
      return 1;
    }

    logger.log(attempt, 'INFO', 'Re-running Verilator');
    lastResult = await runVerilator(absoluteFilePath);

    if (lastResult.passed) {
      logger.log(attempt, 'SUCCESS', 'Syntax check PASS');
      console.log('Syntax check PASS');
      return 0;
    }

    logger.log(attempt, 'ERROR', 'Verilator still reports errors after repair attempt');
    logger.log(attempt, 'ERROR', lastResult.output);
  }

  logger.log(config.maxAttempts, 'ERROR', 'Syntax check FAIL');
  if (lastResult) {
    logger.log(config.maxAttempts, 'ERROR', lastResult.output);
  }
  console.log('Syntax check FAIL');
  if (lastResult?.output) {
    console.error(lastResult.output);
  }
  return 1;
}
