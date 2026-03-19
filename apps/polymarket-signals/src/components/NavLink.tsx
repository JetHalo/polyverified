import type { AnchorHTMLAttributes } from "react";
import { forwardRef } from "react";
import { useRouter } from "next/router";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href"> {
  to: string;
  end?: boolean;
  className?: string | ((state: { isActive: boolean; isPending: boolean }) => string);
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, end = false, ...props }, ref) => {
    const router = useRouter();
    const pathname = router.asPath;
    const isActive = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
    const resolvedClassName =
      typeof className === "function"
        ? className({ isActive, isPending: false })
        : cn(className, isActive && activeClassName, pendingClassName);

    return <Link ref={ref} to={to} className={resolvedClassName} {...props} />;
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
