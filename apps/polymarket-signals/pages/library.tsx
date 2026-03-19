import type { GetServerSidePropsContext } from "next";

import MyLibrary from "@/pages/MyLibrary";
import { loadLibraryPageProps } from "@/server/page-loaders";

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const walletAddress = context.query.walletAddress;
  const normalizedWalletAddress = Array.isArray(walletAddress) ? walletAddress[0] : walletAddress;

  return loadLibraryPageProps({
    req: context.req,
    walletAddress: normalizedWalletAddress,
  });
}

export default MyLibrary;
