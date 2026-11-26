import { z } from "zod";

// MV3 extension pages and service workers forbid eval / new Function. Zod 4 uses a JIT fast path
// based on `new Function` unless jitless is set, so every bundle imports zod through this module.
z.config({ jitless: true });

export { z };
