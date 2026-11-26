import { describe, expect, it } from "vitest";
import { ApiError, createApiClient } from "../src";

type Call = { url: string; init: RequestInit };

function mockFetch(responses: { status: number; body: unknown }[]) {
  const calls: Call[] = [];
  const fn = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  };
  return { fn: fn as typeof fetch, calls };
}

describe("api-client", () => {
  it("stores CSRF token from auth responses and sends it on mutations", async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { user: null, csrfToken: "tok123" } },
      { status: 200, body: { ok: true } },
    ]);
    const api = createApiClient({ baseUrl: "http://api.test/", fetch: fn });
    await api.auth.me();
    await api.auth.logout();
    expect(calls[0]?.url).toBe("http://api.test/v1/auth/me");
    expect(calls[0]?.init.credentials).toBe("include");
    const headers = calls[1]?.init.headers as Record<string, string>;
    expect(calls[1]?.init.method).toBe("POST");
    expect(headers["x-csrf-token"]).toBe("tok123");
  });

  it("serializes params and query", async () => {
    const { fn, calls } = mockFetch([{ status: 200, body: {} }]);
    const api = createApiClient({ baseUrl: "http://api.test", fetch: fn });
    await api.catalog.productHistory("sony-wh-1000xm5", { range: "30d" });
    expect(calls[0]?.url).toBe("http://api.test/v1/products/sony-wh-1000xm5/history?range=30d");
  });

  it("parses the error envelope into ApiError", async () => {
    const { fn } = mockFetch([{ status: 503, body: { error: { code: "pending_configuration", message: "Assistant disabled" } } }]);
    const api = createApiClient({ baseUrl: "http://api.test", fetch: fn });
    const err = await api.assistant.ask({ messages: [{ role: "user", content: "hi" }] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(503);
    expect((err as ApiError).isPendingConfiguration).toBe(true);
  });
});
