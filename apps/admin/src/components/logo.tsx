import Image from "next/image";
import { brand } from "@pricora/config/brand";

/** Brand wordmark (light / dark variants from packages/config/assets, resized into public/brand). */
export function Logo({ suffix, size = "md" }: { suffix?: string; size?: "md" | "lg" }) {
  const h = size === "lg" ? "h-8" : "h-6";
  return (
    <span className="inline-flex items-center gap-2">
      <Image src="/brand/whichless-logo.png" alt={brand.name} width={640} height={120} priority className={`${h} w-auto dark:hidden`} />
      <Image src="/brand/whichless-logo-white.png" alt={brand.name} width={640} height={120} priority className={`${h} hidden w-auto dark:block`} />
      {suffix ? <span className="text-xs font-medium text-text-muted">{suffix}</span> : null}
    </span>
  );
}
