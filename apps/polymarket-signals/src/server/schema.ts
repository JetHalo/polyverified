import { z } from "zod";

export const marketTypeSchema = z.enum(["BTC Hourly", "ETH Hourly", "Gold Daily", "Silver Daily"]);
export const agentSlugSchema = z.enum(["btc-hourly", "eth-hourly", "gold-daily", "silver-daily"]);
export const directionSchema = z.enum(["Up", "Down"]);
export const proofStateSchema = z.enum(["committed", "revealed", "verified", "failed"]);
export const commitmentHashModeSchema = z.enum(["sha256-decimal-v1", "poseidon2-field-v1"]);

export const marketSnapshotSchema = z.object({
  marketId: z.string().min(1),
  marketType: marketTypeSchema,
  opensAt: z.string().datetime(),
  resolvesAt: z.string().datetime(),
  upPriceCents: z.number().int().min(0).max(100),
  downPriceCents: z.number().int().min(0).max(100),
  upAskPriceCents: z.number().int().min(0).max(100).nullable().optional(),
  downAskPriceCents: z.number().int().min(0).max(100).nullable().optional(),
  spreadBps: z.number().int().nonnegative(),
  liquidityUsd: z.number().nonnegative(),
  existingSignalId: z.string().nullable(),
});

export const signalRecordSchema = z.object({
  signalId: z.string().min(1),
  agentSlug: agentSlugSchema,
  marketId: z.string().min(1),
  marketType: marketTypeSchema,
  direction: directionSchema,
  entryPriceCents: z.number().int().min(10).max(90),
  predictedAt: z.string().datetime(),
  resolvesAt: z.string().datetime(),
  commitment: z.string().min(1),
  commitmentHashMode: commitmentHashModeSchema,
  commitmentStatus: proofStateSchema,
  isPremium: z.boolean(),
});
