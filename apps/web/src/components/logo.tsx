import Link from "next/link";
import { brand } from "@pricora/config/brand";

/** Wordmark + simple tag mark (original, token colors). */
export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Link href="/" className={"inline-flex shrink-0 items-center gap-2 rounded-sm " + (className ?? "")} aria-label={`${brand.name} home`}>
      <svg viewBox="0 0 24 24" aria-hidden className="size-7">
        <rect x="1" y="1" width="22" height="22" rx="5" className={inverted ? "fill-primary-fg" : "fill-primary"} />
        <path d="M7 16.5V7.5h5.2a3.2 3.2 0 0 1 0 6.4H9.6" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={inverted ? "stroke-primary" : "stroke-primary-fg"} />
        <circle cx="16.6" cy="16.4" r="1.7" className="fill-accent" />
      </svg>
      <span className={"text-xl font-extrabold tracking-tight " + (inverted ? "text-primary-fg" : "text-text")}>{brand.name}</span>
    </Link>
  );
}
