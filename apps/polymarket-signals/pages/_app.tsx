import type { AppProps } from "next/app";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppNav } from "@/components/AppNav";
import { LanguageProvider } from "@/lib/language";
import "../src/index.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppNav />
        <Component {...pageProps} />
      </TooltipProvider>
    </LanguageProvider>
  );
}
