import { useState } from "react";
import { useRouter } from "next/router";

import { Link } from "@/lib/router";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { ensureBaseSepoliaChain } from "@/lib/base-sepolia";
import {
  Wallet,
  ShieldCheck,
  BookOpen,
  ArrowLeft,
  Lock,
  History,
  Bookmark,
  RotateCcw,
} from "lucide-react";

interface ApiErrorPayload {
  error?: string;
  message?: string;
  [key: string]: unknown;
}

async function readApiPayload(response: Response): Promise<ApiErrorPayload> {
  const contentType =
    typeof response.headers?.get === "function" ? response.headers.get("content-type")?.toLowerCase() ?? "" : "";

  if (contentType.includes("application/json") || typeof response.json === "function") {
    return (await response.json()) as ApiErrorPayload;
  }

  const bodyText = await response.text();

  if (bodyText.trim().startsWith("<!DOCTYPE") || bodyText.trim().startsWith("<html")) {
    return {
      error: "Wallet login endpoint returned an unexpected response. Please try again.",
    };
  }

  return {
    error: bodyText.trim() || "Wallet login failed.",
  };
}

declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    };
  }
}

export default function ConnectAccount() {
  const { t } = useLanguage();
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirectTo =
    typeof router.query.redirectTo === "string" && router.query.redirectTo.trim().length > 0
      ? router.query.redirectTo
      : "/library";

  async function handleConnect() {
    if (connecting) {
      return;
    }

    if (!window.ethereum) {
      setError(t({ en: "No wallet detected in this browser.", zh: "当前浏览器中未检测到钱包。" }));
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const walletAddress = accounts[0];

      if (!walletAddress) {
        throw new Error(t({ en: "Wallet account not found.", zh: "未找到钱包账户。" }));
      }

      await ensureBaseSepoliaChain(window.ethereum);

      const chainIdHex = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;
      const chainId = Number.parseInt(chainIdHex, 16);

      const nonceResponse = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          walletAddress,
          chainId,
        }),
      });
      const noncePayload = await readApiPayload(nonceResponse);

      if (!nonceResponse.ok) {
        throw new Error(noncePayload?.error ?? "Failed to create wallet challenge");
      }

      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [noncePayload.message, walletAddress],
      })) as string;

      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          walletAddress,
          chainId,
          signature,
        }),
      });
      const verifyPayload = await readApiPayload(verifyResponse);

      if (!verifyResponse.ok || !verifyPayload?.authenticated) {
        throw new Error(verifyPayload?.error ?? "Wallet authentication failed");
      }

      await router.push(redirectTo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t({ en: "Wallet connection failed.", zh: "钱包连接失败。" }));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <PageShell
      title={t({ en: "Connect Account", zh: "连接账户" })}
      subtitle={t({
        en: "Link your wallet to manage purchases and reopen premium content.",
        zh: "连接钱包后，你可以管理购买记录，并重新打开已解锁的高级内容。",
      })}
    >
      <div className="mx-auto max-w-xl space-y-6">
        <div className="rounded-xl border border-border bg-card p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Wallet className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-lg font-bold text-foreground">{t({ en: "Connect Your Wallet", zh: "连接你的钱包" })}</h2>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
              {t({
                en: "Your wallet acts as your identity on this platform. It binds your purchases, unlocked signals, and proof links to your account — so you can reopen them anytime.",
                zh: "你的钱包就是平台上的身份标识。它会把购买记录、已解锁信号和证明链接绑定到你的账户上，方便你随时回来继续查看。",
              })}
            </p>
          </div>

          <Button className="mb-3 w-full" size="lg" onClick={() => void handleConnect()} disabled={connecting}>
            <Wallet className="mr-2 h-4 w-4" />
            {connecting ? t({ en: "Connecting…", zh: "连接中…" }) : t({ en: "Connect Wallet", zh: "连接钱包" })}
          </Button>
          {error && <p className="mb-3 text-center text-xs text-signal-down">{error}</p>}
          <p className="text-center text-[10px] text-muted-foreground">
            {t({
              en: "No account creation required. Wallet signature only. No passwords, no email.",
              zh: "无需注册账号，只需钱包签名。不用密码，也不用邮箱。",
            })}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 text-sm font-semibold text-foreground">{t({ en: "Why connect?", zh: "为什么要连接？" })}</h3>
          <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
            {t({
              en: "Connecting your wallet is not about tracking your trades or monitoring your portfolio. It exists solely to give you a persistent account that stores what you've purchased and unlocked on this platform.",
              zh: "连接钱包并不是为了追踪你的交易或监控持仓，而是为了给你一个持续可用的账户入口，保存你在平台上购买和解锁过的内容。",
            })}
          </p>

          <div className="space-y-3">
            <Reason
              icon={History}
              title={t({ en: "Save purchase history", zh: "保存购买记录" })}
              desc={t({ en: "Every signal you unlock via x402 is recorded and tied to your wallet.", zh: "通过 x402 解锁的每一条信号，都会记录并绑定到你的钱包。" })}
            />
            <Reason
              icon={Bookmark}
              title={t({ en: "Save unlocked signals", zh: "保存已解锁信号" })}
              desc={t({ en: "Unlocked premium content stays accessible in your library.", zh: "已解锁的高级内容会持续保留在你的资料库里。" })}
            />
            <Reason
              icon={ShieldCheck}
              title={t({ en: "Save proof links", zh: "保存证明链接" })}
              desc={t({ en: "Bookmark zkVerify proof links for every verified signal you've purchased.", zh: "你购买过的每条已验证信号，都可以保留对应的 zkVerify 证明链接。" })}
            />
            <Reason
              icon={RotateCcw}
              title={t({ en: "Reopen premium content", zh: "重新打开高级内容" })}
              desc={t({ en: "Return to any previously unlocked signal without paying again.", zh: "之前已经解锁过的信号，可以随时再打开，无需重复付费。" })}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            {t({ en: "What this is not", zh: "这不意味着什么" })}
          </h3>
          <ul className="space-y-2">
            <NotItem text={t({ en: "We do not track your trades or positions.", zh: "我们不会追踪你的交易或持仓。" })} />
            <NotItem text={t({ en: "We do not access your wallet balance or tokens.", zh: "我们不会读取你的钱包余额或代币信息。" })} />
            <NotItem text={t({ en: "We do not share your data with third parties.", zh: "我们不会把你的数据分享给第三方。" })} />
            <NotItem text={t({ en: "We only use your wallet address as a lookup key for your purchases.", zh: "我们只会把钱包地址当作查询你购买记录的索引键。" })} />
          </ul>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" className="flex-1" asChild>
            <Link to="/library">
              <BookOpen className="mr-1.5 h-4 w-4" />
              {t({ en: "Enter My Library", zh: "进入我的库" })}
            </Link>
          </Button>
          <Button variant="ghost" className="flex-1" asChild>
            <Link to="/">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t({ en: "Back to Feed", zh: "返回信号流" })}
            </Link>
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

function Reason({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}

function NotItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-xs text-muted-foreground">
      <span className="mt-0.5 shrink-0 text-signal-down">✕</span>
      {text}
    </li>
  );
}
