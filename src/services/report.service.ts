import { extractionRepo } from '../db/repositories/extraction.repo';
import { sessionRepo } from '../db/repositories/session.repo';
import { jobRepo } from '../db/repositories/job.repo';
import { getLatestValidation } from './validation.service';
import { type Extraction } from '@prisma/client';
import { OverallHealth } from '../types';

function computeOverallHealth(extractions: Extraction[]): OverallHealth {
  const completed = extractions.filter((e) => e.status === 'COMPLETE');

  for (const e of completed) {
    const flags = (e.flagsJson as Array<{ severity: string }>) ?? [];
    if (flags.some((f) => f.severity === 'CRITICAL')) return 'CRITICAL';
    if (e.isExpired) return 'CRITICAL';
  }

  for (const e of completed) {
    const flags = (e.flagsJson as Array<{ severity: string }>) ?? [];
    if (flags.some((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM')) return 'WARN';
    const validity = e.validityJson as { daysUntilExpiry?: number | null } | null;
    if (validity?.daysUntilExpiry != null && validity.daysUntilExpiry <= 90) return 'WARN';
  }

  return 'OK';
}

function detectRole(extractions: Extraction[]): string {
  const roles = extractions.map((e) => e.applicableRole).filter(Boolean) as string[];
  const deck = roles.filter((r) => r === 'DECK').length;
  const engine = roles.filter((r) => r === 'ENGINE').length;
  if (deck > engine) return 'DECK';
  if (engine > deck) return 'ENGINE';
  if (deck > 0) return 'BOTH';
  return 'UNKNOWN';
}

function resolveHolderProfile(extractions: Extraction[]) {
  // Pick the most common non-null value for each field
  const pick = (arr: (string | null | undefined)[]): string | null => {
    const vals = arr.filter(Boolean) as string[];
    if (!vals.length) return null;
    const freq = vals.reduce<Record<string, number>>((acc, v) => {
      acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  };

  return {
    name: pick(extractions.map((e) => e.holderName)),
    dateOfBirth: pick(extractions.map((e) => e.dateOfBirth)),
    sirbNumber: pick(extractions.map((e) => e.sirbNumber)),
    passportNumber: pick(extractions.map((e) => e.passportNumber)),
    nationality: pick(extractions.map((e) => e.holderNationality)),
    rank: pick(extractions.map((e) => e.holderRank)),
  };
}

export async function buildReport(sessionId: string) {
  const session = await sessionRepo.findById(sessionId);
  if (!session) return null;

  const [extractions, pendingJobs, validation] = await Promise.all([
    extractionRepo.findBySessionId(sessionId),
    jobRepo.findBySessionId(sessionId),
    getLatestValidation(sessionId),
  ]);

  const completed = extractions.filter((e) => e.status === 'COMPLETE');
  const failed = extractions.filter((e) => e.status === 'FAILED');
  const expired = completed.filter((e) => e.isExpired);

  const allFlags = completed.flatMap(
    (e) => (e.flagsJson as Array<{ severity: string; message: string }>) ?? [],
  );

  const criticalIssues = allFlags.filter((f) => f.severity === 'CRITICAL');
  const warnings = allFlags.filter((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM');

  const expiringSoon = completed.filter((e) => {
    const v = e.validityJson as { daysUntilExpiry?: number | null } | null;
    return v?.daysUntilExpiry != null && v.daysUntilExpiry <= 90 && !e.isExpired;
  });

  return {
    sessionId,
    generatedAt: new Date().toISOString(),
    holderProfile: resolveHolderProfile(completed),
    role: detectRole(extractions),
    overallHealth: computeOverallHealth(extractions),
    overallDecision: validation?.overallStatus ?? 'PENDING_VALIDATION',
    overallScore: validation?.overallScore ?? null,
    documentSummary: {
      total: extractions.length,
      complete: completed.length,
      failed: failed.length,
      expired: expired.length,
      expiringSoon: expiringSoon.length,
    },
    documents: completed.map((e) => ({
      id: e.id,
      fileName: e.fileName,
      documentType: e.documentType,
      documentName: e.documentName,
      category: e.category,
      applicableRole: e.applicableRole,
      confidence: e.confidence,
      holderName: e.holderName,
      isExpired: e.isExpired,
      validity: e.validityJson,
      flagCount: ((e.flagsJson as unknown[]) ?? []).length,
      criticalFlagCount: (
        (e.flagsJson as Array<{ severity: string }>) ?? []
      ).filter((f) => f.severity === 'CRITICAL').length,
      summary: e.summary,
      createdAt: e.createdAt,
    })),
    criticalIssues,
    warnings,
    medicalStatus: (() => {
      const peme = completed.find((e) => e.documentType === 'PEME');
      const drug = completed.find((e) => e.documentType === 'DRUG_TEST');
      const yf = completed.find((e) => e.documentType === 'YELLOW_FEVER');
      const pemeData = peme?.medicalDataJson as {
        fitnessResult?: string;
        restrictions?: string;
        expiryDate?: string;
      } | null;
      const drugData = drug?.medicalDataJson as { drugTestResult?: string } | null;
      return {
        pemePresent: !!peme,
        pemeFitness: pemeData?.fitnessResult ?? null,
        pemeExpiry: pemeData?.expiryDate ?? null,
        pemeExpired: peme?.isExpired ?? null,
        restrictions: pemeData?.restrictions ?? null,
        drugTestPresent: !!drug,
        drugTestResult: drugData?.drugTestResult ?? null,
        yellowFeverPresent: !!yf,
        yellowFeverExpired: yf?.isExpired ?? null,
      };
    })(),
    validationSummary: validation
      ? {
          overallStatus: validation.overallStatus,
          overallScore: validation.overallScore,
          summary: validation.summary,
          missingDocuments: validation.missingDocuments,
          recommendations: validation.recommendations,
          validatedAt: validation.validatedAt,
        }
      : null,
    pendingJobs: pendingJobs.map((j) => ({
      jobId: j.id,
      status: j.status,
      queuedAt: j.queuedAt,
    })),
  };
}
