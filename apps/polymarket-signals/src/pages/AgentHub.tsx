import { Link } from "@/lib/router";
import { PageShell } from "@/components/PageShell";
import { Cpu, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revealedHistory, simulatedReturn, type Market } from "@/lib/mock-data";
import { assetLabel, marketLabel, useLanguage } from "@/lib/language";
import type { getAgentHubView } from "@/server/read-models/agents";

const agents: { market: Market; slug: string }[] = [
  { market: "BTC Hourly", slug: "btc-hourly" },
  { market: "ETH Hourly", slug: "eth-hourly" },
  { market: "Gold Daily", slug: "gold-daily" },
  { market: "Silver Daily", slug: "silver-daily" },
];

function getMarketStats(market: Market) {
  const signals = revealedHistory.filter((signal) => signal.market === market);
  const total = signals.length;
  const wins = signals.filter((signal) => signal.outcome === "win").length;
  const hitRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";
  let pnl = 0;
  signals.forEach((signal) => {
    const simulated = simulatedReturn(signal);
    if (simulated !== null) pnl += simulated;
  });
  return { total, hitRate, pnl };
}

type AgentHubView = Awaited<ReturnType<typeof getAgentHubView>>;

export default function AgentHub({ initialView }: { initialView?: AgentHubView }) {
  const { language, t } = useLanguage();
  const viewAgents = initialView?.agents;

  return (
    <PageShell
      title="Agent Hub"
      subtitle={t({
        en: "Specialized prediction engines, each focused on a single market with proof-backed performance.",
        zh: "按市场拆分的专用预测 Agent，每个 Agent 都有可验证的历史表现。",
      })}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(viewAgents ?? agents).map((agent) => {
          const marketType = "marketType" in agent ? agent.marketType : agent.market;
          const slug = agent.slug;
          const displayName = "displayName" in agent ? agent.displayName : `${marketLabel(agent.market, language)} Agent`;
          const stats =
            "totalSignals" in agent
              ? {
                  total: agent.totalSignals,
                  hitRate: agent.hitRatePct.toFixed(1),
                  pnl: 0,
                  roi: agent.simulatedRoiPct,
                }
              : getMarketStats(agent.market);
          const asset = assetLabel(marketType, language);
          const market = marketLabel(marketType, language);
          const description = t({
            en: `Directional predictions on ${asset} ${marketType.includes("Hourly") ? "hourly" : "daily"} resolution markets.`,
            zh: `专注于 ${market} 市场的方向性预测，并持续输出可验证结果。`,
          });
          const totalSignals = "totalSignals" in agent ? agent.totalSignals : stats.total;
          const hitRate = "hitRatePct" in agent ? agent.hitRatePct.toFixed(1) : stats.hitRate;
          const simulatedRoiPct = "simulatedRoiPct" in agent ? agent.simulatedRoiPct : 0;

          return (
            <div key={slug} className="flex flex-col rounded-xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                  <Cpu className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold tracking-tight text-foreground">{displayName}</h3>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-signal-verified/15 px-2 py-0.5 text-[10px] font-semibold text-signal-verified">
                  <ShieldCheck className="h-3 w-3" />
                  {t({ en: "zkVerified", zh: "zkVerified" })}
                </span>
              </div>

              <div className="mb-5 grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="text-[10px] text-muted-foreground">{t({ en: "Signals", zh: "信号数" })}</div>
                  <div className="text-sm font-semibold font-mono text-foreground">{totalSignals}</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="text-[10px] text-muted-foreground">{t({ en: "Hit Rate", zh: "命中率" })}</div>
                  <div className="text-sm font-semibold font-mono text-foreground">{hitRate}%</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="text-[10px] text-muted-foreground">Sim. PnL</div>
                  <div className={`text-sm font-semibold font-mono ${simulatedRoiPct >= 0 ? "text-signal-up" : "text-signal-down"}`}>
                    {simulatedRoiPct >= 0 ? "+" : ""}{simulatedRoiPct.toFixed(1)}%
                  </div>
                </div>
              </div>

              <Button variant="outline" size="sm" className="mt-auto self-start" asChild>
                <Link to={`/agent/${slug}`}>
                  {t({ en: "View Profile", zh: "查看档案" })}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
