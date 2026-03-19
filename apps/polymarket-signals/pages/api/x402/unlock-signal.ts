import type { NextApiRequest, NextApiResponse } from "next";

import { resolveRuntimeConfig } from "@/server/config";
import { badRequest, requireMethod } from "@/server/http/api";
import { DEMO_WALLET_ADDRESS } from "@/server/repository/demo-store";
import { resolveSignalStore } from "@/server/repository/store";
import { getSignalDetailView } from "@/server/read-models/signals";

interface UnlockSignalBody {
  signalId?: string;
  walletAddress?: string;
  paymentAmount?: string;
  paymentNetwork?: string;
  paymentToken?: string;
  treasuryAddress?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "POST")) {
    return;
  }

  const body = (req.body ?? {}) as UnlockSignalBody;

  if (!body.signalId) {
    badRequest(res, "signalId is required");
    return;
  }

  const walletAddress = body.walletAddress ?? DEMO_WALLET_ADDRESS;
  const config = resolveRuntimeConfig(process.env);
  const store = resolveSignalStore();
  const { purchase, grant } = await store.createPurchaseAndGrant({
    walletAddress,
    signalId: body.signalId,
    paymentAmount: body.paymentAmount ?? "1 signal unlock",
    paymentNetwork: body.paymentNetwork ?? config.payment.network,
    paymentToken: body.paymentToken ?? config.payment.token,
    treasuryAddress: body.treasuryAddress ?? config.payment.treasuryAddress,
  });

  res.status(200).json({
    purchase,
    grant,
    signal: await getSignalDetailView(body.signalId, walletAddress, { store }),
  });
}
