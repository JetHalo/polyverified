import type { AnchorHTMLAttributes } from "react";
import { forwardRef, useEffect } from "react";
import NextLink from "next/link";
import { useRouter } from "next/router";

type Primitive = string | string[] | undefined;

function firstValue(value: Primitive) {
  return Array.isArray(value) ? value[0] : value;
}

export interface CompatLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  replace?: boolean;
}

export const Link = forwardRef<HTMLAnchorElement, CompatLinkProps>(
  ({ to, replace, children, ...props }, ref) => {
    return (
      <NextLink href={to} replace={replace} legacyBehavior passHref>
        <a ref={ref} {...props}>
          {children}
        </a>
      </NextLink>
    );
  },
);

Link.displayName = "CompatLink";

export function useParams<T extends Record<string, string | undefined>>() {
  const router = useRouter();
  const params = Object.fromEntries(
    Object.entries(router.query).map(([key, value]) => [key, firstValue(value)]),
  );
  return params as T;
}

export function useLocation() {
  const router = useRouter();
  return {
    pathname: router.asPath,
  };
}

export function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    void (replace ? router.replace(to) : router.push(to));
  }, [replace, router, to]);

  return null;
}
