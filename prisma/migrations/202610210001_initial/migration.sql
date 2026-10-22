-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "beneficialOwners" TEXT NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "roles" TEXT[],

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL DEFAULT 'PETROLEUM',
    "location" TEXT NOT NULL,
    "authorized" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ResourceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'bbl',
    "storage" TEXT NOT NULL,
    "productionDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyEvent" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fromLocation" TEXT NOT NULL,
    "toLocation" TEXT NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "actorId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cargo" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "value" DECIMAL(24,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "terminal" TEXT NOT NULL,
    "vessel" TEXT NOT NULL,
    "shipmentDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "testOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoAllocation" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CargoAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counterparty" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "beneficialOwners" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Counterparty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeContract" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "price" DECIMAL(24,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "incoterm" TEXT NOT NULL,
    "paymentTerms" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DECLARED',
    "reviewerId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "inspectorOrganizationId" TEXT NOT NULL,
    "measuredQuantity" DECIMAL(24,6) NOT NULL,
    "quality" TEXT NOT NULL,
    "samplingReference" TEXT NOT NULL,
    "reportReference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceDocument" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT 'SELF_DECLARED',
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationDecision" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT 'SIMULATED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceRecord" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "insurer" TEXT NOT NULL,
    "coverage" DECIMAL(24,2) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,

    CONSTRAINT "InsuranceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuaranteeRecord" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "amount" DECIMAL(24,2) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,

    CONSTRAINT "GuaranteeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryDeposit" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "rate" DECIMAL(8,6) NOT NULL,
    "required" DECIMAL(24,2) NOT NULL,
    "declared" DECIMAL(24,2) NOT NULL,
    "confirmed" DECIMAL(24,2) NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalAssessment" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "royaltyRate" DECIMAL(8,6) NOT NULL,
    "dutyRate" DECIMAL(8,6) NOT NULL,
    "otherRate" DECIMAL(8,6) NOT NULL,
    "assessed" DECIMAL(24,2) NOT NULL,
    "documentedPaid" DECIMAL(24,2) NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseToken" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "issuerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskFlag" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "tenantId" TEXT NOT NULL,
    "depositRate" DECIMAL(8,6) NOT NULL DEFAULT 0.01,
    "royaltyRate" DECIMAL(8,6) NOT NULL DEFAULT 0.05,
    "dutyRate" DECIMAL(8,6) NOT NULL DEFAULT 0.02,
    "otherRate" DECIMAL(8,6) NOT NULL DEFAULT 0,
    "discrepancyRate" DECIMAL(8,6) NOT NULL DEFAULT 0.02,
    "tokenMinutes" INTEGER NOT NULL DEFAULT 15,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_registration_key" ON "Organization"("registration");

-- CreateIndex
CREATE INDEX "Organization_tenantId_idx" ON "Organization"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_userId_organizationId_key" ON "OrganizationMembership"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "License_reference_key" ON "License"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_resourceId_key" ON "ProductionBatch"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Cargo_reference_key" ON "Cargo"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Counterparty_registration_key" ON "Counterparty"("registration");

-- CreateIndex
CREATE UNIQUE INDEX "TradeContract_cargoId_key" ON "TradeContract"("cargoId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeContract_reference_key" ON "TradeContract"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceDocument_storageKey_key" ON "EvidenceDocument"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationDecision_cargoId_kind_key" ON "VerificationDecision"("cargoId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceRecord_cargoId_key" ON "InsuranceRecord"("cargoId");

-- CreateIndex
CREATE UNIQUE INDEX "GuaranteeRecord_cargoId_key" ON "GuaranteeRecord"("cargoId");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryDeposit_cargoId_key" ON "TreasuryDeposit"("cargoId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalAssessment_cargoId_key" ON "FiscalAssessment"("cargoId");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseToken_token_key" ON "ReleaseToken"("token");

-- CreateIndex
CREATE INDEX "ReleaseToken_cargoId_version_idx" ON "ReleaseToken"("cargoId", "version");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiskFlag_cargoId_kind_key" ON "RiskFlag"("cargoId", "kind");

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAsset" ADD CONSTRAINT "ResourceAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ResourceAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cargo" ADD CONSTRAINT "Cargo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoAllocation" ADD CONSTRAINT "CargoAllocation_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoAllocation" ADD CONSTRAINT "CargoAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeContract" ADD CONSTRAINT "TradeContract_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeContract" ADD CONSTRAINT "TradeContract_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Counterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceDocument" ADD CONSTRAINT "EvidenceDocument_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationDecision" ADD CONSTRAINT "VerificationDecision_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceRecord" ADD CONSTRAINT "InsuranceRecord_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuaranteeRecord" ADD CONSTRAINT "GuaranteeRecord_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryDeposit" ADD CONSTRAINT "TreasuryDeposit_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalAssessment" ADD CONSTRAINT "FiscalAssessment_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseToken" ADD CONSTRAINT "ReleaseToken_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskFlag" ADD CONSTRAINT "RiskFlag_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Invariants enforced in addition to serializable application transactions.
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "batch_positive_quantity" CHECK (quantity > 0);
ALTER TABLE "Cargo" ADD CONSTRAINT "cargo_positive_amounts" CHECK (quantity > 0 AND value > 0);
ALTER TABLE "CargoAllocation" ADD CONSTRAINT "allocation_positive_quantity" CHECK (quantity > 0);
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "movement_positive_quantity" CHECK (quantity > 0 AND "fromLocation" <> "toLocation");
ALTER TABLE "TreasuryDeposit" ADD CONSTRAINT "deposit_nonnegative" CHECK (required >= 0 AND declared >= 0 AND confirmed >= 0 AND confirmed <= declared);
ALTER TABLE "FiscalAssessment" ADD CONSTRAINT "fiscal_nonnegative" CHECK (assessed >= 0 AND "documentedPaid" >= 0);
ALTER TABLE "Policy" ADD CONSTRAINT "policy_demonstration_ranges" CHECK ("depositRate" BETWEEN 0.005 AND 0.02 AND "royaltyRate" BETWEEN 0 AND 1 AND "dutyRate" BETWEEN 0 AND 1 AND "otherRate" BETWEEN 0 AND 1 AND "discrepancyRate" BETWEEN 0 AND 0.1 AND "tokenMinutes" BETWEEN 1 AND 60);
CREATE UNIQUE INDEX "one_unrevoked_token_per_version" ON "ReleaseToken" ("cargoId", "version") WHERE "revokedAt" IS NULL;
CREATE FUNCTION resourceos_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Append-only record: corrections require a new event'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION resourceos_append_only();
CREATE TRIGGER custody_append_only BEFORE UPDATE OR DELETE ON "CustodyEvent" FOR EACH ROW EXECUTE FUNCTION resourceos_append_only();
