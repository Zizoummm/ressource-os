/** Future evidence providers: these contracts do not claim a live integration. */
export type EvidenceProvider =
  | "GOVERNMENT_REGISTRY"
  | "CUSTOMS"
  | "BANK"
  | "INSPECTOR"
  | "TERMINAL"
  | "TREASURY"
  | "AXIOM_VERIFY"
  | "AXIOM_PORTOS"
  | "AXIOM_LOGISTICSOS"
  | "AXIOM_GOVOS";
export interface ExternalEvidence {
  provider: EvidenceProvider;
  sourceReference: string;
  subjectId: string;
  observedAt: string;
  expiresAt: string;
  provenance: "EXTERNAL_VERIFIED" | "MANUAL_ATTESTATION" | "SIMULATED";
  status: "CONFIRMED" | "REJECTED" | "UNAVAILABLE";
  evidenceDigest: string;
}
export interface EvidenceProviderAdapter {
  readonly provider: EvidenceProvider;
  verify(subjectId: string, sourceReference: string): Promise<ExternalEvidence>;
}
