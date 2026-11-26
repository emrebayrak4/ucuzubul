import Link from "next/link";
import { BellRing, Plane, Scale } from "lucide-react";
import { brand } from "@pricora/config/brand";
import { Logo } from "@/components/logo";

const props = [
  { icon: Scale, text: "Compare prices across stores, including shipping and estimated tax" },
  { icon: BellRing, text: "Price history and alerts so you buy at the right time" },
  { icon: Plane, text: "Flights and hotels from multiple providers in one search" },
];

/** Split layout (DESIGN_SYSTEM §13.6): form panel left, brand panel right on lg+. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-12">
      <main className="flex flex-col bg-surface-2 px-4 py-8 sm:px-8 lg:col-span-5">
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center">
          <Logo className="mb-6 self-center" />
          <ul className="mb-6 space-y-1.5 lg:hidden">
            {props.map((p) => (
              <li key={p.text} className="flex items-start gap-2 text-sm text-text-muted">
                <p.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                {p.text}
              </li>
            ))}
          </ul>
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">{children}</div>
          <p className="mt-8 text-center text-sm">
            <Link href="/" className="text-text-muted hover:text-text hover:underline">
              Continue without an account
            </Link>
          </p>
        </div>
      </main>
      <aside className="hidden flex-col justify-center border-l border-border bg-primary-soft p-12 text-primary-soft-fg lg:col-span-7 lg:flex">
        <div className="max-w-lg">
          <h2 className="text-3xl font-semibold tracking-tight">Buy at the right price, not just a lower one.</h2>
          <ul className="mt-8 space-y-5">
            {props.map((p) => (
              <li key={p.text} className="flex items-start gap-3 text-md">
                <p.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                {p.text}
              </li>
            ))}
          </ul>
          <figure className="mt-12" aria-label="Illustrative price history sparkline (not real data)">
            <svg viewBox="0 0 320 80" className="h-20 w-full max-w-sm" aria-hidden>
              <polyline
                points="0,30 30,26 60,34 90,28 120,40 150,36 180,48 210,44 240,58 270,52 300,64 320,62"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.5"
                strokeWidth="2"
              />
              <circle cx="300" cy="64" r="4" className="fill-primary" />
            </svg>
            <figcaption className="mt-2 text-xs opacity-70">Illustration only.</figcaption>
          </figure>
          <p className="mt-12 text-xs opacity-70">
            © {brand.legalEntity} · {brand.name}
          </p>
        </div>
      </aside>
    </div>
  );
}
