import { useState } from "react";
import { Link } from "@/lib/router";
import { SignalCard } from "@/components/SignalCard";
import { liveFeed, revealedHistory, type Market, agentStats } from "@/lib/mock-data";
import { marketLabel, useLanguage } from "@/lib/language";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowRight, TrendingUp, Lock, Activity, BarChart3 } from "lucide-react";
import type { getFeedView } from "@/server/read-models/feed";

type FeedView = Awaited<ReturnType<typeof getFeedView>>;

export default function Feed({ initialView }: { initialView?: FeedView }) {
  const { language, t } = useLanguage();
  const [activeMarket, setActiveMarket] = useState<string>("all");
  const fallbackWins = revealedHistory.filter((s) => s.outcome === "win").length;
  const fallbackTotal = revealedHistory.length;
  const liveSignals = initialView?.liveSignals ?? liveFeed;
  const trackRecord = initialView?.trackRecord ?? {
    totalSignals: agentStats.totalSignals,
    winRate: fallbackTotal > 0 ? Number(((fallbackWins / fallbackTotal) * 100).toFixed(1)) : 0,
    simulatedROI: agentStats.simulatedROI,
    marketsTracked: 4,
    deployedCents: 0,
    pnlCents: 0,
  };

  const marketTabs: { label: string; value: Market }[] = [
    { label: marketLabel("BTC Hourly", language), value: "BTC Hourly" },
    { label: marketLabel("ETH Hourly", language), value: "ETH Hourly" },
    { label: marketLabel("Gold Daily", language), value: "Gold Daily" },
    { label: marketLabel("Silver Daily", language), value: "Silver Daily" },
  ];

  const filteredSignals =
    activeMarket === "all"
      ? liveSignals
      : liveSignals.filter((s) => s.market === activeMarket);

  return (
    <div className="pt-14 min-h-screen">
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-5xl px-4 py-16 md:py-24">
          <div className="mb-4 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-up opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-signal-up" />
            </span>
            <span className="text-xs font-medium uppercase tracking-wider text-signal-up">
              {t({ en: "Live predictions", zh: "实时预测" })}
            </span>
          </div>

          <h1 className="mb-4 max-w-3xl text-3xl font-bold leading-tight text-foreground md:text-5xl">
            {t({ en: "Verified Directional Signals", zh: "经验证的方向信号" })}
            <br />
            <span className="text-primary">{t({ en: "for Polymarket", zh: "面向 Polymarket" })}</span>
          </h1>

          <p className="mb-8 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {t({
              en: "Premium predictions committed before market resolution, revealed after, and cryptographically verified with ",
              zh: "高价值预测会在市场结算前先做承诺，结算后再揭示，并通过 ",
            })}
            <span className="font-medium text-signal-verified">zkVerify</span>
            {t({
              en: " proofs. Every signal is provably honest.",
              zh: " 证明完成加密校验。每一条信号都能被验证，不能事后篡改。",
            })}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="gap-2">
              <a href="#live-feed">
                <Activity className="h-4 w-4" />
                {t({ en: "Browse Live Signals", zh: "查看实时信号" })}
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link to="/history">
                <BarChart3 className="h-4 w-4" />
                {t({ en: "See Track Record", zh: "查看往绩" })}
              </Link>
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-border/50 pt-6">
            <TrustStat
              icon={<ShieldCheck className="h-4 w-4 text-signal-verified" />}
              label={t({ en: "zkVerify proven", zh: "zkVerify 已验证" })}
              value={t({ en: `${trackRecord.totalSignals} signals`, zh: `${trackRecord.totalSignals} 条信号` })}
            />
            <TrustStat
              icon={<TrendingUp className="h-4 w-4 text-signal-up" />}
              label={t({ en: "Win rate", zh: "命中率" })}
              value={`${trackRecord.winRate}%`}
            />
            <TrustStat
              icon={<Lock className="h-4 w-4 text-signal-pending" />}
              label={t({ en: "Commit-reveal", zh: "Commit-Reveal" })}
              value={t({ en: "Tamperproof", zh: "不可篡改" })}
            />
          </div>
        </div>
      </section>

      <section id="live-feed" className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="mb-1 text-xl font-bold text-foreground">{t({ en: "Live Commitment Feed", zh: "实时承诺流" })}</h2>
            <p className="text-sm text-muted-foreground">
              {t({
                en: "Signals committed on-chain before resolution — premium content gated via x402.",
                zh: "信号会在结算前上链承诺，高级内容通过 x402 做访问控制。",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-up opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-signal-up" />
            </span>
            <span className="text-xs text-muted-foreground">
              {t({ en: `${liveSignals.length} active`, zh: `${liveSignals.length} 条活跃中` })}
            </span>
          </div>
        </div>

        <Tabs value={activeMarket} onValueChange={setActiveMarket} className="mb-6">
          <TabsList className="border border-border bg-muted/50">
            <TabsTrigger value="all" className="text-xs">
              {t({ en: "All Markets", zh: "全部市场" })}
            </TabsTrigger>
            {marketTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid gap-3">
          {filteredSignals.length > 0 ? (
            filteredSignals.map((signal) => <SignalCard key={signal.id} signal={signal} />)
          ) : (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {t({ en: "No active signals for this market right now.", zh: "这个市场当前没有活跃信号。" })}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-border bg-muted/20">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <div className="mb-8 text-center">
            <h2 className="mb-2 text-xl font-bold text-foreground">{t({ en: "Proven Track Record", zh: "可验证的历史表现" })}</h2>
            <p className="mx-auto max-w-lg text-sm text-muted-foreground">
              {t({
                en: "Every signal verified on-chain. Simulated returns based on $100/signal, entry 10¢–90¢, hold to resolution.",
                zh: "每条信号都能上链验证。模拟收益按每条信号投入 100 美元、入场价 10¢–90¢、持有到结算计算。",
              })}
            </p>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <RecordStat label={t({ en: "Total Signals", zh: "总信号数" })} value={trackRecord.totalSignals.toString()} />
            <RecordStat label={t({ en: "Win Rate", zh: "命中率" })} value={`${trackRecord.winRate}%`} highlight />
            <RecordStat label={t({ en: "Markets Tracked", zh: "覆盖市场" })} value={trackRecord.marketsTracked.toString()} />
            <RecordStat label="Sim. ROI *" value={`${trackRecord.simulatedROI >= 0 ? "+" : ""}${trackRecord.simulatedROI}%`} highlight />
          </div>

          <div className="text-center">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/history">
                {t({ en: "View Full History", zh: "查看完整历史" })}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <p className="mt-4 text-center text-[10px] text-muted-foreground">
            {t({
              en: "* Simulated returns only. Not real execution returns. Past performance does not guarantee future results.",
              zh: "* 仅为模拟收益，不代表真实成交结果，历史表现也不构成未来收益保证。",
            })}
          </p>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h2 className="mb-3 text-2xl font-bold text-foreground">
            {t({ en: "Start Accessing Verified Signals", zh: "开始解锁已验证信号" })}
          </h2>
          <p className="mx-auto mb-8 max-w-md text-sm text-muted-foreground">
            {t({
              en: "Connect your account to unlock premium directional predictions, backed by cryptographic proofs and a transparent track record.",
              zh: "连接账户后即可解锁高价值方向预测，背后有加密证明和透明的历史记录支撑。",
            })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link to="/agent">
                {t({ en: "View Agent Profile", zh: "查看 Agent 档案" })}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function TrustStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold text-foreground">{value}</div>
      </div>
    </div>
  );
}

function RecordStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-center">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold font-mono ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
