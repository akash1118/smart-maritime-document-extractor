export type DocumentType =
  | 'COC' | 'COP_BT' | 'COP_PSCRB' | 'COP_AFF' | 'COP_MEFA' | 'COP_MECA' | 'COP_SSO' | 'COP_SDSD'
  | 'ECDIS_GENERIC' | 'ECDIS_TYPE' | 'SIRB' | 'PASSPORT' | 'PEME' | 'DRUG_TEST' | 'YELLOW_FEVER'
  | 'ERM' | 'MARPOL' | 'SULPHUR_CAP' | 'BALLAST_WATER' | 'HATCH_COVER' | 'BRM_SSBT'
  | 'TRAIN_TRAINER' | 'HAZMAT' | 'FLAG_STATE' | 'OTHER';

export type DocumentCategory =
  | 'IDENTITY' | 'CERTIFICATION' | 'STCW_ENDORSEMENT' | 'MEDICAL' | 'TRAINING' | 'FLAG_STATE' | 'OTHER';

export type ApplicableRole = 'DECK' | 'ENGINE' | 'BOTH' | 'N/A';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'FAILED';

export type ExtractionStatus = 'COMPLETE' | 'FAILED';

export type OverallHealth = 'OK' | 'WARN' | 'CRITICAL';

export type ValidationStatus = 'APPROVED' | 'CONDITIONAL' | 'REJECTED';

export type FlagSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ExtractionFlag {
  severity: FlagSeverity;
  message: string;
}

export interface ExtractionField {
  key: string;
  label: string;
  value: string;
  importance: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OK' | 'EXPIRED' | 'WARNING' | 'MISSING' | 'N/A';
}

export interface LlmExtractionResult {
  detection: {
    documentType: DocumentType;
    documentName: string;
    category: DocumentCategory;
    applicableRole: ApplicableRole;
    isRequired: boolean;
    confidence: Confidence;
    detectionReason: string;
  };
  holder: {
    fullName: string | null;
    dateOfBirth: string | null;
    nationality: string | null;
    passportNumber: string | null;
    sirbNumber: string | null;
    rank: string | null;
    photo: 'PRESENT' | 'ABSENT';
  };
  fields: ExtractionField[];
  validity: {
    dateOfIssue: string | null;
    dateOfExpiry: string | 'No Expiry' | 'Lifetime' | null;
    isExpired: boolean;
    daysUntilExpiry: number | null;
    revalidationRequired: boolean | null;
  };
  compliance: {
    issuingAuthority: string;
    regulationReference: string | null;
    imoModelCourse: string | null;
    recognizedAuthority: boolean;
    limitations: string | null;
  };
  medicalData: {
    fitnessResult: 'FIT' | 'UNFIT' | 'N/A';
    drugTestResult: 'NEGATIVE' | 'POSITIVE' | 'N/A';
    restrictions: string | null;
    specialNotes: string | null;
    expiryDate: string | null;
  };
  flags: ExtractionFlag[];
  summary: string;
}

export interface LlmValidationResult {
  holderProfile: {
    resolvedName: string;
    resolvedDateOfBirth: string | null;
    resolvedSirbNumber: string | null;
    resolvedPassportNumber: string | null;
    resolvedNationality: string | null;
    resolvedRank: string | null;
    detectedRole: 'DECK' | 'ENGINE' | 'BOTH' | 'UNKNOWN';
  };
  consistencyChecks: Array<{
    field: string;
    status: 'CONSISTENT' | 'INCONSISTENT' | 'MISSING';
    values: string[];
    message: string;
  }>;
  missingDocuments: Array<{
    documentType: string;
    documentName: string;
    severity: FlagSeverity;
    reason: string;
  }>;
  expiringDocuments: Array<{
    extractionId: string;
    documentType: string;
    documentName: string;
    expiryDate: string;
    daysUntilExpiry: number;
    severity: FlagSeverity;
  }>;
  medicalFlags: Array<{
    extractionId: string;
    type: string;
    severity: FlagSeverity;
    message: string;
  }>;
  overallStatus: ValidationStatus;
  overallScore: number;
  summary: string;
  recommendations: string[];
  validatedAt: string;
}

export interface AppErrorPayload {
  error: string;
  message: string;
  extractionId?: string;
  retryAfterMs?: number | null;
}
