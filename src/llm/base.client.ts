export abstract class BaseLlmClient {
  abstract extract(base64File: string, mimeType: string): Promise<string>;
  abstract extractWithHints(base64File: string, mimeType: string, fileName: string): Promise<string>;
  abstract repairJSON(malformedJson: string): Promise<string>;
  abstract validate(documents: object[]): Promise<string>;
}
