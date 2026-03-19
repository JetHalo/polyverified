import { randomUUID } from "node:crypto";

import type { RuntimeConfig } from "@/server/types";
import type { PaymentConfig } from "@/server/types";

export interface UnlockQuote {
  signalId: string;
  network: string;
  token: string;
  displayAmount: string;
  tokenAmountAtomic: string | null;
  tokenAddress: string | null;
  tokenDecimals: number | null;
  eip712Name: string | null;
  eip712Version: string | null;
  treasuryAddress: string;
  mode: "single-signal";
}

export interface PaidUnlockInput {
  walletAddress: string;
  signalId: string;
  paymentAmount: string;
  paymentNetwork: string;
  paymentToken: string;
  treasuryAddress: string;
  paymentTxHash?: string | null;
  paymentPayer?: string | null;
  paymentScheme?: string;
  purchaseId?: string;
  grantId?: string;
}

export interface PurchaseRecordInput {
  purchaseId: string;
  walletAddress: string;
  signalId: string;
  paymentNetwork: string;
  paymentToken: string;
  paymentAmount: string;
  paymentStatus: "confirmed";
  paymentScheme: string;
  paymentTxHash: string | null;
  paymentPayer: string | null;
  treasuryAddress: string;
  createdAt: string;
}

export interface AccessGrantInput {
  grantId: string;
  walletAddress: string;
  signalId: string;
  purchaseId: string;
  createdAt: string;
}

function formatAtomicTokenAmount(value: string, decimals: number) {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return normalized;
  }

  if (decimals <= 0) {
    return normalized;
  }

  const padded = normalized.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fractional = padded.slice(-decimals).replace(/0+$/, "");

  return fractional ? `${whole}.${fractional}` : whole;
}

export function resolveConfiguredPaymentAmountLabel(payment: PaymentConfig) {
  if (payment.tokenAmountAtomic && typeof payment.tokenDecimals === "number") {
    return `${formatAtomicTokenAmount(payment.tokenAmountAtomic, payment.tokenDecimals)} ${payment.token}`;
  }

  return payment.displayAmount;
}

export function normalizeStoredPaymentAmount(
  paymentAmount: string | null | undefined,
  paymentToken: string,
  payment: PaymentConfig,
) {
  const fallbackLabel = resolveConfiguredPaymentAmountLabel({
    ...payment,
    token: paymentToken || payment.token,
  });
  const value = paymentAmount?.trim() ?? "";

  if (!value) {
    return fallbackLabel;
  }

  if (value === payment.displayAmount.trim()) {
    return fallbackLabel;
  }

  if (/^[\d.$]+$/.test(value)) {
    return fallbackLabel;
  }

  return value;
}

export function buildSingleSignalUnlockQuote(signalId: string, config: RuntimeConfig): UnlockQuote {
  return {
    signalId,
    network: config.payment.network,
    token: config.payment.token,
    displayAmount: resolveConfiguredPaymentAmountLabel(config.payment),
    tokenAmountAtomic: config.payment.tokenAmountAtomic,
    tokenAddress: config.payment.tokenAddress,
    tokenDecimals: config.payment.tokenDecimals,
    eip712Name: config.payment.eip712Name,
    eip712Version: config.payment.eip712Version,
    treasuryAddress: config.payment.treasuryAddress,
    mode: config.payment.mode,
  };
}

export function createAccessGrantFromPayment(
  input: PaidUnlockInput,
  options: {
    now?: Date;
    randomId?: () => string;
  } = {},
): { purchase: PurchaseRecordInput; grant: AccessGrantInput } {
  const now = (options.now ?? new Date()).toISOString();
  const nextId = options.randomId ?? randomUUID;
  const purchaseId = input.purchaseId ?? nextId();
  const grantId = input.grantId ?? nextId();

  return {
    purchase: {
      purchaseId,
      walletAddress: input.walletAddress,
      signalId: input.signalId,
      paymentNetwork: input.paymentNetwork,
      paymentToken: input.paymentToken,
      paymentAmount: input.paymentAmount,
      paymentStatus: "confirmed",
      paymentScheme: input.paymentScheme ?? "x402-exact-evm",
      paymentTxHash: input.paymentTxHash ?? null,
      paymentPayer: input.paymentPayer ?? null,
      treasuryAddress: input.treasuryAddress,
      createdAt: now,
    },
    grant: {
      grantId,
      walletAddress: input.walletAddress,
      signalId: input.signalId,
      purchaseId,
      createdAt: now,
    },
  };
}
