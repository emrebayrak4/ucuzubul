import { z } from "zod";
import { Email, Id, IsoDateTime, Role, UsZip } from "./common";

export const Password = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters");

export const PublicUser = z.object({
  id: Id,
  email: Email,
  name: z.string().nullable(),
  role: Role,
  emailVerified: z.boolean(),
  avatarUrl: z.string().url().nullable(),
  zip: UsZip.nullable(),
  createdAt: IsoDateTime,
});
export type PublicUser = z.infer<typeof PublicUser>;

export const RegisterRequest = z.object({
  email: Email,
  password: Password,
  name: z.string().trim().min(1).max(100),
  acceptTerms: z.literal(true).optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const LoginRequest = z.object({
  email: Email,
  password: z.string().min(1).max(128),
  remember: z.boolean().optional(),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/** Returned by register/login/me. Session lives in httpOnly cookie `pc_session`; CSRF token returned for the double-submit header. */
export const AuthSessionResponse = z.object({
  user: PublicUser,
  csrfToken: z.string(),
  /**
   * Native clients only: present when the request sends header "x-pricora-client: native".
   * Send it back as "Authorization: Bearer <token>" (no cookies, no CSRF needed). Keep it in secure storage.
   */
  sessionToken: z.string().optional(),
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponse>;

export const MeResponse = z.object({
  user: PublicUser.nullable(),
  csrfToken: z.string(),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const ForgotPasswordRequest = z.object({ email: Email });
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequest>;

/** Always 200 to avoid account enumeration. */
export const ForgotPasswordResponse = z.object({ ok: z.literal(true), message: z.string() });
export type ForgotPasswordResponse = z.infer<typeof ForgotPasswordResponse>;

export const ResetPasswordRequest = z.object({
  token: z.string().min(16).max(256),
  password: Password,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequest>;

export const OAuthProvider = z.enum(["google", "apple"]);
export type OAuthProvider = z.infer<typeof OAuthProvider>;

export const OAuthStartParams = z.object({ provider: OAuthProvider });
export const OAuthStartQuery = z.object({ returnTo: z.string().max(512).optional() });

/** When provider keys are missing the API answers 503 with code `pending_configuration`. */
export const OAuthUnavailable = z.object({
  provider: OAuthProvider,
  status: z.literal("pending_configuration"),
  message: z.string(),
});
export type OAuthUnavailable = z.infer<typeof OAuthUnavailable>;
