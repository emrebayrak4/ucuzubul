import { brand } from "@pricora/config/brand";

/** Shown by server gates when GET /v1/auth/me cannot be reached (API down) — never a fake session. */
export function ApiUnreachable({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 px-6">
      <p className="text-xs font-medium tracking-wide text-text-muted uppercase">{brand.name} Admin</p>
      <h1 className="text-2xl font-semibold">API unavailable</h1>
      <p className="text-text-muted">
        The admin app could not verify your session because the {brand.name} API did not respond. Start the API
        (<code className="font-mono text-sm">pnpm dev</code>, port 4400) and reload.
      </p>
      <p className="rounded-md border border-border bg-surface-2 p-3 font-mono text-xs text-text-muted">{message}</p>
      <a href="/login" className="text-primary text-sm font-medium underline-offset-4 hover:underline">
        Back to login
      </a>
    </main>
  );
}
