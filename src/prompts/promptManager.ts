import fs from 'fs';
import path from 'path';

export class PromptManager {
  static getExtractionPrompt(): string {
    return fs.readFileSync(path.join(__dirname, 'extraction.prompt.txt'), 'utf-8');
  }

  static getRepairPrompt(): string {
    return fs.readFileSync(path.join(__dirname, 'repair.prompt.txt'), 'utf-8');
  }

  static getValidationPrompt(documents: object[]): string {
    const docJson = JSON.stringify(documents, null, 2);
    return `You are a senior maritime compliance officer reviewing a seafarer's complete certification package.

The following JSON array contains extracted data from multiple maritime documents belonging to a single seafarer. Each document has already been individually analyzed and structured.

Your task is to perform a comprehensive CROSS-DOCUMENT compliance assessment.

Documents for review:
${docJson}

Perform the following checks:

1. IDENTITY CONSISTENCY: Verify the holder's full name, date of birth, SIRB number, and passport number are consistent across all documents. Flag any discrepancies.

2. ROLE DETERMINATION: Based on the documents, determine the seafarer's role (DECK or ENGINE officer). Flag any role conflicts.

3. COMPLETENESS ASSESSMENT: Based on the detected role, identify required documents that appear to be missing. For DECK officers, minimum requirements include: COC, SIRB, PEME, and basic STCW endorsements. For ENGINE officers: COC, SIRB, PEME, and relevant engineering endorsements.

4. EXPIRY ASSESSMENT: For each document with a validity period, assess expiry status. Flag documents expiring within 90 days as HIGH severity and within 30 days as CRITICAL.

5. MEDICAL COMPLIANCE: Check that PEME is valid, drug test is NEGATIVE, yellow fever is current if applicable. Flag any UNFIT or POSITIVE results as CRITICAL.

6. ANOMALIES: Flag suspicious patterns — identical issue dates across certificates, documents from unrecognized authorities, rank inconsistencies.

7. SCORING: Assign an overall compliance score from 0–100. 90–100: excellent. 70–89: good with minor gaps. 50–69: conditional. Below 50: rejected.

8. DECISION:
   - APPROVED: All critical documents present and valid, no critical flags
   - CONDITIONAL: Minor gaps or warnings that can be resolved
   - REJECTED: Critical documents missing or expired, or critical compliance failures

Return ONLY a valid JSON object. No markdown. No code fences. No preamble.

{
  "holderProfile": {
    "resolvedName": "string",
    "resolvedDateOfBirth": "string or null",
    "resolvedSirbNumber": "string or null",
    "resolvedPassportNumber": "string or null",
    "resolvedNationality": "string or null",
    "resolvedRank": "string or null",
    "detectedRole": "DECK | ENGINE | BOTH | UNKNOWN"
  },
  "consistencyChecks": [
    {
      "field": "holderName | dateOfBirth | sirbNumber | passportNumber",
      "status": "CONSISTENT | INCONSISTENT | MISSING",
      "values": ["value1", "value2"],
      "message": "Brief description"
    }
  ],
  "missingDocuments": [
    {
      "documentType": "COC",
      "documentName": "Certificate of Competency",
      "severity": "CRITICAL | HIGH | MEDIUM",
      "reason": "Why required for this role"
    }
  ],
  "expiringDocuments": [
    {
      "extractionId": "id from input document",
      "documentType": "string",
      "documentName": "string",
      "expiryDate": "string",
      "daysUntilExpiry": 0,
      "severity": "CRITICAL | HIGH | MEDIUM | LOW"
    }
  ],
  "medicalFlags": [
    {
      "extractionId": "id from input document",
      "type": "PEME_EXPIRY | DRUG_TEST | FITNESS | YELLOW_FEVER | RESTRICTION",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "message": "string"
    }
  ],
  "overallStatus": "APPROVED | CONDITIONAL | REJECTED",
  "overallScore": 85,
  "summary": "Two to three sentence plain English summary of compliance status and key findings.",
  "recommendations": [
    "Specific actionable recommendation"
  ],
  "validatedAt": "${new Date().toISOString()}"
}`;
  }
}
