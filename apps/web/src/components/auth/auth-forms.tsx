"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { z } from "zod";
import { Email, Password } from "@pricora/contracts";
import { Button, Checkbox, FieldMessage, IconButton, Input, Label, Separator, cn } from "@pricora/ui";
import { ApiError, api, errorMessage, fieldErrors } from "@/lib/api-browser";
import { safeNext } from "@/lib/nav";
import { ME_QUERY_KEY } from "@/lib/session";

/* ------------------------------------------------------------- helpers */

function Field({
  id,
  label,
  error,
  hint,
  children,
  trailingLabel,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  trailingLabel?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {trailingLabel}
      </div>
      {children}
      {error ? (
        <FieldMessage id={`${id}-error`} tone="error">
          {error}
        </FieldMessage>
      ) : hint ? (
        <FieldMessage id={`${id}-hint`}>{hint}</FieldMessage>
      ) : null}
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  invalid,
  autoComplete,
  describedBy,
  testId,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  autoComplete: string;
  describedBy?: string;
  testId?: string;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        invalid={invalid}
        aria-describedby={describedBy}
        className="pr-11"
        data-testid={testId}
      />
      <IconButton label={show ? "Hide password" : "Show password"} size="sm" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShow((s) => !s)}>
        {show ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </IconButton>
    </div>
  );
}

/** Heuristic strength hint only (the API enforces the actual policy: 10–128 chars). */
function strength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: "" };
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length < 10) s = Math.min(s, 1);
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  return { score: s as 0 | 1 | 2 | 3 | 4, label: pw.length < 10 ? "Too short — use at least 10 characters" : labels[s]! };
}

function StrengthMeter({ password }: { password: string }) {
  const { score, label } = strength(password);
  if (!password) return null;
  return (
    <div aria-live="polite" className="flex items-center gap-2">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full", i <= score ? (score >= 3 ? "bg-success" : score === 2 ? "bg-warning" : "bg-error") : "bg-surface-3")} />
        ))}
      </div>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md bg-error-soft px-3 py-2 text-sm text-error" data-testid="form-error">
      {message}
    </div>
  );
}

function zodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/* --------------------------------------------------------------- OAuth */

function OAuthButtons({ next }: { next: string }) {
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const health = useQuery({ queryKey: ["health"], queryFn: () => api.health(), staleTime: 5 * 60_000, retry: false });
  const status = (provider: "google" | "apple") => health.data?.adapters.find((a) => a.kind === "oauth" && a.id.toLowerCase().includes(provider))?.status;

  const start = async (provider: "google" | "apple") => {
    setMessage(null);
    setBusy(provider);
    const url = api.auth.oauthUrl(provider, next);
    try {
      // Probe first: when keys are missing the API answers 503 pending_configuration instead of redirecting.
      const res = await fetch(url, { credentials: "include", redirect: "manual" });
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        window.location.href = url;
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      if (res.status === 503 || body?.error?.code === "pending_configuration") {
        setMessage(`${provider === "google" ? "Google" : "Apple"} sign-in isn't configured yet. Please use email and password for now.`);
      } else {
        setMessage(body?.error?.message ?? "This sign-in option is unavailable right now.");
      }
    } catch {
      setMessage("We can't reach the sign-in service right now.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {(["google", "apple"] as const).map((p) => {
        const s = status(p);
        const notConfigured = s !== undefined && s !== "live";
        return (
          <Button key={p} type="button" variant="secondary" fullWidth disabled={notConfigured} loading={busy === p} onClick={() => void start(p)} data-testid={`oauth-${p}`}>
            {p === "google" ? <GoogleMark /> : <AppleMark />}
            Continue with {p === "google" ? "Google" : "Apple"}
            {notConfigured ? <span className="text-xs font-normal text-text-muted">· Not available yet</span> : null}
          </Button>
        );
      })}
      {message ? (
        <p role="status" className="text-xs text-text-muted" data-testid="oauth-message">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8.1z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.2V7.2H2.1a11 11 0 0 0 0 9.8l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.2l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}
function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1-2.8-4.2zM14 5.1c.7-.9 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z" />
    </svg>
  );
}

function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-text-muted">
      <Separator className="flex-1" /> or <Separator className="flex-1" />
    </div>
  );
}

/* --------------------------------------------------------------- Login */

const LoginSchema = z.object({ email: Email, password: z.string().min(1, "Enter your password") });

function LoginFormInner() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const next = safeNext(params.get("next"), "/");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(true);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) return setErrors(zodErrors(parsed.error));
    setErrors({});
    setPending(true);
    try {
      const res = await api.auth.login({ ...parsed.data, remember });
      api.setCsrfToken(res.csrfToken);
      qc.setQueryData(ME_QUERY_KEY, { user: res.user, csrfToken: res.csrfToken });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(err instanceof ApiError && err.status === 401 ? "Email or password is incorrect." : errorMessage(err));
      setPending(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
      <p className="mt-1 text-sm text-text-muted">
        New here?{" "}
        <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-primary underline underline-offset-2">
          Create an account
        </Link>
      </p>
      <div className="mt-6">
        <OAuthButtons next={next} />
      </div>
      <OrDivider />
      <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-testid="login-form">
        <FormAlert message={formError} />
        <Field id="email" label="Email" error={errors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} data-testid="login-email" />
        </Field>
        <Field
          id="password"
          label="Password"
          error={errors.password}
          trailingLabel={
            <Link href="/forgot-password" className="text-xs font-medium text-primary underline underline-offset-2">
              Forgot password?
            </Link>
          }
        >
          <PasswordInput id="password" value={password} onChange={setPassword} invalid={Boolean(errors.password)} autoComplete="current-password" describedBy={errors.password ? "password-error" : undefined} testId="login-password" />
        </Field>
        <div className="flex items-center gap-2">
          <Checkbox id="remember" checked={remember} onCheckedChange={(c) => setRemember(c === true)} />
          <Label htmlFor="remember" className="font-normal">
            Keep me logged in
          </Label>
        </div>
        <Button type="submit" fullWidth size="lg" loading={pending} data-testid="login-submit">
          Log in
        </Button>
      </form>
    </>
  );
}

/* -------------------------------------------------------------- Signup */

const SignupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: Email,
  password: Password,
  acceptTerms: z.literal(true, { message: "Please accept the Terms and Privacy Policy" }),
});

function SignupFormInner() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const next = safeNext(params.get("next"), "/account");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [accept, setAccept] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = SignupSchema.safeParse({ name, email, password, acceptTerms: accept || undefined });
    if (!parsed.success) return setErrors(zodErrors(parsed.error));
    setErrors({});
    setPending(true);
    try {
      const res = await api.auth.register(parsed.data);
      api.setCsrfToken(res.csrfToken);
      qc.setQueryData(ME_QUERY_KEY, { user: res.user, csrfToken: res.csrfToken });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(err instanceof ApiError && err.status === 409 ? "An account with this email already exists. Try logging in." : errorMessage(err));
      setPending(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-text-muted">
        Already have one?{" "}
        <Link href={`/login${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-primary underline underline-offset-2">
          Log in
        </Link>
      </p>
      <div className="mt-6">
        <OAuthButtons next={next} />
      </div>
      <OrDivider />
      <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-testid="signup-form">
        <FormAlert message={formError} />
        <Field id="name" label="Name" error={errors.name}>
          <Input id="name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} invalid={Boolean(errors.name)} aria-describedby={errors.name ? "name-error" : undefined} data-testid="signup-name" />
        </Field>
        <Field id="email" label="Email" error={errors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} data-testid="signup-email" />
        </Field>
        <Field id="password" label="Password" error={errors.password} hint="At least 10 characters. A longer passphrase is stronger.">
          <PasswordInput id="password" value={password} onChange={setPassword} invalid={Boolean(errors.password)} autoComplete="new-password" describedBy={errors.password ? "password-error" : "password-hint"} testId="signup-password" />
          <StrengthMeter password={password} />
        </Field>
        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-2">
            <Checkbox id="terms" checked={accept} onCheckedChange={(c) => setAccept(c === true)} className="mt-0.5" aria-describedby={errors.acceptTerms ? "terms-error" : undefined} />
            <Label htmlFor="terms" className="text-sm font-normal leading-snug">
              I agree to the{" "}
              <Link href="/legal/terms" className="text-primary underline underline-offset-2">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="text-primary underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </Label>
          </div>
          {errors.acceptTerms ? (
            <FieldMessage id="terms-error" tone="error">
              {errors.acceptTerms}
            </FieldMessage>
          ) : null}
        </div>
        <Button type="submit" fullWidth size="lg" loading={pending} data-testid="signup-submit">
          Create account
        </Button>
      </form>
    </>
  );
}

/* ----------------------------------------------------- Forgot password */

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = Email.safeParse(email);
    if (!parsed.success) return setError("Enter a valid email address.");
    setError(null);
    setPending(true);
    try {
      const res = await api.auth.forgotPassword({ email: parsed.data });
      setDone(res.message);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div role="status" className="flex flex-col items-start gap-3">
        <MailCheck aria-hidden className="size-8 text-success" />
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-text-muted">{done || "If an account exists for that address, we've sent a link to reset your password."}</p>
        <Link href="/login" className="text-sm font-medium text-primary underline underline-offset-2">
          Back to log in
        </Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-text-muted">Enter your account email and we&apos;ll send you a reset link.</p>
      <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4" data-testid="forgot-form">
        <FormAlert message={formError} />
        <Field id="email" label="Email" error={error ?? undefined}>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(error)} aria-describedby={error ? "email-error" : undefined} />
        </Field>
        <Button type="submit" fullWidth size="lg" loading={pending}>
          Send reset link
        </Button>
        <Link href="/login" className="text-center text-sm text-primary underline underline-offset-2">
          Back to log in
        </Link>
      </form>
    </>
  );
}

/* ------------------------------------------------------ Reset password */

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  if (token.length < 16) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Reset link is invalid</h1>
        <p className="text-sm text-text-muted">This password reset link is missing or malformed. Request a new one.</p>
        <Button asChild>
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const p = Password.safeParse(password);
    const errs: Record<string, string> = {};
    if (!p.success) errs.password = p.error.issues[0]?.message ?? "Invalid password";
    if (password !== confirm) errs.confirm = "Passwords don't match";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    try {
      await api.auth.resetPassword({ token, password });
      router.replace("/login?reset=1");
    } catch (err) {
      setFormError(err instanceof ApiError && (err.status === 400 || err.status === 404 || err.status === 410) ? "This reset link has expired or was already used. Request a new one." : errorMessage(err));
      setPending(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4" data-testid="reset-form">
        <FormAlert message={formError} />
        <Field id="password" label="New password" error={errors.password} hint="At least 10 characters.">
          <PasswordInput id="password" value={password} onChange={setPassword} invalid={Boolean(errors.password)} autoComplete="new-password" describedBy={errors.password ? "password-error" : "password-hint"} />
          <StrengthMeter password={password} />
        </Field>
        <Field id="confirm" label="Confirm new password" error={errors.confirm}>
          <PasswordInput id="confirm" value={confirm} onChange={setConfirm} invalid={Boolean(errors.confirm)} autoComplete="new-password" describedBy={errors.confirm ? "confirm-error" : undefined} />
        </Field>
        <Button type="submit" fullWidth size="lg" loading={pending}>
          Update password
        </Button>
      </form>
    </>
  );
}

function ResetNotice() {
  const params = useSearchParams();
  if (params.get("reset") !== "1") return null;
  return (
    <div role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
      Your password was updated. Log in with your new password.
    </div>
  );
}

const S = ({ children }: { children: React.ReactNode }) => <React.Suspense fallback={null}>{children}</React.Suspense>;

export function LoginForm() {
  return (
    <S>
      <ResetNotice />
      <LoginFormInner />
    </S>
  );
}
export function SignupForm() {
  return (
    <S>
      <SignupFormInner />
    </S>
  );
}
export function ResetPasswordForm() {
  return (
    <S>
      <ResetPasswordInner />
    </S>
  );
}
