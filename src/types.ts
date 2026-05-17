export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'PROMPT' | 'PI';

export interface AppConfig {
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
  maxAttempts: number;
}

export interface VerilatorResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
}

export interface PiResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
}

export interface RepairPromptInput {
  filePath: string;
  verilatorCommand: string;
  verilatorOutput: string;
}
