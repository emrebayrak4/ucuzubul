"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Bell, Download, Heart, ListChecks, Plus, Trash2, TriangleAlert } from "lucide-react";
import type { PriceAlert, UserPreferences } from "@pricora/contracts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  FieldMessage,
  IconButton,
  Input,
  Label,
  Select,
  Skeleton,
  Stat,
  Switch,
  formatPrice,
  toast,
} from "@pricora/ui";
import { ApiError, api, errorMessage } from "@/lib/api-browser";
import { useSession } from "@/lib/session";
import { ZIP_RE, setZipCookie } from "@/lib/zip";
import { ProductCardTile } from "@/components/product-card";
import { RecentlyViewedRail } from "@/components/recently-viewed";

function useAuthError() {
  const router = useRouter();
  return (err: unknown) => {
    if (err instanceof ApiError && err.isUnauthorized) router.push("/login?next=" + encodeURIComponent(window.location.pathname));
    else toast.error(errorMessage(err));
  };
}

function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

function PageTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {sub ? <p className="mt-1 text-sm text-text-muted">{sub}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------ Overview */

export function AccountOverview() {
  const { user } = useSession();
  const favs = useQuery({ queryKey: ["me", "favorites", "count"], queryFn: () => api.me.favorites.list({ page: 1, pageSize: 1 }) });
  const alerts = useQuery({ queryKey: ["me", "alerts", "count"], queryFn: () => api.me.alerts.list({ page: 1, pageSize: 1 }) });
  const lists = useQuery({ queryKey: ["me", "lists"], queryFn: () => api.me.lists.list() });
  const v = (q: { isPending: boolean; isError: boolean }, n: number | undefined) => (q.isPending ? "…" : q.isError ? "—" : String(n ?? 0));
  return (
    <div className="flex flex-col gap-8">
      <PageTitle sub={user?.email}>Hi{user?.name ? `, ${user.name}` : ""}</PageTitle>
      <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-surface p-4">
        <Link href="/account/saved" className="hover:opacity-80">
          <Stat label="Saved products" value={v(favs, favs.data?.total)} />
        </Link>
        <Link href="/account/alerts" className="hover:opacity-80">
          <Stat label="Price alerts" value={v(alerts, alerts.data?.total)} />
        </Link>
        <Link href="/account/lists" className="hover:opacity-80">
          <Stat label="Lists" value={v(lists, lists.data?.items.length)} />
        </Link>
      </div>
      <RecentlyViewedRail />
    </div>
  );
}

/* --------------------------------------------------------------- Saved */

export function SavedView() {
  const qc = useQueryClient();
  const onErr = useAuthError();
  const [page, setPage] = React.useState(1);
  const q = useQuery({ queryKey: ["me", "favorites", "page", page], queryFn: () => api.me.favorites.list({ page, pageSize: 24 }) });
  const remove = useMutation({
    mutationFn: (id: string) => api.me.favorites.remove(id),
    onSuccess: () => {
      toast.success("Removed from saved");
      void qc.invalidateQueries({ queryKey: ["me", "favorites"] });
    },
    onError: onErr,
  });
  return (
    <>
      <PageTitle>Saved products</PageTitle>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState icon={<Heart aria-hidden />} title="No saved products yet" description="Tap the heart on any product to save it here." action={<Button asChild variant="secondary" size="sm"><Link href="/deals">Browse deals</Link></Button>} />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {q.data.items.map((f) => (
              <li key={f.id} className="relative">
                <ProductCardTile product={f.product} />
                <IconButton label={`Remove ${f.product.title}`} size="sm" variant="secondary" className="absolute right-1.5 top-1.5 z-raised" disabled={remove.isPending} onClick={() => remove.mutate(f.id)}>
                  <Trash2 aria-hidden className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
          {q.data.totalPages > 1 ? (
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="price self-center text-sm text-text-muted">
                {page} / {q.data.totalPages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= q.data.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------- Alerts */

function describeAlert(a: PriceAlert): string {
  switch (a.type) {
    case "below_price":
      return a.targetPriceCents !== null ? `Below ${formatPrice(a.targetPriceCents, { currency: a.product.currency })}` : "Below target price";
    case "drop_percent":
      return a.dropPercentBp !== null ? `Drops ${a.dropPercentBp / 100}% or more` : "Price drop";
    case "back_in_stock":
      return "Back in stock";
    case "new_cheaper_store":
      return "A cheaper store appears";
    case "all_time_low":
      return "New all-time low";
    case "coupon":
      return "New coupon";
  }
}

export function AlertsView() {
  const qc = useQueryClient();
  const onErr = useAuthError();
  const q = useQuery({ queryKey: ["me", "alerts", "list"], queryFn: () => api.me.alerts.list({ page: 1, pageSize: 60 }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["me", "alerts"] });
  const toggle = useMutation({ mutationFn: (a: PriceAlert) => api.me.alerts.update(a.id, { active: !a.active }), onSuccess: () => void invalidate(), onError: onErr });
  const remove = useMutation({
    mutationFn: (id: string) => api.me.alerts.remove(id),
    onSuccess: () => {
      toast.success("Alert deleted");
      void invalidate();
    },
    onError: onErr,
  });
  return (
    <>
      <PageTitle sub="Create alerts from any product page. We only notify you based on real tracked prices.">Price alerts</PageTitle>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState icon={<Bell aria-hidden />} title="No price alerts yet" description="Open a product and choose “Set price alert”." action={<Button asChild variant="secondary" size="sm"><Link href="/search">Find a product</Link></Button>} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface" data-testid="alerts-list">
          {q.data.items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <Link href={`/products/${a.product.slug}`} className="line-clamp-1 text-sm font-medium hover:underline">
                  {a.product.title}
                </Link>
                <p className="text-xs text-text-muted">
                  {describeAlert(a)} · {a.channels.join(", ").replace("in_app", "in-app")}
                  {a.product.lowestPriceCents !== null ? ` · now ${formatPrice(a.product.lowestPriceCents, { currency: a.product.currency })}` : ""}
                  {a.lastTriggeredAt ? ` · last triggered ${new Date(a.lastTriggeredAt).toLocaleDateString("en-US")}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch id={`al-${a.id}`} checked={a.active} disabled={toggle.isPending} onCheckedChange={() => toggle.mutate(a)} aria-label={a.active ? "Pause alert" : "Resume alert"} />
                <Label htmlFor={`al-${a.id}`} className="w-12 text-xs font-normal text-text-muted">
                  {a.active ? "Active" : "Paused"}
                </Label>
                <IconButton label="Delete alert" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(a.id)}>
                  <Trash2 aria-hidden className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* --------------------------------------------------------------- Lists */

function ListDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const onErr = useAuthError();
  const q = useQuery({ queryKey: ["me", "lists", id], queryFn: () => api.me.lists.get(id) });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.me.lists.removeItem(id, itemId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me", "lists"] }),
    onError: onErr,
  });
  if (q.isPending) return <Loading rows={2} />;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.data.items.length) return <p className="py-3 text-sm text-text-muted">This list is empty.</p>;
  return (
    <ul className="divide-y divide-border">
      {q.data.items.map((it) => (
        <li key={it.id} className="flex items-center gap-3 py-2">
          <Link href={`/products/${it.product.slug}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
            {it.product.title}
          </Link>
          <span className="price text-xs text-text-muted">×{it.quantity}</span>
          <span className="price w-20 text-right text-sm">{it.product.lowestPriceCents !== null ? formatPrice(it.product.lowestPriceCents, { currency: it.product.currency }) : "—"}</span>
          <IconButton label="Remove item" size="sm" onClick={() => removeItem.mutate(it.id)}>
            <Trash2 aria-hidden className="size-4" />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

export function ListsView() {
  const qc = useQueryClient();
  const onErr = useAuthError();
  const [name, setName] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const q = useQuery({ queryKey: ["me", "lists"], queryFn: () => api.me.lists.list() });
  const create = useMutation({
    mutationFn: () => api.me.lists.create({ name: name.trim(), isPublic: false }),
    onSuccess: () => {
      setName("");
      toast.success("List created");
      void qc.invalidateQueries({ queryKey: ["me", "lists"] });
    },
    onError: onErr,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.me.lists.remove(id),
    onSuccess: () => {
      toast.success("List deleted");
      void qc.invalidateQueries({ queryKey: ["me", "lists"] });
    },
    onError: onErr,
  });
  return (
    <>
      <PageTitle sub="Group products you plan to buy together.">Lists</PageTitle>
      <form
        className="mb-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <Input aria-label="New list name" placeholder="New list name, e.g. Kitchen upgrade" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
          <Plus aria-hidden /> Create
        </Button>
      </form>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState icon={<ListChecks aria-hidden />} title="No lists yet" description="Create a list above to start grouping products." />
      ) : (
        <ul className="flex flex-col gap-3">
          {q.data.items.map((l) => (
            <li key={l.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center gap-3">
                <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)}>
                  <span className="block truncate font-medium">{l.name}</span>
                  <span className="price text-xs text-text-muted">
                    {l.itemCount} {l.itemCount === 1 ? "item" : "items"}
                    {l.estimatedTotalCents !== null ? ` · est. ${formatPrice(l.estimatedTotalCents)}` : ""}
                  </span>
                </button>
                <IconButton label={`Delete list ${l.name}`} size="sm" onClick={() => remove.mutate(l.id)}>
                  <Trash2 aria-hidden className="size-4" />
                </IconButton>
              </div>
              {open === l.id ? (
                <div className="mt-2 border-t border-border pt-2">
                  <ListDetail id={l.id} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ------------------------------------------------------------ Settings */

export function SettingsView() {
  const qc = useQueryClient();
  const router = useRouter();
  const onErr = useAuthError();
  const { setTheme } = useTheme();
  const q = useQuery({ queryKey: ["me", "preferences"], queryFn: () => api.me.preferences() });
  const [name, setName] = React.useState("");
  const [zip, setZip] = React.useState("");
  const [airport, setAirport] = React.useState("");
  const [notif, setNotif] = React.useState<UserPreferences["notifications"] | null>(null);
  const [theme, setThemeState] = React.useState<UserPreferences["theme"]>("system");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!q.data) return;
    setName(q.data.user.name ?? "");
    setZip(q.data.preferences.zip ?? "");
    setAirport(q.data.preferences.homeAirport ?? "");
    setNotif(q.data.preferences.notifications);
    setThemeState(q.data.preferences.theme);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      api.me.updatePreferences({
        name: name.trim() || undefined,
        zip: zip || null,
        homeAirport: airport ? airport.toUpperCase() : null,
        notifications: notif ?? undefined,
        theme,
      }),
    onSuccess: (res) => {
      setZipCookie(res.preferences.zip);
      setTheme(res.preferences.theme);
      qc.setQueryData(["me", "preferences"], res);
      void qc.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("Settings saved");
      router.refresh();
    },
    onError: onErr,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Enter your name";
    if (zip && !ZIP_RE.test(zip)) errs.zip = "Enter a 5-digit ZIP code";
    if (airport && !/^[A-Za-z]{3}$/.test(airport)) errs.airport = "Use a 3-letter airport code (e.g. JFK)";
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate();
  };

  if (q.isPending) return <Loading rows={4} />;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;

  const notifRows: Array<{ key: keyof UserPreferences["notifications"]; label: string; hint: string }> = [
    { key: "email", label: "Email notifications", hint: "Alerts and account emails" },
    { key: "push", label: "Push notifications", hint: "On devices where you've enabled them" },
    { key: "priceDrops", label: "Price drop alerts", hint: "When your alerts trigger" },
    { key: "weeklyDigest", label: "Weekly digest", hint: "Summary of your saved products" },
    { key: "marketing", label: "Product news", hint: "Occasional updates about new features" },
  ];

  return (
    <>
      <PageTitle>Settings</PageTitle>
      <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-6" data-testid="settings-form">
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
          <h2 className="font-semibold">Profile</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-name">Name</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} invalid={Boolean(errors.name)} />
            {errors.name ? <FieldMessage tone="error">{errors.name}</FieldMessage> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-zip">ZIP code (for tax estimates)</Label>
              <Input id="s-zip" inputMode="numeric" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} invalid={Boolean(errors.zip)} data-testid="settings-zip" />
              {errors.zip ? <FieldMessage tone="error">{errors.zip}</FieldMessage> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-airport">Home airport</Label>
              <Input id="s-airport" maxLength={3} value={airport} placeholder="e.g. JFK" onChange={(e) => setAirport(e.target.value.toUpperCase())} invalid={Boolean(errors.airport)} />
              {errors.airport ? <FieldMessage tone="error">{errors.airport}</FieldMessage> : null}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-theme">Theme</Label>
            <Select id="s-theme" value={theme} onChange={(e) => setThemeState(e.target.value as UserPreferences["theme"])}>
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </div>
        </section>
        {notif ? (
          <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <h2 className="font-semibold">Notifications</h2>
            {notifRows.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-4">
                <Label htmlFor={`n-${r.key}`} className="flex flex-col font-normal">
                  <span className="text-sm font-medium">{r.label}</span>
                  <span className="text-xs text-text-muted">{r.hint}</span>
                </Label>
                <Switch id={`n-${r.key}`} checked={notif[r.key]} onCheckedChange={(c) => setNotif({ ...notif, [r.key]: c })} />
              </div>
            ))}
          </section>
        ) : null}
        <div>
          <Button type="submit" loading={save.isPending}>
            Save settings
          </Button>
        </div>
      </form>
    </>
  );
}

/* ------------------------------------------------------------- Privacy */

export function PrivacyView() {
  const router = useRouter();
  const qc = useQueryClient();
  const [exporting, setExporting] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const doExport = async () => {
    setExporting(true);
    try {
      const data = await api.me.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `account-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const del = useMutation({
    mutationFn: () => api.me.deleteAccount({ confirm: "DELETE", password: password || undefined }),
    onSuccess: () => {
      qc.clear();
      setZipCookie(null);
      router.replace("/?account=deleted");
      router.refresh();
    },
    onError: (err) => setError(err instanceof ApiError && err.status === 401 ? "Password is incorrect." : errorMessage(err)),
  });

  return (
    <>
      <PageTitle>Privacy &amp; data</PageTitle>
      <div className="flex max-w-xl flex-col gap-6">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="font-semibold">Export your data</h2>
          <p className="mt-1 text-sm text-text-muted">Download your profile, preferences, saved products, alerts, lists, recently viewed and searches as JSON.</p>
          <Button variant="secondary" className="mt-3" loading={exporting} onClick={() => void doExport()} data-testid="export-data">
            <Download aria-hidden /> Download my data
          </Button>
        </section>
        <section className="rounded-lg border border-error/40 bg-surface p-4">
          <h2 className="font-semibold text-error">Delete account</h2>
          <p className="mt-1 text-sm text-text-muted">Permanently deletes your account, saved products, alerts and lists. This can&apos;t be undone.</p>
          <Button variant="destructive" className="mt-3" onClick={() => setOpen(true)} data-testid="delete-account">
            <Trash2 aria-hidden /> Delete my account
          </Button>
        </section>
      </div>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setConfirm("");
            setPassword("");
            setError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              if (confirm !== "DELETE") return setError("Type DELETE to confirm.");
              del.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TriangleAlert aria-hidden className="size-5 text-error" /> Delete your account?
              </DialogTitle>
              <DialogDescription>This permanently removes your account and all its data. It cannot be undone.</DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="del-confirm">
                  Type <span className="font-mono font-semibold">DELETE</span> to confirm
                </Label>
                <Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="del-pass">Password</Label>
                <Input id="del-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <FieldMessage>Required if your account has a password.</FieldMessage>
              </div>
              {error ? <FieldMessage tone="error">{error}</FieldMessage> : null}
            </div>
            <DialogFooter className="mt-5">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" loading={del.isPending} disabled={confirm !== "DELETE"}>
                Permanently delete
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
