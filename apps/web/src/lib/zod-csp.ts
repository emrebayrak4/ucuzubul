// Must be imported before any Zod schema is created/used on the client.
// Strict CSP (no unsafe-eval in production): stop Zod probing `new Function`, which reports a CSP violation.
import { config } from "zod";

config({ jitless: true });
