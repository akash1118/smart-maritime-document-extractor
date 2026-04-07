import OpenAI from 'openai';
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

export class OpenAIClient extends BaseLlmClient {
  private client: OpenAI;
  private model: string;

  constructor() {
    super();
    this.client = new OpenAI({ apiKey: config.llmApiKey });
    this.model = config.llmModel;
  }

  async extract(base64File: string, mimeType: string): Promise<string> {
    const prompt = PromptManager.getExtractionPrompt();
    const dataUrl = `data:${mimeType};base64,${base64File}`;
    const response = await withTimeout(
      this.client.chat.completions.create({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
      }),
      config.llmTimeoutMs
    );
    return response.choices[0]?.message?.content || '';
  }

  async extractWithHints(base64File: string, mimeType: string, fileName: string): Promise<string> {
    const basePrompt = PromptManager.getExtractionPrompt();
    const hint = `\n\nHint: The uploaded file is named "${fileName}" with MIME type "${mimeType}". Use these as strong signals when identifying the document type.`;
    const dataUrl = `data:${mimeType};base64,${base64File}`;
    const response = await withTimeout(
      this.client.chat.completions.create({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: basePrompt + hint },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
      }),
      config.llmTimeoutMs
    );
    return response.choices[0]?.message?.content || '';
  }

  async repairJSON(malformedJson: string): Promise<string> {
    const prompt = PromptManager.getRepairPrompt();
    const response = await withTimeout(
      this.client.chat.completions.create({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: `${prompt}\n\n${malformedJson}`,
        }],
      }),
      config.llmTimeoutMs
    );
    return response.choices[0]?.message?.content || '';
  }

  async validate(documents: object[]): Promise<string> {
    const prompt = PromptManager.getValidationPrompt(documents);
    const response = await withTimeout(
      this.client.chat.completions.create({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: prompt,
        }],
      }),
      config.llmTimeoutMs
    );
    return response.choices[0]?.message?.content || '';
  }
}
