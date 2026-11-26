import { endpoints, type EndpointName } from "@pricora/contracts";
import type { z } from "zod";
import { ApiException } from "./errors";

/** Parse with a Zod schema; failures become 422 validation_failed with Zod issues as details. */
export function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new ApiException(422, "validation_failed", "Request validation failed", r.error.issues);
  }
  return r.data as z.infer<S>;
}

type Part = "body" | "query" | "params";
type SchemaOf<N extends EndpointName, P extends Part> = (typeof endpoints)[N] extends { [K in P]: infer S }
  ? S extends z.ZodTypeAny
    ? S
    : never
  : never;

/** Validate a request part against the endpoint registry in @pricora/contracts. */
export function input<N extends EndpointName, P extends Part>(name: N, part: P, value: unknown): z.infer<SchemaOf<N, P>> {
  const ep = endpoints[name] as unknown as Record<Part, z.ZodTypeAny | undefined>;
  const schema = ep[part];
  if (!schema) throw new Error(`Endpoint ${name} has no ${part} schema`);
  return parse(schema, value ?? {}) as z.infer<SchemaOf<N, P>>;
}
