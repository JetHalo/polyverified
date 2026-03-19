import { NextResponse, type NextRequest } from "next/server";
import { withX402FromHTTPServer } from "@x402/next";

import { getProtectedSignalHttpServer } from "@/server/x402/server";
import { resolveSignalStore } from "@/server/repository/store";
import { buildUnlockedSignalDetailView } from "@/server/read-models/signals";

export const runtime = "nodejs";

const handler = async (request: NextRequest): Promise<NextResponse<unknown>> => {
  const signalId = request.nextUrl.searchParams.get("signalId");

  if (!signalId) {
    return NextResponse.json({ error: "signalId is required" }, { status: 400 });
  }

  const store = resolveSignalStore();
  const signal = await store.getSignalById(signalId);

  if (!signal) {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  }

  return NextResponse.json({
    signal: buildUnlockedSignalDetailView(signal),
  });
};

export async function GET(request: NextRequest) {
  try {
    return await withX402FromHTTPServer(handler, getProtectedSignalHttpServer())(request);
  } catch (error) {
    console.error("x402 premium route failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "x402 premium route failed",
      },
      { status: 500 },
    );
  }
}
