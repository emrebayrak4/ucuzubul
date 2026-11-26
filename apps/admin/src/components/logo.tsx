import { brand } from "@pricora/config/brand";

export function Logo({ suffix }: { suffix?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="bg-primary text-primary-fg grid size-7 place-items-center rounded-md text-sm font-semibold">
        {brand.name.charAt(0)}
      </span>
      <span className="text-md font-semibold tracking-tight">{brand.name}</span>
      {suffix ? <span className="text-xs font-medium text-text-muted">{suffix}</span> : null}
    </span>
  );
}
