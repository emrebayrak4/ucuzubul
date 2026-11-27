import { expect, test, type Page } from "../helpers/fixtures";
import { API_URL } from "../helpers/env";
import { isMobile, parseCents, waitForHydration } from "../helpers/ui";

interface Offer {
  id: string;
  source: string;
  sponsored: boolean;
  estimatedTotalCents: number;
  retailer: { slug: string; name: string };
  tax: { status: string };
}
interface ProductDetail {
  product: { id: string; slug: string; title: string };
  offers: Offer[];
  lowestOfferId: string | null;
}

let detail: ProductDetail;

test.beforeAll(async ({ request }) => {
  // Pick a product with several offers so ordering is meaningful.
  const s = await request.get(`${API_URL}/v1/search?q=laptop&pageSize=24`);
  const items = ((await s.json()) as { items: Array<{ slug: string; storeCount: number }> }).items;
  const slug = [...items].sort((a, b) => b.storeCount - a.storeCount)[0]?.slug;
  expect(slug, "a searchable product").toBeTruthy();
  detail = (await (await request.get(`${API_URL}/v1/products/${slug}`)).json()) as ProductDetail;
  expect(detail.offers.length, "product has >= 2 offers").toBeGreaterThanOrEqual(2);
});

/** Estimated totals in the order the page shows them (desktop table or mobile stacked list). */
async function shownTotals(page: Page): Promise<number[]> {
  if (isMobile(page)) {
    const rows = page.getByTestId("offer-row-mobile");
    await expect(rows.first()).toBeVisible();
    const texts = await rows.evaluateAll((els) => els.map((el) => el.querySelector(".text-right .price")?.textContent ?? ""));
    return texts.map((t) => parseCents(t) ?? -1);
  }
  const rows = page.getByTestId("offer-row");
  await expect(rows.first()).toBeVisible();
  // Column order: Store, Price, Shipping, Est. tax, Est. total, …
  const texts = await rows.evaluateAll((els) => els.map((el) => el.querySelectorAll("td")[4]?.textContent ?? ""));
  return texts.map((t) => parseCents(t) ?? -1);
}

test.describe("product page", () => {
  test("cheapest offer by total is first and demo offers are labeled", async ({ page }) => {
    const res = await page.goto(`/products/${detail.product.slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("product-title")).toContainText(detail.product.title.slice(0, 20));
    const totals = await shownTotals(page);
    expect(totals.length).toBe(detail.offers.filter((o) => !o.sponsored).length + detail.offers.filter((o) => o.sponsored).length);
    const organic = totals.slice(0, detail.offers.filter((o) => !o.sponsored).length);
    expect([...organic].sort((a, b) => a - b), "organic offers sorted by estimated total").toEqual(organic);
    expect(organic[0]).toBe(Math.min(...detail.offers.filter((o) => !o.sponsored).map((o) => o.estimatedTotalCents)));

    const rowId = isMobile(page) ? "offer-row-mobile" : "offer-row";
    const demoCount = detail.offers.filter((o) => o.source === "demo").length;
    // Offer rows carry a compact "Demo" chip whose accessible name / tooltip spells out "Demo data — not a live price".
    const demoChip = page.locator('[aria-label="Demo data — not a live price"][title="Demo data — not a live price"]').filter({ hasText: /^\s*Demo\s*$/ });
    await expect(page.getByTestId(rowId).filter({ has: demoChip })).toHaveCount(demoCount);
    if (demoCount > 0) await expect(page.getByTestId(rowId).filter({ has: demoChip }).first().locator(demoChip)).toBeVisible();
    if (demoCount > 0) await expect(page.getByTestId("demo-notice").first()).toBeVisible();
    await expect(page.getByTestId("price-history")).toBeVisible();
  });

  test("setting a ZIP adds estimated tax and changes the total", async ({ page }) => {
    await page.goto(`/products/${detail.product.slug}`);
    await waitForHydration(page);
    const before = await shownTotals(page);
    const rowId = isMobile(page) ? "offer-row-mobile" : "offer-row";
    await expect(page.getByTestId(rowId).first()).toContainText(/excl\. tax/i);

    await page.getByRole("button", { name: /set zip/i }).filter({ visible: true }).first().click();
    await page.getByTestId("zip-input").fill("10001");
    await page.getByRole("button", { name: "Save ZIP" }).click();
    await expect(page.getByTestId(rowId).first()).not.toContainText(/excl\. tax/i, { timeout: 20_000 });
    const after = await shownTotals(page);
    expect(after[0]!, "NY ZIP adds sales tax to the lowest total").toBeGreaterThan(before[0]!);
    // Order is still by total after tax.
    expect([...after].sort((a, b) => a - b)).toEqual(after);
    // Persisted (cookie) across reload.
    await page.reload();
    await expect(page.getByTestId(rowId).first()).not.toContainText(/excl\. tax/i);
  });

  test("Visit store goes through /v1/go and 302s to an allow-listed https host", async ({ page, context, request }) => {
    const goCalls: Array<{ url: string; status: number; location: string | undefined }> = [];
    const blocked: string[] = [];
    // Never load a retailer site: abort anything that isn't local.
    await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, async (route) => {
      blocked.push(route.request().url());
      await route.abort("blockedbyclient");
    });
    await context.route(/\/v1\/go\//, async (route) => {
      const r = await route.fetch({ maxRedirects: 0 });
      goCalls.push({ url: route.request().url(), status: r.status(), location: r.headers()["location"] });
      await route.fulfill({ status: 200, contentType: "text/plain", body: "intercepted by e2e" });
    });

    await page.goto(`/products/${detail.product.slug}`);
    await waitForHydration(page);
    const btn = page.getByTestId("visit-store").filter({ visible: true }).first();
    await expect(btn).toHaveAttribute("target", "_blank");
    const rel = (await btn.getAttribute("rel")) ?? "";
    expect(rel).toMatch(/noopener/);
    expect(rel).toMatch(/sponsored|nofollow/);
    const [popup] = await Promise.all([context.waitForEvent("page"), btn.click()]);
    await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
    await expect.poll(() => goCalls.length).toBeGreaterThan(0);

    const call = goCalls[0]!;
    expect(new URL(call.url).origin).toBe(API_URL);
    expect(call.status).toBe(302);
    expect(call.location, "redirect location").toBeTruthy();
    const target = new URL(call.location!);
    expect(target.protocol).toBe("https:");
    expect(target.username + target.password).toBe("");

    const offerId = new URL(call.url).pathname.split("/").pop()!;
    const offer = detail.offers.find((o) => o.id === offerId);
    expect(offer, "clicked offer belongs to product").toBeTruthy();
    const r = (await (await request.get(`${API_URL}/v1/retailers/${offer!.retailer.slug}`)).json()) as { retailer: { domain: string } };
    const domain = r.retailer.domain.replace(/^www\./, "");
    expect(target.hostname === domain || target.hostname.endsWith(`.${domain}`), `${target.hostname} within ${domain}`).toBeTruthy();
    expect(blocked.every((u) => !u.includes("intercepted")), "no retailer page loaded").toBeTruthy();
    await popup.close();
  });
});
