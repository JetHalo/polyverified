import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { NavLink } from "@/components/NavLink";
import { Activity, ChevronDown, History, Library, User, Wallet, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { Link } from "@/lib/router";
import { ensureBaseChain, getBaseNetworkLabel, readEthereumChainId, type EthereumProvider } from "@/lib/base-sepolia";

type WalletSessionPayload = {
  authenticated: boolean;
  session: {
    walletAddress: string;
    chainId: number;
  } | null;
};

type BaseNetworkOption = {
  chainId: 8453 | 84532;
  label: string;
};

const baseNetworkOptions: BaseNetworkOption[] = [
  { chainId: 84532, label: "Base Sepolia" },
  { chainId: 8453, label: "Base Mainnet" },
];

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function normalizeWalletAddress(address: string | null | undefined) {
  return address?.trim().toLowerCase() ?? null;
}

function getEthereumProvider() {
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

export function AppNav() {
  const router = useRouter();
  const { isZh, toggleLanguage, t } = useLanguage();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [activeChainId, setActiveChainId] = useState<number | null>(null);
  const [networkMenuOpen, setNetworkMenuOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const links = [
    { to: "/", label: t({ en: "Feed", zh: "信号流" }), icon: Activity },
    { to: "/history", label: t({ en: "History", zh: "历史" }), icon: History },
    { to: "/agent", label: "Agent", icon: User },
    { to: "/library", label: t({ en: "My Library", zh: "我的库" }), icon: Library },
  ];
  const networkLabel = getBaseNetworkLabel(activeChainId);
  const shortWalletAddress = useMemo(
    () => (walletAddress ? shortenAddress(walletAddress) : null),
    [walletAddress],
  );

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function clearWalletSessionAndReconnect() {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
        });
      } catch {
        // Best-effort logout. The client state still needs to stop showing the stale wallet.
      }

      if (!cancelled) {
        setWalletAddress(null);
        setActiveChainId(null);
        setNetworkMenuOpen(false);
        setWalletMenuOpen(false);
      }

      const redirectTo =
        typeof router.asPath === "string" && router.asPath.trim().length > 0 ? router.asPath : "/library";
      void router.push(`/connect?redirectTo=${encodeURIComponent(redirectTo)}`);
    }

    async function syncWalletSession() {
      try {
        const response = await fetch("/api/auth/session", {
          credentials: "same-origin",
        });
        const payload = (await response.json()) as WalletSessionPayload;

        if (cancelled || !payload.authenticated || !payload.session) {
          if (!cancelled) {
            setWalletAddress(null);
            setActiveChainId(null);
            setNetworkMenuOpen(false);
            setWalletMenuOpen(false);
          }
          return;
        }

        const sessionWalletAddress = payload.session.walletAddress;
        const normalizedSessionWalletAddress = normalizeWalletAddress(sessionWalletAddress);

        const provider = getEthereumProvider();
        if (provider) {
          try {
            const accounts = (await provider.request({
              method: "eth_accounts",
            })) as string[];
            const activeWalletAddress = normalizeWalletAddress(accounts[0]);

            if (activeWalletAddress !== normalizedSessionWalletAddress) {
              await clearWalletSessionAndReconnect();
              return;
            }
          } catch {
            await clearWalletSessionAndReconnect();
            return;
          }

          if (!cancelled) {
            setWalletAddress(sessionWalletAddress);
          }

          try {
            const chainId = await readEthereumChainId(provider);

            if (!cancelled) {
              setActiveChainId(chainId);
            }
          } catch {
            if (!cancelled) {
              setActiveChainId(payload.session.chainId);
            }
          }

          const handleChainChanged = (chainIdHex: string) => {
            if (!cancelled) {
              setActiveChainId(Number.parseInt(chainIdHex, 16));
            }
          };
          const handleAccountsChanged = (accounts: string[]) => {
            const nextWalletAddress = normalizeWalletAddress(accounts[0]);

            if (nextWalletAddress !== normalizedSessionWalletAddress) {
              void clearWalletSessionAndReconnect();
              return;
            }

            if (!cancelled) {
              setWalletAddress(sessionWalletAddress);
            }
          };

          (provider as any).on?.("chainChanged", handleChainChanged);
          (provider as any).on?.("accountsChanged", handleAccountsChanged);

          cleanup = () => {
            (provider as any).removeListener?.("chainChanged", handleChainChanged);
            (provider as any).removeListener?.("accountsChanged", handleAccountsChanged);
          };
          return;
        }

        if (!cancelled) {
          setWalletAddress(sessionWalletAddress);
          setActiveChainId(payload.session.chainId);
        }
      } catch {
        if (!cancelled) {
          setWalletAddress(null);
          setActiveChainId(null);
          setNetworkMenuOpen(false);
          setWalletMenuOpen(false);
        }
      }
    }

    void syncWalletSession();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [router]);

  async function handleNetworkSwitch(nextChainId: string) {
    const provider = getEthereumProvider();

    if (!provider) {
      return;
    }

    const parsedChainId = Number.parseInt(nextChainId, 10) as 8453 | 84532;

    try {
      await ensureBaseChain(provider, parsedChainId);
      setActiveChainId(parsedChainId);
    } catch {
      // Keep the previous label when the wallet rejects or fails to complete a network switch.
    }
  }

  async function handleManualLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Best-effort logout.
    }

    setWalletAddress(null);
    setActiveChainId(null);
    setNetworkMenuOpen(false);
    setWalletMenuOpen(false);
    await router.push("/connect");
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-signal-verified" />
          <span className="font-semibold text-sm text-foreground tracking-tight">
            {t({ en: "Poly Verified", zh: "Poly Verified" })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`
              }
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
          {walletAddress ? (
            <>
              <div className="relative">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  aria-label={networkLabel}
                  aria-expanded={networkMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setNetworkMenuOpen((value) => !value);
                  }}
                >
                  <span>{networkLabel}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${networkMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {networkMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-10 min-w-[12rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                  >
                    <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
                      {t({ en: "Network", zh: "网络" })}
                    </div>
                    {baseNetworkOptions.map((option) => (
                      <button
                        key={option.chainId}
                        type="button"
                        role="menuitemradio"
                        aria-checked={activeChainId === option.chainId}
                        className={`flex w-full items-center rounded-sm px-3 py-2 text-left text-sm transition-colors ${
                          activeChainId === option.chainId
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-accent"
                        }`}
                        onClick={() => {
                          setNetworkMenuOpen(false);
                          void handleNetworkSwitch(String(option.chainId));
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  aria-label={shortWalletAddress ?? walletAddress ?? t({ en: "Connected wallet", zh: "已连接钱包" })}
                  aria-expanded={walletMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setWalletMenuOpen((value) => !value);
                    setNetworkMenuOpen(false);
                  }}
                >
                  <Wallet className="h-3.5 w-3.5" />
                  <span>{shortWalletAddress}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${walletMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {walletMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-10 min-w-[11rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                  >
                    <Link
                      to="/library"
                      role="menuitem"
                      className="flex w-full items-center rounded-sm px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
                      onClick={() => {
                        setWalletMenuOpen(false);
                      }}
                    >
                      {t({ en: "My Library", zh: "我的库" })}
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center rounded-sm px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
                      onClick={() => {
                        void handleManualLogout();
                      }}
                    >
                      {t({ en: "Log out", zh: "退出登录" })}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <NavLink
              to="/connect"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`
              }
            >
              <Wallet className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t({ en: "Connect", zh: "连接" })}</span>
            </NavLink>
          )}
          <button
            type="button"
            onClick={toggleLanguage}
            className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            aria-label={isZh ? "EN" : "中文"}
          >
            {isZh ? "EN" : "中文"}
          </button>
        </div>
      </div>
    </nav>
  );
}
