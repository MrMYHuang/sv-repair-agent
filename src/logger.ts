import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import dayjs from 'dayjs';
import type { LogLevel } from './types.js';

const levelColor: Record<LogLevel, (value: string) => string> = {
  INFO: chalk.blue,
  WARN: chalk.yellow,
  ERROR: chalk.red,
  SUCCESS: chalk.green,
  PROMPT: chalk.magenta,
  PI: chalk.cyan
};

export class Logger {
  private readonly logStream: fs.WriteStream;
  private readonly maxAttempts: number;
  private piRemainder = '';

  constructor(maxAttempts: number) {
    this.maxAttempts = maxAttempts;
    const logDir = path.resolve(process.cwd(), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const timestamp = dayjs().format('YYYYMMDD-HHmmss');
    this.logStream = fs.createWriteStream(path.join(logDir, `run-${timestamp}.log`), {
      flags: 'a'
    });
  }

  log(attempt: number, level: LogLevel, message: string): void {
    const lines = message.length > 0 ? message.split(/\r?\n/) : [''];
    for (const line of lines) {
      const plain = this.format(attempt, level, line);
      const colored = this.format(attempt, level, levelColor[level](line));
      console.log(colored);
      this.logStream.write(`${plain}\n`);
    }
  }

  streamPiChunk(attempt: number, chunk: Buffer | string): void {
    this.piRemainder += chunk.toString();
    const lines = this.piRemainder.split(/\r?\n/);
    this.piRemainder = lines.pop() ?? '';

    for (const line of lines) {
      this.log(attempt, 'PI', line);
    }
  }

  flushPi(attempt: number): void {
    if (this.piRemainder.length > 0) {
      this.log(attempt, 'PI', this.piRemainder);
      this.piRemainder = '';
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.logStream.end(resolve);
    });
  }

  private format(attempt: number, level: LogLevel, message: string): string {
    const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
    return `[${timestamp}] [Attempt ${attempt}/${this.maxAttempts}] [${level}] ${message}`;
  }
}
