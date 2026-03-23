import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Direction, Market, ProofState } from "@/lib/mock-data";

export type Language = "en" | "zh";

type Copy = {
  en: string;
  zh: string;
};

type LanguageContextValue = {
  language: Language;
  isZh: boolean;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (copy: Copy) => string;
};

const STORAGE_KEY = "zkpoly-language";

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "zh") {
      setLanguage("zh");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  return (
    <LanguageContext.Provider
      value={{
        language,
        isZh: language === "zh",
        setLanguage,
        toggleLanguage: () => setLanguage((current) => (current === "en" ? "zh" : "en")),
        t: (copy) => copy[language],
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}

export function translate(language: Language, copy: Copy) {
  return copy[language];
}

export function formatDateTime(iso: string, language: Language) {
  const formatted = new Date(iso).toLocaleString(language === "zh" ? "zh-CN" : "en-US", {
    month: language === "zh" ? "numeric" : "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: language === "zh" ? false : true,
    timeZone: "UTC",
  });

  return `${formatted} UTC`;
}

export function marketLabel(market: Market, language: Language) {
  return translate(language, {
    en: market,
    zh:
      market === "BTC Hourly"
        ? "BTC 小时级"
        : market === "ETH Hourly"
          ? "ETH 小时级"
          : market === "Gold Daily"
            ? "黄金日线"
            : "白银日线",
  });
}

export function timeframeLabel(market: Market, language: Language) {
  return translate(language, {
    en: market.includes("Hourly") ? "Hourly" : "Daily",
    zh: market.includes("Hourly") ? "小时级" : "日线",
  });
}

export function assetLabel(market: Market, language: Language) {
  return translate(language, {
    en: market.startsWith("Gold") ? "Gold" : market.startsWith("Silver") ? "Silver" : market.split(" ")[0],
    zh: market.startsWith("Gold") ? "黄金" : market.startsWith("Silver") ? "白银" : market.split(" ")[0],
  });
}

export function directionLabel(direction: Direction, language: Language) {
  return translate(language, {
    en: direction,
    zh: direction === "Up" ? "看涨" : "看跌",
  });
}

export function proofStateLabel(state: ProofState, language: Language) {
  return translate(language, {
    en:
      state === "committed"
        ? "Committed"
        : state === "revealed"
          ? "Revealed"
          : state === "verified"
            ? "Verified"
            : "Failed",
    zh:
      state === "committed"
        ? "已承诺"
        : state === "revealed"
          ? "已公开"
          : state === "verified"
            ? "已验证"
            : "已失败",
  });
}

export function outcomeLabel(outcome: "win" | "loss", language: Language) {
  return translate(language, {
    en: outcome === "win" ? "WIN" : "LOSS",
    zh: outcome === "win" ? "命中" : "失手",
  });
}

export function hitMissLabel(hit: boolean, language: Language) {
  return translate(language, {
    en: hit ? "HIT" : "MISS",
    zh: hit ? "命中" : "失手",
  });
}

export function confidenceLabel(confidence: "High" | "Medium-High" | "Medium" | "Low", language: Language) {
  return translate(language, {
    en: confidence,
    zh:
      confidence === "High"
        ? "高"
        : confidence === "Medium-High"
          ? "中高"
          : confidence === "Medium"
            ? "中等"
            : "低",
  });
}
