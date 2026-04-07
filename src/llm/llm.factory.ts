import { BaseLlmClient } from './base.client';
import { GeminiClient } from './gemini.client';
import { OpenAIClient } from './openai.client';
import { config } from '../config/env';

export function createLlmClient(): BaseLlmClient {
  switch (config.llmProvider) {
    case 'gemini':
      return new GeminiClient();
    case 'openai':
      return new OpenAIClient();
    default:
      throw new Error(
        `Unsupported LLM_PROVIDER: "${config.llmProvider}". Supported: gemini, openai`
      );
  }
}
