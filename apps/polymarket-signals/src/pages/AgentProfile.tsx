import { useMemo } from "react";
import { Link, Navigate, useParams } from "@/lib/router";
import { PageShell } from "@/components/PageShell";
import { StatBlock } from "@/components/StatBlock";
import { ProofBadge } from "@/components/SignalCard";
import { MOCK_NOW, liveFeed, revealedHistory, simulatedReturn, type Signal, type Market, type ProofState } from "@/lib/mock-data";
import {
  assetLabel,
  directionLabel,
  formatDateTime,
  hitMissLabel,
  marketLabel,
  proofStateLabel,
  timeframeLabel,
  useLanguage,
} from "@/lib/language";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Cpu,
  Zap,
  Target,
  ExternalLink,
  History,
  Unlock,
  BookOpen,
  TrendingUp,
  Clock,
  ArrowUp,
  ArrowDown,
  Activity,
  CalendarDays,
} from "lucide-react";
import type { getAgentProfileView } from "@/server/read-models/agents";

interface AgentMeta {
  market: Market;
  activeSince: string;
}

type AgentProfileView = NonNullable<Awaited<ReturnType<typeof getAgentProfileView>>>;

const slugToAgent: Record<string, AgentMeta> = {
  "btc-hourly": { market: "BTC Hourly", activeSince: "Jan 2025" },
  "eth-hourly": { market: "ETH Hourly", activeSince: "Jan 2025" },
  "gold-daily": { market: "Gold Daily", activeSince: "Feb 2025" },
  "silver-daily": { market: "Silver Daily", activeSince: "Feb 2025" },
};

function computePeriodStats(signals: Signal[]) {
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

export default function AgentProfile({
  initialSlug,
  initialView,
}: {
  initialSlug?: string;
  initialView?: AgentProfileView;
}) {
  const { slug } = useParams<{ slug: string }>();
  const { language, t } = useLanguage();
  const resolvedSlug = (initialSlug ?? slug) as keyof typeof slugToAgent | undefined;
  const fallbackAgent = resolvedSlug ? slugToAgent[resolvedSlug] : undefined;
  const agent = initialView
    ? { market: initialView.agent.marketType, activeSince: initialView.agent.activeSince }
    : fallbackAgent;

  const marketHistory = useMemo(
    () => (initialView ? initialView.historicalSignals : agent ? revealedHistory.filter((signal) => signal.market === agent.market) : []),
    [agent, initialView],
  );
  const marketLive = useMemo(
    () => (initialView ? initialView.currentSignals : agent ? liveFeed.filter((signal) => signal.market === agent.market) : []),
    [agent, initialView],
  );

  const now = MOCK_NOW;
  const yesterday = useMemo(() => marketHistory.filter((signal) => now - new Date(signal.committedAt).getTime() < 24 * 3600000), [marketHistory, now]);
  const last7d = useMemo(() => marketHistory.filter((signal) => now - new Date(signal.committedAt).getTime() < 7 * 24 * 3600000), [marketHistory, now]);

  const statsYesterday = useMemo(
    () =>
      initialView
        ? {
            total: initialView.performance.yesterday.totalSignals,
            hitRate: initialView.performance.yesterday.hitRatePct.toFixed(1),
            pnl: initialView.performance.yesterday.pnlCents / 100,
          }
        : computePeriodStats(yesterday),
    [initialView, yesterday],
  );
  const stats7d = useMemo(
    () =>
      initialView
        ? {
            total: initialView.performance.last7Days.totalSignals,
            hitRate: initialView.performance.last7Days.hitRatePct.toFixed(1),
            pnl: initialView.performance.last7Days.pnlCents / 100,
          }
        : computePeriodStats(last7d),
    [initialView, last7d],
  );
  const statsAll = useMemo(
    () =>
      initialView
        ? {
            total: initialView.performance.allTime.totalSignals,
            hitRate: initialView.performance.allTime.hitRatePct.toFixed(1),
            pnl: initialView.performance.allTime.pnlCents / 100,
          }
        : computePeriodStats(marketHistory),
    [initialView, marketHistory],
  );

  if (!agent) return <Navigate to="/agent" replace />;

  const currentSignals = marketLive.filter((signal) => signal.proofState === "committed" || signal.proofState === "revealed");
  const recentHistory = marketHistory.slice(0, 8);
  const totalCapital = statsAll.total * 100;
  const simROI = initialView
    ? initialView.performance.allTime.roiPct.toFixed(1)
    : totalCapital > 0
      ? ((statsAll.pnl / totalCapital) * 100).toFixed(1)
      : "0.0";
  const asset = assetLabel(agent.market, language);
  const timeframe = timeframeLabel(agent.market, language);
  const market = marketLabel(agent.market, language);
  const strategy = t({
    en: `Predicts ${asset} directional movement on ${timeframe.toLowerCase()} Polymarket resolution cycles using a commit-reveal workflow and zk proofs.`,
    zh: `围绕 ${market} 市场做方向判断，采用 commit-reveal 工作流，并用 zk 证明保证结果可验证。`,
  });
  const latestSignalState = initialView?.latestSignalState as ProofState | "none" | undefined;
  const latestSignalFromView = latestSignalState && latestSignalState !== "none" ? latestSignalState : undefined;
  const latestSignal: ProofState | undefined = latestSignalFromView ?? marketLive[0]?.proofState;

  return (
    <PageShell title={`${market} Agent`} subtitle={strategy}>
      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Cpu className="h-7 w-7 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-foreground">{market} Agent</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-verified/15 px-2.5 py-0.5 text-[10px] font-semibold text-signal-verified">
                <ShieldCheck className="h-3 w-3" />
                {t({ en: "zkVerified", zh: "zkVerified" })}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Activity className="h-3 w-3" />
                {asset}
              </span>
              <span className="text-border">·</span>
              <span>{t({ en: `${timeframe} Resolution`, zh: `${timeframe}` })}</span>
              <span className="text-border">·</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {t({ en: `Active since ${agent.activeSince}`, zh: `自 ${agent.activeSince} 起运行` })}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBlock label={t({ en: "Total Signals", zh: "总信号数" })} value={initialView?.totalSignals ?? statsAll.total} />
          <StatBlock label={t({ en: "All-Time Hit Rate", zh: "累计命中率" })} value={`${statsAll.hitRate}%`} />
          <StatBlock label="Simulated ROI" value={`${simROI}%`} sub={t({ en: "$100/signal standardized", zh: "按每条信号 100 美元口径" })} />
          <StatBlock
            label={t({ en: "Latest Signal", zh: "最新信号" })}
            value={latestSignal ? proofStateLabel(latestSignal, language) : t({ en: "None", zh: "暂无" })}
          />
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
          <Target className="h-4 w-4 text-primary" />
          {t({ en: "Methodology", zh: "方法论" })}
        </h3>
        <p className="mb-4 text-xs text-muted-foreground">
          {t({
            en: "Every signal from this agent follows a three-step cryptographic process so the prediction cannot be altered after the fact.",
            zh: "这个 Agent 的每条信号都会经过三步加密流程，确保预测一旦提交后就无法事后修改。",
          })}
        </p>
        <div className="space-y-3">
          <Step
            icon={Target}
            title={t({ en: "1 · Commit", zh: "1 · 承诺提交" })}
            desc={t({
              en: `The agent commits a directional prediction for ${asset} through a cryptographic hash before the market window closes.`,
              zh: `在当前 ${market} 市场窗口结束前，Agent 会先把方向判断写入加密哈希完成承诺。`,
            })}
          />
          <Step
            icon={Zap}
            title={t({ en: "2 · Resolve & Reveal", zh: "2 · 结算与揭示" })}
            desc={t({
              en: "Once the market resolves, the prediction is revealed publicly and matched against the original commitment.",
              zh: "市场结算后，预测内容会被公开揭示，并与最初的承诺做匹配校验。",
            })}
          />
          <Step
            icon={ShieldCheck}
            title={t({ en: "3 · zkVerify", zh: "3 · zkVerify 证明" })}
            desc={t({
              en: "A zero-knowledge proof confirms the revealed direction matches the original commitment and has not been tampered with.",
              zh: "最后通过零知识证明确认揭示结果与最初承诺一致，整个过程可独立验证、不可篡改。",
            })}
          />
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-primary" />
          {t({ en: "Performance Summary", zh: "表现摘要" })}
        </h3>
        <div className="mb-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          <PeriodCard title={t({ en: "Yesterday", zh: "过去 24 小时" })} stats={statsYesterday} />
          <PeriodCard title={t({ en: "Last 7 Days", zh: "近 7 天" })} stats={stats7d} />
          <PeriodCard title={t({ en: "All Time", zh: "全部历史" })} stats={statsAll} />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {t({
            en: "* All returns are simulated: $100 per signal, entry 10¢–90¢, hold to resolution. Not real user execution returns.",
            zh: "* 所有收益均为模拟口径：每条信号投入 100 美元，入场价 10¢–90¢，持有到结算。不代表真实用户成交结果。",
          })}
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
          <Clock className="h-4 w-4 text-signal-pending" />
          {t({ en: "Current Signals", zh: "当前信号" })}
        </h3>
        {currentSignals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t({ en: `No active signals for ${market} at this time.`, zh: `${market} 当前暂无活跃信号。` })}</p>
        ) : (
          <div className="space-y-2">
            {currentSignals.map((signal) => (
              <SignalRow key={signal.id} signal={signal} />
            ))}
          </div>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
          <History className="h-4 w-4 text-muted-foreground" />
          {t({ en: "Historical Signals", zh: "历史信号" })}
        </h3>
        {recentHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t({ en: `No historical signals for ${market} yet.`, zh: `${market} 暂无历史信号。` })}</p>
        ) : (
          <div className="mb-4 space-y-2">
            {recentHistory.map((signal) => (
              <HistoryRow key={signal.id} signal={signal} />
            ))}
          </div>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link to="/history">
            {t({ en: "View Full History", zh: "查看完整历史" })}
            <ExternalLink className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 text-base font-semibold text-foreground">{t({ en: "Actions", zh: "操作" })}</h3>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/">
              <Unlock className="mr-1.5 h-4 w-4" />
              {t({ en: "Unlock Latest Signals", zh: "解锁最新信号" })}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/history">
              <History className="mr-1.5 h-4 w-4" />
              {t({ en: "View Full History", zh: "查看完整历史" })}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/history">
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              {t({ en: "Open Proof Links", zh: "打开证明链接" })}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/library">
              <BookOpen className="mr-1.5 h-4 w-4" />
              {t({ en: "View My Purchases", zh: "查看我的购买" })}
            </Link>
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

function Step({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs leading-relaxed text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}

function PeriodCard({ title, stats }: { title: string; stats: { total: number; hitRate: string; pnl: number } }) {
  const { t } = useLanguage();
  const pnlPositive = stats.pnl >= 0;

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <div className="text-[10px] text-muted-foreground">{t({ en: "Signals", zh: "信号数" })}</div>
          <div className="text-sm font-semibold font-mono text-foreground">{stats.total}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">{t({ en: "Hit Rate", zh: "命中率" })}</div>
          <div className="text-sm font-semibold font-mono text-foreground">{stats.hitRate}%</div>
        </div>
        <div className="col-span-2">
          <div className="text-[10px] text-muted-foreground">Sim. PnL</div>
          <div className={`text-sm font-semibold font-mono ${pnlPositive ? "text-signal-up" : "text-signal-down"}`}>
            {pnlPositive ? "+" : ""}${stats.pnl.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  const { language, t } = useLanguage();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3">
      <div className="min-w-0 flex-1 items-center gap-2">
        <div className="flex items-center gap-2">
          <ProofBadge state={signal.proofState} />
          {signal.isPremium && (
            <span className="rounded bg-signal-pending/10 px-1.5 py-0.5 text-[10px] font-medium text-signal-pending">
              {t({ en: "Premium", zh: "高级" })}
            </span>
          )}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">{formatDateTime(signal.committedAt, language)}</div>
      <Button variant="ghost" size="sm" asChild>
        <Link to={`/signal/${signal.id}`}>
          {t({ en: "View", zh: "查看" })}
          <ExternalLink className="ml-1 h-3 w-3" />
        </Link>
      </Button>
    </div>
  );
}

function HistoryRow({ signal }: { signal: Signal }) {
  const { language, t } = useLanguage();
  const ret = simulatedReturn(signal);
  const isWin = signal.outcome === "win";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${signal.direction === "Up" ? "text-signal-up" : "text-signal-down"}`}>
            {signal.direction === "Up" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {directionLabel(signal.direction, language)}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${isWin ? "bg-signal-up/10 text-signal-up" : "bg-signal-down/10 text-signal-down"}`}>
            {hitMissLabel(isWin, language)}
          </span>
        </div>
      </div>
      {ret !== null && (
        <span className={`text-sm font-mono font-semibold ${ret >= 0 ? "text-signal-up" : "text-signal-down"}`}>
          {ret >= 0 ? "+" : ""}${ret.toFixed(2)}
        </span>
      )}
      {signal.anchorTxHash && signal.anchorExplorerUrl && (
        <Button variant="ghost" size="sm" asChild>
          <a href={signal.anchorExplorerUrl} target="_blank" rel="noreferrer">
            {t({ en: "Anchor Tx", zh: "Anchor 交易" })}
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
      )}
      <Button variant="ghost" size="sm" asChild>
        <Link to={`/signal/${signal.id}`}>
          {t({ en: "Open", zh: "打开" })}
          <ExternalLink className="ml-1 h-3 w-3" />
        </Link>
      </Button>
    </div>
  );
}
