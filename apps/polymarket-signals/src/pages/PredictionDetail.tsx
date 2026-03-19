import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Link, useParams } from "@/lib/router";
import { PageShell } from "@/components/PageShell";
import { DirectionBadge, ProofBadge } from "@/components/SignalCard";
import { liveFeed, revealedHistory, simulatedReturn } from "@/lib/mock-data";
import { assetLabel, confidenceLabel, formatDateTime, marketLabel, outcomeLabel, proofStateLabel, timeframeLabel, useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  ExternalLink,
  Eye,
  Unlock,
  BookmarkPlus,
  History,
  Zap,
} from "lucide-react";
import type { getSignalDetailView } from "@/server/read-models/signals";
import { unlockSignalWithX402 } from "@/lib/x402-client";

const confidenceBuckets = ["High", "Medium-High", "Medium", "Low"] as const;
type SignalDetailView = NonNullable<Awaited<ReturnType<typeof getSignalDetailView>>>;
const fallbackAgents = {
  "BTC Hourly": { slug: "btc-hourly", name: "BTC Hourly Agent" },
  "ETH Hourly": { slug: "eth-hourly", name: "ETH Hourly Agent" },
  "Gold Daily": { slug: "gold-daily", name: "Gold Daily Agent" },
  "Silver Daily": { slug: "silver-daily", name: "Silver Daily Agent" },
} as const;

const explanations = {
  en: {
    "BTC Hourly": "Momentum divergence detected on 15m candles with volume confirmation across major exchanges.",
    "ETH Hourly": "Relative strength breakout signaled against BTC pair with on-chain flow support.",
    "Gold Daily": "Macro positioning shift detected via treasury yield correlation and institutional flow data.",
    "Silver Daily": "Industrial demand signals combined with precious metals sector rotation indicators.",
  },
  zh: {
    "BTC Hourly": "15 分钟级别蜡烛图出现动量背离，且多家主流交易所的成交量同步确认。",
    "ETH Hourly": "ETH/BTC 相对强弱出现向上突破，同时链上资金流给出支撑信号。",
    "Gold Daily": "美债收益率相关性和机构资金流共同指向宏观仓位正在切换。",
    "Silver Daily": "工业需求信号与贵金属板块轮动指标同时转强，白银获得额外支撑。",
  },
} as const;

function buildFallbackDetail(signalId: string): SignalDetailView | null {
  const signal = [...liveFeed, ...revealedHistory].find((item) => item.id === signalId);

  if (!signal) {
    return null;
  }

  const agent = fallbackAgents[signal.market];
  const enrichedSignal = {
    ...signal,
    agentSlug: agent.slug,
    agentName: agent.name,
    confidence: confidenceBuckets[parseInt(signal.id.slice(-1), 10) % confidenceBuckets.length],
    explanation: "",
    proofUrl: null,
  };

  return {
    signal: enrichedSignal,
    unlocked: !enrichedSignal.isPremium,
    quote: signal.isPremium
      ? {
          signalId,
          network: "unset",
          token: "unset",
          displayAmount: "$1.00",
          tokenAmountAtomic: null,
          tokenAddress: null,
          tokenDecimals: null,
          eip712Name: null,
          eip712Version: null,
          treasuryAddress: "0xtreasury",
          mode: "single-signal",
        }
      : null,
    premium: !signal.isPremium
      ? {
          direction: enrichedSignal.direction,
          entryPriceCents: typeof enrichedSignal.entryPrice === "number" ? Math.round(enrichedSignal.entryPrice * 100) : null,
          confidence: enrichedSignal.confidence,
          explanation: "",
          outcome: enrichedSignal.outcome ?? null,
          proofUrl: enrichedSignal.proofUrl ?? null,
        }
      : null,
  };
}

export default function PredictionDetail({
  initialSignalId,
  initialWalletAddress,
  initialView,
}: {
  initialSignalId?: string;
  initialWalletAddress?: string;
  initialView?: SignalDetailView;
}) {
  const { id } = useParams<{ id?: string }>();
  const router = useRouter();
  const { language, t } = useLanguage();
  const signalId = initialSignalId ?? id;
  const fallbackDetail = useMemo(() => (signalId ? buildFallbackDetail(signalId) : null), [signalId]);
  const [detail, setDetail] = useState<SignalDetailView | null>(initialView ?? fallbackDetail);
  const [unlocking, setUnlocking] = useState(false);

  const signal = detail?.signal;

  if (!signal) {
    return (
      <PageShell title={t({ en: "Signal Not Found", zh: "未找到信号" })}>
        <Link to="/" className="flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />
          {t({ en: "Back to feed", zh: "返回信号流" })}
        </Link>
      </PageShell>
    );
  }

  const ret = simulatedReturn(signal);
  const isPremiumLocked = signal.isPremium && !detail?.unlocked;
  const confidence = detail?.premium?.confidence ?? confidenceBuckets[parseInt(signal.id.slice(-1), 10) % confidenceBuckets.length];
  const explanation = detail?.premium?.explanation || explanations[language][signal.market];
  const market = marketLabel(signal.market, language);

  async function handleUnlock() {
    if (!signalId || unlocking) {
      return;
    }

    setUnlocking(true);

    try {
      const payload = (await unlockSignalWithX402({
        signalId,
      })) as { signal?: SignalDetailView };

      if (payload.signal) {
        setDetail(payload.signal);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (message.includes("wallet-session-required")) {
        await router.push(`/connect?redirectTo=${encodeURIComponent(`/signal/${signalId}`)}`);
        return;
      }
      throw caught;
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link to="/" className="mb-6 flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />
          {t({ en: "Back to feed", zh: "返回信号流" })}
        </Link>

        <div
          className={`mb-6 rounded-xl border bg-card p-6 ${
            signal.proofState === "verified" ? "glow-verified border-signal-verified/20" : "border-border"
          }`}
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{signal.id}</span>
            <ProofBadge state={signal.proofState} />
            {signal.isPremium && (
              <span className="flex items-center gap-1 text-xs text-signal-pending">
                <Lock className="h-3 w-3" />
                {t({ en: "Premium", zh: "高级" })}
              </span>
            )}
          </div>

          <h1 className="mb-1 text-2xl font-bold text-foreground">{market}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{t({ en: "Directional prediction signal", zh: "方向性预测信号" })}</p>

          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            <MetaField label={t({ en: "Asset", zh: "资产" })} value={assetLabel(signal.market, language)} />
            <MetaField label={t({ en: "Timeframe", zh: "周期" })} value={timeframeLabel(signal.market, language)} />
            <MetaField label={t({ en: "Status", zh: "状态" })} value={proofStateLabel(signal.proofState, language)} />
            <MetaField label={t({ en: "Predicted At", zh: "预测时间" })} value={formatDateTime(signal.committedAt, language)} />
            <MetaField label={t({ en: "Reveals At", zh: "公开时间" })} value={formatDateTime(signal.resolvesAt, language)} />
              <MetaField label="Agent" value={signal.agentName ?? "zkAgent-α"} />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{t({ en: "Commitment Hash", zh: "承诺哈希" })}</div>
            <div className="break-all font-mono text-xs text-foreground">{signal.commitHash}</div>
          </div>

          {signal.anchorTxHash && signal.anchorExplorerUrl && (
            <div className="mt-3">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={signal.anchorExplorerUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t({ en: "View Anchor Tx", zh: "查看 Anchor 交易" })}
                </a>
              </Button>
            </div>
          )}

        </div>

        <div className="mb-6 rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground">{t({ en: "Commit-Reveal-Verify Timeline", zh: "Commit-Reveal-Verify 时间线" })}</h2>
          <div className="flex items-start gap-0">
            <TimelineStep label={t({ en: "Committed", zh: "已承诺" })} time={formatDateTime(signal.committedAt, language)} active icon={<Lock className="h-3.5 w-3.5" />} />
            <TimelineStep
              label={t({ en: "Revealed", zh: "已公开" })}
              time={signal.revealedAt ? formatDateTime(signal.revealedAt, language) : t({ en: "Pending", zh: "等待中" })}
              active={Boolean(signal.revealedAt)}
              icon={<Eye className="h-3.5 w-3.5" />}
            />
            <TimelineStep
              label={t({ en: "Verified", zh: "已验证" })}
              time={signal.proofState === "verified" ? t({ en: "Proven", zh: "已证明" }) : t({ en: "Pending", zh: "等待中" })}
              active={signal.proofState === "verified"}
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              last
            />
          </div>
        </div>

        {isPremiumLocked ? (
          <div className="mb-6 rounded-xl border border-primary/20 bg-gradient-to-b from-primary/5 to-card p-8 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-foreground">{t({ en: "Premium Signal Content", zh: "高级信号内容" })}</h2>
            <p className="mx-auto mb-2 max-w-md text-sm text-muted-foreground">
              {t({
                en: "The predicted direction, entry price, confidence level, and detailed reasoning are gated behind x402 micropayment.",
                zh: "预测方向、入场价、置信度和详细理由都通过 x402 小额支付进行权限控制。",
              })}
            </p>
            <p className="mb-6 text-xs text-muted-foreground/70">
              {t({ en: "One-time unlock, no subscription, no account required.", zh: "一次解锁即可查看，无需订阅，也无需注册账号。" })}
            </p>

            <div className="mx-auto mb-6 grid max-w-sm grid-cols-2 gap-3 text-left">
              <LockedField label={t({ en: "Predicted Side", zh: "预测方向" })} />
              <LockedField label={t({ en: "Entry Price", zh: "入场价" })} />
              <LockedField label={t({ en: "Confidence", zh: "置信度" })} />
              <LockedField label={t({ en: "Reasoning", zh: "推理依据" })} />
            </div>

            <Button size="lg" className="gap-2 px-8" onClick={() => void handleUnlock()} disabled={unlocking}>
              <Zap className="h-4 w-4" />
              {unlocking
                ? t({ en: "Unlocking…", zh: "解锁中…" })
                : t({ en: "Pay with x402 to Unlock", zh: "通过 x402 支付解锁" })}
            </Button>
          </div>
        ) : (
          <div className="glow-verified mb-6 rounded-xl border border-signal-verified/20 bg-card p-6">
            <div className="mb-5 flex items-center gap-2">
              <Unlock className="h-4 w-4 text-signal-verified" />
              <h2 className="text-sm font-semibold text-signal-verified">{t({ en: "Premium Content Unlocked", zh: "高级内容已解锁" })}</h2>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t({ en: "Predicted Side", zh: "预测方向" })}</div>
                <DirectionBadge direction={signal.direction} />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t({ en: "Entry Price", zh: "入场价" })}</div>
                <div className="text-lg font-bold font-mono text-foreground">
                  {typeof detail?.premium?.entryPriceCents === "number"
                    ? `${detail.premium.entryPriceCents}¢`
                    : signal.entryPrice
                      ? `${signal.entryPrice.toFixed(2)}¢`
                      : "—"}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t({ en: "Confidence", zh: "置信度" })}</div>
                <span
                  className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
                    confidence === "High"
                      ? "bg-signal-up/15 text-signal-up"
                      : confidence === "Medium-High"
                        ? "bg-primary/10 text-primary"
                        : "bg-signal-pending/10 text-signal-pending"
                  }`}
                >
                  {confidenceLabel(confidence, language)}
                </span>
              </div>
              {signal.outcome && (
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">{t({ en: "Outcome", zh: "结果" })}</div>
                  <span className={`text-lg font-bold ${detail?.premium?.outcome === "win" ? "text-signal-up" : "text-signal-down"}`}>
                    {outcomeLabel((detail?.premium?.outcome ?? signal.outcome)!, language)}
                  </span>
                  {ret !== null && (
                    <div className={`text-xs font-mono ${ret >= 0 ? "text-signal-up" : "text-signal-down"}`}>
                      {ret >= 0 ? "+" : ""}${ret.toFixed(2)} *
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mb-5 rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-1 text-xs text-muted-foreground">{t({ en: "Signal Reasoning", zh: "信号理由" })}</div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{explanation}</p>
            </div>

            {(signal.proofHash || detail?.premium?.proofUrl) && (
              <div className="mb-5 rounded-lg border border-signal-verified/15 bg-signal-verified/5 p-3">
                <div className="mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-signal-verified" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-signal-verified">zkVerify Proof</span>
                </div>
                <div className="break-all font-mono text-xs text-foreground">{signal.proofHash ?? detail?.premium?.proofUrl}</div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {(signal.proofHash || detail?.premium?.proofUrl) && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                >
                  <a href={detail?.premium?.proofUrl ?? "#"} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t({ en: "View zkVerify Proof", zh: "查看 zkVerify 证明" })}
                  </a>
                </Button>
              )}
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to={signal.agentSlug ? `/agent/${signal.agentSlug}` : "/history"}>
                  <History className="h-3.5 w-3.5" />
                  {t({ en: "View Agent History", zh: "查看 Agent 历史" })}
                </Link>
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <BookmarkPlus className="h-3.5 w-3.5" />
                {t({ en: "Save to My Library", zh: "保存到我的库" })}
              </Button>
            </div>

            {ret !== null && (
              <p className="mt-4 text-[10px] text-muted-foreground">
                {t({
                  en: "* Simulated return: $100 stake, entry 10¢–90¢, hold to resolution. Not real execution.",
                  zh: "* 模拟收益按 100 美元仓位、入场价 10¢–90¢、持有到结算计算，不代表真实成交结果。",
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function LockedField({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-2.5">
      <div className="mb-1 text-[10px] text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-16 rounded bg-muted/60" />
        <Lock className="h-3 w-3 text-muted-foreground/40" />
      </div>
    </div>
  );
}

function TimelineStep({
  label,
  time,
  active,
  icon,
  last,
}: {
  label: string;
  time: string;
  active: boolean;
  icon: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`flex-1 ${last ? "" : "relative"}`}>
      <div className="flex flex-col items-center text-center">
        <div
          className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full border-2 ${
            active ? "border-signal-verified bg-signal-verified/10 text-signal-verified" : "border-border bg-muted text-muted-foreground"
          }`}
        >
          {icon}
        </div>
        <div className={`mb-0.5 text-xs font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>{label}</div>
        <div className="text-[10px] text-muted-foreground">{time}</div>
      </div>
      {!last && <div className={`absolute left-[calc(50%+16px)] right-[calc(-50%+16px)] top-4 h-0.5 ${active ? "bg-signal-verified/40" : "bg-border"}`} />}
    </div>
  );
}
