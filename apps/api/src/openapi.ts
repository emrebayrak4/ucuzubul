/**
 * OpenAPI 3.1 document generated from the @pricora/contracts endpoint registry (Zod → JSON Schema),
 * so docs can never drift from the validation schemas.
 */
import { brand } from "@pricora/config/brand";
import { API_VERSION_PREFIX, ErrorEnvelope, endpoints } from "@pricora/contracts";
import { z } from "zod";

type Json = Record<string, unknown>;

function schema(s: z.ZodTypeAny, io: "input" | "output"): Json {
  try {
    const out = z.toJSONSchema(s, { io, unrepresentable: "any", target: "draft-2020-12" }) as Json;
    delete out["$schema"];
    return out;
  } catch {
    return {};
  }
}

const TAGS: Record<string, string> = {
  auth: "Auth",
  catalog: "Catalog",
  search: "Search",
  me: "Account",
  basket: "Basket",
  go: "Outbound",
  travel: "Travel",
  scan: "Scan",
  assistant: "Assistant",
  health: "Health",
  admin: "Admin",
  merchant: "Merchant",
};

export function buildOpenApi(serverUrl: string): Json {
  const paths: Record<string, Record<string, Json>> = {};
  for (const [name, ep] of Object.entries(endpoints)) {
    const def = ep as unknown as {
      method: string;
      path: string;
      auth: string;
      params?: z.ZodTypeAny;
      query?: z.ZodTypeAny;
      body?: z.ZodTypeAny;
      response: z.ZodTypeAny | null;
      multipart?: boolean;
      description: string;
    };
    const oaPath = API_VERSION_PREFIX + def.path.replace(/:([A-Za-z_]+)/g, "{$1}");
    const parameters: Json[] = [];
    for (const [where, s] of [["path", def.params], ["query", def.query]] as const) {
      if (!s) continue;
      const js = schema(s, "input");
      const props = (js["properties"] ?? {}) as Record<string, Json>;
      const required = new Set((js["required"] as string[] | undefined) ?? []);
      for (const [k, v] of Object.entries(props)) {
        parameters.push({ name: k, in: where, required: where === "path" || required.has(k), schema: v });
      }
    }
    const op: Json = {
      operationId: name,
      summary: def.description,
      tags: [TAGS[name.split(".")[0] ?? ""] ?? "Other"],
      "x-auth": def.auth,
      ...(def.auth !== "public" ? { security: def.auth === "optional" ? [{}, { session: [] }] : [{ session: [] }] } : {}),
      ...(parameters.length ? { parameters } : {}),
      responses: {
        ...(def.response
          ? { "200": { description: "OK", content: { "application/json": { schema: schema(def.response, "output") } } } }
          : { "302": { description: "Redirect" } }),
        default: { description: "Error", content: { "application/json": { schema: schema(ErrorEnvelope, "output") } } },
      },
    };
    if (def.body) {
      const bodySchema = schema(def.body, "input");
      op["requestBody"] = def.multipart
        ? {
            required: true,
            content: {
              "multipart/form-data": {
                schema: { ...bodySchema, properties: { ...((bodySchema["properties"] as Json) ?? {}), file: { type: "string", format: "binary" } } },
              },
            },
          }
        : { required: true, content: { "application/json": { schema: bodySchema } } };
    }
    paths[oaPath] = { ...(paths[oaPath] ?? {}), [def.method.toLowerCase()]: op };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: `${brand.name} API`,
      version: "1.0.0",
      description:
        "Money values are integer cents. Every offer/fare/rate carries `source` (`demo` = demo data, must be labeled). " +
        "Mutations from cookie sessions require the `x-csrf-token` header (value from GET /v1/auth/me).",
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: { session: { type: "apiKey", in: "cookie", name: brand.sessionCookieName } },
    },
    paths,
  };
}
