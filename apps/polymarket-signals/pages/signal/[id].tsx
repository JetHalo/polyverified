import type { GetServerSidePropsContext } from "next";

import PredictionDetail from "@/pages/PredictionDetail";
import { loadSignalDetailPageProps } from "@/server/page-loaders";

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const signalId = context.params?.id;
  const walletAddress = context.query.walletAddress;
  const normalizedSignalId = Array.isArray(signalId) ? signalId[0] : signalId;
  const normalizedWalletAddress = Array.isArray(walletAddress) ? walletAddress[0] : walletAddress;

  if (!normalizedSignalId) {
    return { notFound: true as const };
  }

  return loadSignalDetailPageProps({
    req: context.req,
    signalId: normalizedSignalId,
    walletAddress: normalizedWalletAddress,
  });
}

export default PredictionDetail;
