import { useLocation } from "@/lib/router";
import { useEffect } from "react";
import { useLanguage } from "@/lib/language";

const NotFound = () => {
  const location = useLocation();
  const { t } = useLanguage();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t({ en: "Oops! Page not found", zh: "页面不存在" })}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {t({ en: "Return to Home", zh: "返回首页" })}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
