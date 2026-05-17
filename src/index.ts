#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config.js';
import { Logger } from './logger.js';
import { validatePiSdk } from './pi.js';
import { runRepairLoop } from './repairLoop.js';
import { validateVerilator } from './verilator.js';

interface CliOptions {
  file: string;
}

const program = new Command();

program
  .name('sv-repair-agent')
  .description('Repair one SystemVerilog file using Verilator and Pi Coding Agent.')
  .requiredOption('--file <path>', 'SystemVerilog file to repair')
  .parse(process.argv);

const options = program.opts<CliOptions>();
const abortController = new AbortController();

process.once('SIGINT', () => {
  abortController.abort();
});

async function main(): Promise<number> {
  const logger = new Logger(3);

  try {
    const config = loadConfig();

    logger.log(0, 'INFO', 'Validating Verilator installation');
    await validateVerilator();

    logger.log(0, 'INFO', 'Validating Pi Coding Agent SDK');
    validatePiSdk();

    return await runRepairLoop(options.file, config, logger, abortController.signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.log(0, 'ERROR', message);
    return 1;
  } finally {
    await logger.close();
  }
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
