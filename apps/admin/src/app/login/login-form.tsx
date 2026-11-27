"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button, FieldMessage, IconButton, Input, Label } from "@pricora/ui";
import { LoginRequest } from "@pricora/contracts";
import { ApiError, errorMessage, getApi } from "@/lib/api";
import { homeForRole, safeNext } from "@/lib/roles";

const WEB_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100").replace(/\/+$/, "");

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = LoginRequest.safeParse({ email, password });
    if (!parsed.success) {
      const fe: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0];
        if (k === "email") fe.email = "Enter a valid email address.";
        if (k === "password") fe.password = "Enter your password.";
      }
      setFieldErrors(fe);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const res = await getApi().auth.login(parsed.data);
      const role = res.user.role;
      const target = safeNext(params.get("next"), role) ?? homeForRole(role) ?? "/forbidden";
      router.replace(target);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 400 || err.status === 422)) {
        setError("Email or password is incorrect.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Wait a minute and try again.");
      } else {
        setError(errorMessage(err));
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-5 flex flex-col gap-4">
      {error ? (
        <div role="alert" className="rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm text-error">
          {error}
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          required
        />
        {fieldErrors.email ? (
          <FieldMessage id="email-error" tone="error">
            {fieldErrors.email}
          </FieldMessage>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
            className="pr-10"
            required
          />
          <IconButton
            type="button"
            label={show ? "Hide password" : "Show password"}
            variant="ghost"
            size="sm"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            onClick={() => setShow((s) => !s)}
          >
            {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </IconButton>
        </div>
        {fieldErrors.password ? (
          <FieldMessage id="password-error" tone="error">
            {fieldErrors.password}
          </FieldMessage>
        ) : null}
      </div>
      <Button type="submit" fullWidth loading={busy}>
        Log in
      </Button>
      <p className="text-center text-sm text-text-muted">
        New local store?{" "}
        <a href={`${WEB_URL}/sell/start`} className="font-medium text-primary underline underline-offset-2">
          Create a free account
        </a>
      </p>
    </form>
  );
}
