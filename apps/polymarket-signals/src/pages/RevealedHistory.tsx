import { useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { PageShell } from "@/components/PageShell";
import { DirectionBadge, ProofBadge } from "@/components/SignalCard";
import { MOCK_NOW, revealedHistory, simulatedReturn, type Signal, type Market } from "@/lib/mock-data";
import { assetLabel, formatDateTime, hitMissLabel, marketLabel, timeframeLabel, useLanguage } from "@/lib/language";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import type { getHistoryView } from "@/server/read-models/history";

type FilterKey = "all" | Market | "hit" | "miss";
type HistoryView = Awaited<ReturnType<typeof getHistoryView>>;

function computeSummary(signals: Signal[]) {
  const total = signals.length;
  const hits = signals.filter((signal) => signal.outcome === "win").length;
  const deployed = total * 100;
  const pnl = signals.reduce((sum, signal) => sum + (simulatedReturn(signal) ?? 0), 0);
  const roi = deployed > 0 ? (pnl / deployed) * 100 : 0;
  const hitRate = total > 0 ? (hits / total) * 100 : 0;
  return { total, deployed, pnl, roi, hitRate };
}

function SummaryCard({
  title,
  signals,
  summary,
}: {
  title: string;
  signals?: Signal[];
  summary?: {
    totalSignals: number;
    deployedCents: number;
    pnlCents: number;
    roiPct: number;
    hitRatePct: number;
  };
}) {
  const { t } = useLanguage();
  const computed =
    summary ??
    (() => {
      const fallback = computeSummary(signals ?? []);
      return {
        totalSignals: fallback.total,
        deployedCents: fallback.deployed * 100,
        pnlCents: Math.round(fallback.pnl * 100),
        roiPct: fallback.roi,
        hitRatePct: fallback.hitRate,
      };
    })();

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <SumRow icon={<BarChart3 className="h-3 w-3" />} label={t({ en: "Signals", zh: "信号数" })} value={String(computed.totalSignals)} />
        <SumRow icon={<DollarSign className="h-3 w-3" />} label={t({ en: "Deployed", zh: "投入" })} value={`$${(computed.deployedCents / 100).toLocaleString()}`} />
        <SumRow
          icon={<TrendingUp className="h-3 w-3" />}
          label="Sim. PnL"
          value={`${computed.pnlCents >= 0 ? "+" : ""}$${(computed.pnlCents / 100).toFixed(0)}`}
          color={computed.pnlCents >= 0 ? "text-signal-up" : "text-signal-down"}
        />
        <SumRow
          icon={<TrendingDown className="h-3 w-3" />}
          label="ROI"
          value={`${computed.roiPct >= 0 ? "+" : ""}${computed.roiPct.toFixed(1)}%`}
          color={computed.roiPct >= 0 ? "text-signal-up" : "text-signal-down"}
        />
        <SumRow
          icon={<Target className="h-3 w-3" />}
          label={t({ en: "Hit Rate", zh: "命中率" })}
          value={`${computed.hitRatePct.toFixed(1)}%`}
          color={computed.hitRatePct >= 50 ? "text-signal-up" : "text-signal-down"}
        />
      </div>
    </div>
  );
}

function SumRow({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`ml-auto text-xs font-mono font-semibold ${color ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

export default function RevealedHistory({ initialView }: { initialView?: HistoryView }) {
  const { language, t } = useLanguage();
  const [filter, setFilter] = useState<FilterKey>("all");

  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: t({ en: "All", zh: "全部" }) },
    { key: "BTC Hourly", label: marketLabel("BTC Hourly", language) },
    { key: "ETH Hourly", label: marketLabel("ETH Hourly", language) },
    { key: "Gold Daily", label: marketLabel("Gold Daily", language) },
    { key: "Silver Daily", label: marketLabel("Silver Daily", language) },
    { key: "hit", label: t({ en: "Hit", zh: "命中" }) },
    { key: "miss", label: t({ en: "Miss", zh: "失手" }) },
  ];

  const records = initialView?.records ?? revealedHistory;
  const now = MOCK_NOW;
  const oneDayAgo = now - 24 * 3600000;
  const sevenDaysAgo = now - 7 * 24 * 3600000;

  const yesterday = records.filter((signal) => new Date(signal.committedAt).getTime() > oneDayAgo);
  const last7 = records.filter((signal) => new Date(signal.committedAt).getTime() > sevenDaysAgo);

  const filtered = useMemo(() => {
    if (filter === "all") return records;
    if (filter === "hit") return records.filter((signal) => signal.outcome === "win");
    if (filter === "miss") return records.filter((signal) => signal.outcome === "loss");
    return records.filter((signal) => signal.market === filter);
  }, [filter, records]);

  return (
    <PageShell
      title={t({ en: "Revealed History", zh: "历史公开记录" })}
      subtitle={t({
        en: "Verified signals with zkVerify proofs and standardized simulated performance.",
        zh: "查看已公开且带 zkVerify 证明的信号，以及统一口径的模拟表现。",
      })}
    >
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryCard title={t({ en: "Yesterday", zh: "过去 24 小时" })} signals={yesterday} summary={initialView?.summary.yesterday} />
        <SummaryCard title={t({ en: "Last 7 Days", zh: "近 7 天" })} signals={last7} summary={initialView?.summary.last7Days} />
        <SummaryCard title={t({ en: "All Time", zh: "全部历史" })} signals={records} summary={initialView?.summary.allTime} />
      </div>

      <div className="mb-6 flex items-start gap-2 rounded-lg border border-signal-pending/20 bg-signal-pending/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-pending" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-signal-pending">{t({ en: "Simulated Returns Disclaimer:", zh: "模拟收益说明：" })}</span>{" "}
          {t({
            en: "All returns shown are simulated using standardized $100-per-signal, hold-to-resolution logic. Entry prices between 10¢–90¢. These are not real execution returns and do not account for slippage, fees, or liquidity.",
            zh: "页面中的收益均按每条信号投入 100 美元、持有到结算的统一规则模拟，入场价范围为 10¢–90¢。这不是实际成交收益，也未计入滑点、手续费或流动性影响。",
          })}
        </p>
      </div>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterKey)} className="mb-4">
        <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
          {filters.map((item) => (
            <TabsTrigger
              key={item.key}
              value={item.key}
              className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mb-3 text-xs text-muted-foreground">
        {t({ en: `${filtered.length} records`, zh: `${filtered.length} 条记录` })}
      </div>

      <div className="space-y-2">
        {filtered.map((signal) => (
          <HistoryRow key={signal.id} signal={signal} />
        ))}
      </div>
    </PageShell>
  );
}

function HistoryRow({ signal }: { signal: Signal }) {
  const { language, t } = useLanguage();
  const ret = simulatedReturn(signal);
  const isHit = signal.outcome === "win";

  return (
    <div
      className={`rounded-lg border bg-card p-4 transition-all hover:border-primary/30 ${
        signal.proofState === "verified" ? "border-signal-verified/15" : "border-border"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{marketLabel(signal.market, language)}</span>
            <ProofBadge state={signal.proofState} />
            <Badge
              variant={isHit ? "default" : "destructive"}
              className={`h-5 border-transparent px-1.5 py-0 text-[10px] ${
                isHit
                  ? "bg-signal-up/15 text-signal-up hover:bg-signal-up/25"
                  : "bg-signal-down/15 text-signal-down hover:bg-signal-down/25"
              }`}
            >
              {hitMissLabel(isHit, language)}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
            <div>
              <span className="text-muted-foreground/60">{t({ en: "Asset", zh: "资产" })}</span>
              <div className="font-medium text-foreground">{assetLabel(signal.market, language)}</div>
            </div>
            <div>
              <span className="text-muted-foreground/60">{t({ en: "Timeframe", zh: "周期" })}</span>
              <div className="font-medium text-foreground">{timeframeLabel(signal.market, language)}</div>
            </div>
            <div>
              <span className="text-muted-foreground/60">{t({ en: "Side", zh: "方向" })}</span>
              <div>
                <DirectionBadge direction={signal.direction} />
              </div>
            </div>
            <div>
              <span className="text-muted-foreground/60">{t({ en: "Entry", zh: "入场" })}</span>
              <div className="font-mono font-medium text-foreground">{signal.entryPrice?.toFixed(2)}¢</div>
            </div>
            <div>
              <span className="text-muted-foreground/60">{t({ en: "Predicted", zh: "预测时间" })}</span>
              <div className="font-medium text-foreground">{formatDateTime(signal.committedAt, language)}</div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          {ret !== null && (
            <div className={`text-sm font-mono font-bold ${ret >= 0 ? "text-signal-up" : "text-signal-down"}`}>
              {ret >= 0 ? "+" : ""}${ret.toFixed(2)}
            </div>
          )}
          <span className={`text-[10px] font-semibold uppercase ${isHit ? "text-signal-up" : "text-signal-down"}`}>
            {hitMissLabel(isHit, language)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
        <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <Link to={`/signal/${signal.id}`}>
            <Eye className="h-3 w-3" />
            {t({ en: "Open Record", zh: "打开记录" })}
          </Link>
        </Button>
        {signal.proofHash && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 border-signal-verified/30 text-xs text-signal-verified hover:bg-signal-verified/10"
          >
            <ShieldCheck className="h-3 w-3" />
            {t({ en: "View zkVerify Proof", zh: "查看 zkVerify 证明" })}
          </Button>
        )}
        {signal.anchorTxHash && signal.anchorExplorerUrl && (
          <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
            <a href={signal.anchorExplorerUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3 w-3" />
              {t({ en: "View Anchor Tx", zh: "查看 Anchor 交易" })}
            </a>
          </Button>
        )}
        <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 text-xs">
          <Sparkles className="h-3 w-3" />
          {t({ en: "Buy Similar Signal", zh: "购买相似信号" })}
        </Button>
      </div>
    </div>
  );
}
