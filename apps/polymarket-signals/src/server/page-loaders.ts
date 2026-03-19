import type { IncomingMessage } from "node:http";

import { resolveWalletAddressFromRequest } from "@/server/auth/service";
import { getAgentHubView, getAgentProfileView } from "@/server/read-models/agents";
import { getFeedView } from "@/server/read-models/feed";
import { getHistoryView } from "@/server/read-models/history";
import { getLibraryView } from "@/server/read-models/library";
import { getSignalDetailView } from "@/server/read-models/signals";
import type { AgentSlug } from "@/server/types";

function sanitizeForNext<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function loadFeedPageProps() {
  return {
    props: {
      initialView: sanitizeForNext(await getFeedView()),
    },
  };
}

export async function loadHistoryPageProps() {
  return {
    props: {
      initialView: sanitizeForNext(await getHistoryView()),
    },
  };
}

export async function loadAgentHubPageProps() {
  return {
    props: {
      initialView: sanitizeForNext(await getAgentHubView()),
    },
  };
}

export async function loadAgentProfilePageProps(slug: AgentSlug) {
  const initialView = await getAgentProfileView(slug);

  if (!initialView) {
    return { notFound: true as const };
  }

  return {
    props: {
      initialSlug: slug,
      initialView: sanitizeForNext(initialView),
    },
  };
}

export async function loadLibraryPageProps(input: {
  req?: IncomingMessage;
  walletAddress?: string | null;
}) {
  const walletAddress = input.req
    ? await resolveWalletAddressFromRequest(input.req, input.walletAddress)
    : input.walletAddress ?? null;

  return {
    props: {
      initialWalletAddress: walletAddress,
      initialView: sanitizeForNext(await getLibraryView(walletAddress)),
    },
  };
}

export async function loadSignalDetailPageProps(input: {
  req?: IncomingMessage;
  signalId: string;
  walletAddress?: string | null;
}) {
  const walletAddress = input.req
    ? await resolveWalletAddressFromRequest(input.req, input.walletAddress)
    : input.walletAddress ?? null;
  const initialView = await getSignalDetailView(input.signalId, walletAddress);

  if (!initialView) {
    return { notFound: true as const };
  }

  return {
    props: {
      initialSignalId: input.signalId,
      initialWalletAddress: walletAddress,
      initialView: sanitizeForNext(initialView),
    },
  };
}
