import Link from "next/link";
import { SearchX } from "lucide-react";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <SearchX aria-hidden className="mt-6 size-10 text-text-muted" />
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-text-muted">The page or product you&apos;re looking for doesn&apos;t exist or is no longer tracked.</p>
      <div className="flex gap-2">
        <Link href="/" className="inline-flex h-9.5 items-center rounded-md bg-primary px-4 font-medium text-primary-fg hover:bg-primary-hover">
          Go home
        </Link>
        <Link href="/search" className="inline-flex h-9.5 items-center rounded-md border border-border bg-surface px-4 font-medium hover:bg-surface-2">
          Search products
        </Link>
      </div>
    </div>
  );
}
