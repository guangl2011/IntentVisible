-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('AUTO_APPROVE', 'REQUIRE_APPROVAL', 'DENY');

-- CreateEnum
CREATE TYPE "IntentStatus" AS ENUM ('DECLARED', 'PENDING_APPROVAL', 'APPROVED', 'DENIED', 'EXPIRED', 'EXECUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('policy', 'human', 'agent', 'system');

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "agentId" TEXT,
    "actionType" TEXT,
    "maxRiskLevel" "RiskLevel",
    "verdict" "Verdict" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intent" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "IntentStatus" NOT NULL DEFAULT 'DECLARED',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "outcome" "Outcome",
    "outcomeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Intent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentAudit" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "fromStatus" "IntentStatus" NOT NULL,
    "toStatus" "IntentStatus" NOT NULL,
    "actor" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_name_key" ON "Agent"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_keyHash_key" ON "Agent"("keyHash");

-- CreateIndex
CREATE INDEX "Intent_status_createdAt_idx" ON "Intent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IntentAudit_intentId_idx" ON "IntentAudit"("intentId");

-- AddForeignKey
ALTER TABLE "PolicyRule" ADD CONSTRAINT "PolicyRule_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intent" ADD CONSTRAINT "Intent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentAudit" ADD CONSTRAINT "IntentAudit_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

