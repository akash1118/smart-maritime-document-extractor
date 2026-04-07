import { GoogleGenAI } from '@google/genai';
import { BaseLlmClient } from './base.client';
import { PromptManager } from '../prompts/promptManager';
import { config } from '../config/env';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LLM_TIMEOUT')), ms)
    ),
  ]);
}

export class GeminiClient extends BaseLlmClient {
  private genAI: GoogleGenAI;
  private model: string;

  constructor() {
    super();
    this.genAI = new GoogleGenAI({ apiKey: config.llmApiKey });
    this.model = config.llmModel;
  }

  async extract(base64File: string, mimeType: string): Promise<string> {
    const prompt = PromptManager.getExtractionPrompt();
    const result = await withTimeout(
      this.genAI.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64File } },
          ],
        }],
        config: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
      config.llmTimeoutMs
    );
    return result?.text || '';
  }

  async extractWithHints(base64File: string, mimeType: string, fileName: string): Promise<string> {
    const basePrompt = PromptManager.getExtractionPrompt();
    const hint = `\n\nHint: The uploaded file is named "${fileName}" with MIME type "${mimeType}". Use these as strong signals when identifying the document type.`;
    const result = await withTimeout(
      this.genAI.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [
            { text: basePrompt + hint },
            { inlineData: { mimeType, data: base64File } },
          ],
        }],
        config: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
      config.llmTimeoutMs
    );
    return result?.text || '';
  }

  async repairJSON(malformedJson: string): Promise<string> {
    const prompt = PromptManager.getRepairPrompt();
    const result = await withTimeout(
      this.genAI.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { text: malformedJson },
          ],
        }],
        config: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
      config.llmTimeoutMs
    );
    return result?.text || '';
  }

  async validate(documents: object[]): Promise<string> {
    const prompt = PromptManager.getValidationPrompt(documents);
    const result = await withTimeout(
      this.genAI.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [{ text: prompt }],
        }],
        config: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
      config.llmTimeoutMs
    );
    return result?.text || '';
  }
}
