import { simulatedReturn, type Signal } from "@/lib/mock-data";
import {
  assetLabel,
  directionLabel,
  formatDateTime,
  marketLabel,
  outcomeLabel,
  proofStateLabel,
  timeframeLabel,
  useLanguage,
} from "@/lib/language";
import { Shield, ShieldCheck, Clock, Lock, ArrowUp, ArrowDown, Eye, User } from "lucide-react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";

export function SignalCard({ signal, showReturn = false }: { signal: Signal; showReturn?: boolean }) {
  const { language, t } = useLanguage();
  const ret = showReturn ? simulatedReturn(signal) : null;

  return (
    <div
      className={`rounded-lg border bg-card p-4 transition-all hover:border-primary/40 hover:bg-accent/50 ${
        signal.proofState === "verified" ? "glow-verified border-signal-verified/20" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{marketLabel(signal.market, language)}</span>
            <ProofBadge state={signal.proofState} />
            {signal.isPremium && (
              <span className="flex items-center gap-1 text-xs text-signal-pending">
                <Lock className="h-3 w-3" />
                {t({ en: "Premium", zh: "高级" })}
              </span>
            )}
          </div>

          <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
            <div>
              <span className="text-muted-foreground/60">{t({ en: "Asset", zh: "资产" })}</span>
              <div className="font-medium text-foreground">{assetLabel(signal.market, language)}</div>
            </div>
            <div>
              <span className="text-muted-foreground/60">{t({ en: "Timeframe", zh: "周期" })}</span>
              <div className="font-medium text-foreground">{timeframeLabel(signal.market, language)}</div>
            </div>
            <div>
              <span className="text-muted-foreground/60">Agent</span>
              <div className="font-medium text-foreground">{signal.agentName ?? "zkAgent-α"}</div>
            </div>
            <div>
              <span className="text-muted-foreground/60">{t({ en: "Commit Hash", zh: "承诺哈希" })}</span>
              <div className="truncate font-mono text-foreground">{signal.commitHash?.slice(0, 10)}…</div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {t({ en: "Predicted:", zh: "预测于：" })} {formatDateTime(signal.committedAt, language)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {t({ en: "Reveals:", zh: "揭示于：" })} {formatDateTime(signal.resolvesAt, language)}
            </span>
          </div>

        </div>

        <div className="shrink-0 text-right">
          {signal.outcome && (
            <span className={`text-sm font-semibold ${signal.outcome === "win" ? "text-signal-up" : "text-signal-down"}`}>
              {outcomeLabel(signal.outcome, language)}
            </span>
          )}
          {signal.entryPrice && signal.proofState !== "committed" && (
            <div className="mt-1 text-xs font-mono text-muted-foreground">
              {t({ en: "Entry:", zh: "入场：" })} {signal.entryPrice.toFixed(2)}¢
            </div>
          )}
          {ret !== null && (
            <div className={`mt-1 text-xs font-mono ${ret >= 0 ? "text-signal-up" : "text-signal-down"}`}>
              {ret >= 0 ? "+" : ""}${ret.toFixed(2)} *
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-3">
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Link to={`/signal/${signal.id}`}>
            <Eye className="h-3 w-3" />
            {t({ en: "View Premium Signal", zh: "查看高级信号" })}
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
          <Link to={signal.agentSlug ? `/agent/${signal.agentSlug}` : "/agent"}>
            <User className="h-3 w-3" />
            {t({ en: "View Agent Profile", zh: "查看 Agent 档案" })}
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function DirectionBadge({ direction }: { direction: "Up" | "Down" }) {
  const { language } = useLanguage();
  const isUp = direction === "Up";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
        isUp ? "bg-signal-up/15 text-signal-up" : "bg-signal-down/15 text-signal-down"
      }`}
    >
      {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {directionLabel(direction, language)}
    </span>
  );
}

export function ProofBadge({ state }: { state: Signal["proofState"] }) {
  const { language } = useLanguage();
  if (state === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-signal-verified/15 px-2 py-0.5 text-xs font-semibold text-signal-verified">
        <ShieldCheck className="h-3 w-3" />
        {proofStateLabel(state, language)}
      </span>
    );
  }
  if (state === "revealed") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
        <Shield className="h-3 w-3" />
        {proofStateLabel(state, language)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-signal-pending/10 px-2 py-0.5 text-xs font-semibold text-signal-pending">
      <Clock className="h-3 w-3" />
      {proofStateLabel(state, language)}
    </span>
  );
}
