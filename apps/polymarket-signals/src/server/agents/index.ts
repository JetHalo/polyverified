import type { AgentSlug } from "@/server/types";
import type { SignalAgent } from "@/server/agents/types";
import { btcHourlyAgent } from "@/server/agents/btc-hourly";
import { ethHourlyAgent } from "@/server/agents/eth-hourly";
import { goldDailyAgent } from "@/server/agents/gold-daily";
import { silverDailyAgent } from "@/server/agents/silver-daily";

const AGENTS: Record<AgentSlug, SignalAgent> = {
  "btc-hourly": btcHourlyAgent,
  "eth-hourly": ethHourlyAgent,
  "gold-daily": goldDailyAgent,
  "silver-daily": silverDailyAgent,
};

export function listAgents(): SignalAgent[] {
  return Object.values(AGENTS);
}

export function getAgentBySlug(slug: AgentSlug): SignalAgent {
  return AGENTS[slug];
}
