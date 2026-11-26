import { BRAND_NAME } from "../shared/env";

/**
 * Brand logo (generated at build from packages/config/assets/whichless-logo*.png into public/brand/).
 * The white variant is shown in dark mode.
 */
export function Logo({ className = "h-7" }: { className?: string }) {
  return (
    <span className="inline-flex items-center">
      <img src="/brand/logo.png" alt={BRAND_NAME} className={`${className} w-auto dark:hidden`} />
      <img src="/brand/logo-white.png" alt={BRAND_NAME} className={`${className} hidden w-auto dark:block`} />
    </span>
  );
}
