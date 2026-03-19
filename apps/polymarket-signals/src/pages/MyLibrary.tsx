import { Link } from "@/lib/router";
import { MOCK_NOW, myLibrary, type Signal } from "@/lib/mock-data";
import { ProofBadge } from "@/components/SignalCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { assetLabel, formatDateTime, marketLabel, timeframeLabel, useLanguage } from "@/lib/language";
import {
  Wallet,
  ShieldCheck,
  ExternalLink,
  Eye,
  Clock,
  BookOpen,
  Receipt,
  Activity,
  Unlock,
  ArrowRight,
  Package,
} from "lucide-react";
import type { getLibraryView } from "@/server/read-models/library";

function makePurchases(signals: Signal[]) {
  return signals.map((signal, index) => ({
    orderId: `ord-${String(4200 + index).padStart(5, "0")}`,
    resource: signal.market,
    signalId: signal.id,
    amount: "0.002 ETH",
    paidAt: new Date(MOCK_NOW - (index + 1) * 3600000 * 3).toISOString(),
    status: "confirmed" as const,
  }));
}

function makeActivity(signals: Signal[]) {
  const items: { type: string; label: (language: ReturnType<typeof useLanguage>["language"]) => string; time: string; signalId: string }[] = [];

  signals.slice(0, 3).forEach((signal, index) => {
    items.push({
      type: "opened",
      label: (language) => (language === "zh" ? `打开了 ${marketLabel(signal.market, language)} 信号` : `Opened ${signal.market} signal`),
      time: new Date(MOCK_NOW - index * 1800000).toISOString(),
      signalId: signal.id,
    });
  });

  signals.slice(0, 2).forEach((signal, index) => {
    items.push({
      type: "purchased",
      label: (language) => (language === "zh" ? `购买了 ${marketLabel(signal.market, language)}` : `Purchased ${signal.market}`),
      time: new Date(MOCK_NOW - (index + 3) * 3600000).toISOString(),
      signalId: signal.id,
    });
  });

  signals
    .filter((signal) => signal.proofState !== "committed")
    .slice(0, 2)
    .forEach((signal, index) => {
      items.push({
        type: "revealed",
        label: (language) => (language === "zh" ? `${marketLabel(signal.market, language)} 已公开` : `${signal.market} content revealed`),
        time: new Date(MOCK_NOW - (index + 5) * 3600000).toISOString(),
        signalId: signal.id,
      });
    });

  return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

const purchases = makePurchases(myLibrary);
const recentActivity = makeActivity(myLibrary);
const savedProofs = myLibrary.filter((signal) => signal.proofState === "verified" || signal.proofHash);
type LibraryView = Awaited<ReturnType<typeof getLibraryView>>;

export default function MyLibrary({
  initialWalletAddress,
  initialView,
}: {
  initialWalletAddress?: string;
  initialView?: LibraryView;
}) {
  const { language, t } = useLanguage();
  const unlocks = initialView?.unlocks ?? myLibrary;
  const purchaseRows =
    initialView?.purchases.map((purchase) => {
      const signal = unlocks.find((entry) => entry.id === purchase.signalId);

      return {
        orderId: purchase.purchaseId,
        resourceLabel: signal ? marketLabel(signal.market, language) : purchase.signalId,
        signalId: purchase.signalId,
        amount: purchase.paymentAmount,
        paidAt: purchase.createdAt,
        status: purchase.paymentStatus,
      };
    }) ?? purchases;
  const savedProofRows = initialView?.savedProofs ?? savedProofs;
  const activityRows =
    initialView?.activity.map((item) => {
      const signal = unlocks.find((entry) => entry.id === item.signalId);
      const market = signal ? marketLabel(signal.market, language) : item.signalId;

      return {
        ...item,
        label: () => item.label.includes(item.signalId) && signal ? item.label.replace(item.signalId, market) : item.label,
      };
    }) ?? recentActivity;
  const walletAddress = initialWalletAddress ?? initialView?.walletAddress ?? null;
  const latestPurchaseTime = purchaseRows.length > 0 ? formatDateTime(purchaseRows[0].paidAt, language) : "—";

  if (!walletAddress) {
    return (
      <div className="min-h-screen pt-14">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <EmptyState
            icon={<Wallet className="h-8 w-8" />}
            title={t({ en: "Connect your wallet", zh: "先连接你的钱包" })}
            description={t({
              en: "Your library, purchases, and saved proofs are tied to your connected wallet session.",
              zh: "你的资料库、购买记录和保存的证明都绑定在已连接的钱包会话上。",
            })}
            action={
              <Button asChild>
                <Link to="/connect">
                  <Wallet className="mr-1.5 h-4 w-4" />
                  {t({ en: "Connect Wallet", zh: "连接钱包" })}
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 rounded-xl border border-border bg-card p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-mono text-sm font-medium text-foreground">{walletAddress}</div>
                <div className="text-xs text-muted-foreground">{t({ en: "Connected Wallet", zh: "已连接钱包" })}</div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <HeaderStat label={t({ en: "Purchased", zh: "已购买" })} value={purchaseRows.length.toString()} />
              <HeaderStat label={t({ en: "Accessible", zh: "可访问" })} value={unlocks.length.toString()} />
              <HeaderStat label={t({ en: "Latest Purchase", zh: "最近购买" })} value={latestPurchaseTime} small />
            </div>
          </div>
        </div>

        <Tabs defaultValue="unlocks">
          <TabsList className="mb-6 w-full border border-border bg-muted/50 sm:w-auto">
            <TabsTrigger value="unlocks" className="gap-1.5 text-xs">
              <Unlock className="h-3 w-3" />
              {t({ en: "My Unlocks", zh: "我的解锁" })}
            </TabsTrigger>
            <TabsTrigger value="purchases" className="gap-1.5 text-xs">
              <Receipt className="h-3 w-3" />
              {t({ en: "Purchases", zh: "购买记录" })}
            </TabsTrigger>
            <TabsTrigger value="proofs" className="gap-1.5 text-xs">
              <ShieldCheck className="h-3 w-3" />
              {t({ en: "Saved Proofs", zh: "已保存证明" })}
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5 text-xs">
              <Activity className="h-3 w-3" />
              {t({ en: "Activity", zh: "活动记录" })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="unlocks">
            {unlocks.length === 0 ? (
              <EmptyState
                icon={<Package className="h-8 w-8" />}
                title={t({ en: "No unlocked signals", zh: "还没有已解锁信号" })}
                description={t({ en: "Browse the feed and unlock premium signals to build your library.", zh: "去信号流里解锁高级信号，慢慢建立你的资料库。" })}
              />
            ) : (
              <div className="space-y-2">
                {unlocks.map((signal) => (
                  <div
                    key={signal.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{marketLabel(signal.market, language)}</span>
                        <ProofBadge state={signal.proofState} />
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                        <div>
                          <span className="text-muted-foreground/60">{t({ en: "Asset", zh: "资产" })}</span>
                          <span className="ml-1 font-medium text-foreground">{assetLabel(signal.market, language)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground/60">{t({ en: "Timeframe", zh: "周期" })}</span>
                          <span className="ml-1 font-medium text-foreground">{timeframeLabel(signal.market, language)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(signal.committedAt, language)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t({ en: "Reveals:", zh: "揭示于：" })} {formatDateTime(signal.resolvesAt, language)}
                        </div>
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs">
                      <Link to={`/signal/${signal.id}`}>
                        <Eye className="h-3 w-3" />
                        {t({ en: "Open Signal", zh: "打开信号" })}
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="purchases">
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="hidden grid-cols-6 gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
                <div>{t({ en: "Order ID", zh: "订单号" })}</div>
                <div>{t({ en: "Resource", zh: "资源" })}</div>
                <div>{t({ en: "Amount", zh: "金额" })}</div>
                <div>{t({ en: "Paid At", zh: "支付时间" })}</div>
                <div>{t({ en: "Status", zh: "状态" })}</div>
                <div className="text-right">{t({ en: "Action", zh: "操作" })}</div>
              </div>
              {purchaseRows.map((purchase) => (
                <div
                  key={purchase.orderId}
                  className="grid grid-cols-1 items-center gap-2 border-b border-border/50 px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/30 sm:grid-cols-6"
                >
                  <div className="font-mono text-xs text-foreground">{purchase.orderId}</div>
                  <div className="text-xs text-foreground">{purchase.resourceLabel}</div>
                  <div className="font-mono text-xs text-foreground">{purchase.amount}</div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(purchase.paidAt, language)}</div>
                  <div>
                    <span className="inline-flex items-center rounded bg-signal-up/15 px-2 py-0.5 text-[10px] font-semibold text-signal-up">
                      {t({ en: "Confirmed", zh: "已确认" })}
                    </span>
                  </div>
                  <div className="text-right">
                    <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                      <Link to={`/signal/${purchase.signalId}`}>
                        {t({ en: "Detail", zh: "详情" })}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="proofs">
            {savedProofRows.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-8 w-8" />}
                title={t({ en: "No verified proofs yet", zh: "还没有已验证证明" })}
                description={t({ en: "Proofs will appear here once your purchased signals are verified via zkVerify.", zh: "你购买过的信号完成 zkVerify 验证后，对应证明会出现在这里。" })}
              />
            ) : (
              <div className="space-y-2">
                {savedProofRows.map((signal) => (
                  <div
                    key={signal.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-signal-verified/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{marketLabel(signal.market, language)}</span>
                        <ProofBadge state={signal.proofState} />
                      </div>
                      {signal.proofHash && <div className="truncate font-mono text-[11px] text-muted-foreground">{signal.proofHash}</div>}
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 gap-1.5 text-xs">
                      <ExternalLink className="h-3 w-3" />
                      {t({ en: "Open Proof", zh: "打开证明" })}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity">
            <div className="space-y-0">
              {activityRows.map((item, index) => (
                <div key={index} className="flex items-center gap-3 border-b border-border/50 px-3 py-3 last:border-b-0">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      item.type === "purchased"
                        ? "bg-signal-pending/10 text-signal-pending"
                        : item.type === "revealed"
                          ? "bg-signal-verified/10 text-signal-verified"
                          : "bg-primary/10 text-primary"
                    }`}
                  >
                    {item.type === "purchased" ? (
                      <Receipt className="h-3.5 w-3.5" />
                    ) : item.type === "revealed" ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <BookOpen className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground">{typeof item.label === "function" ? item.label(language) : item.label}</div>
                    <div className="text-[10px] text-muted-foreground">{formatDateTime(item.time, language)}</div>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 text-xs">
                    <Link to={`/signal/${item.signalId}`}>
                      {t({ en: "View", zh: "查看" })}
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function HeaderStat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="text-center sm:text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono font-semibold text-foreground ${small ? "text-xs" : "text-lg"}`}>{value}</div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-12 text-center">
      <div className="mx-auto mb-3 text-muted-foreground">{icon}</div>
      <h3 className="mb-1 font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
