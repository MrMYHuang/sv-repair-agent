import dotenv from 'dotenv';
import type { AppConfig } from './types.js';

dotenv.config();

export function loadConfig(): AppConfig {
  const required = ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL'] as const;
  const missing = required.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    openaiBaseUrl: process.env.OPENAI_BASE_URL as string,
    openaiApiKey: process.env.OPENAI_API_KEY as string,
    openaiModel: process.env.OPENAI_MODEL as string,
    maxAttempts: 3
  };
}
