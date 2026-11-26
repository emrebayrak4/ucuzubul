import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { API_URL } from "../helpers/env";
import { waitForHydration } from "../helpers/ui";

/**
 * axe-core WCAG 2.x A/AA scan per key page, light and dark theme. Results (all impacts) are written to
 * test-results/a11y/<page>-<theme>.json for docs/TEST_REPORT.md. The test fails only on `critical` violations;
 * serious/moderate/minor are reported as annotations.
 */
/** Known critical violations already filed (docs/TASKS.md Requests). Still reported, but do not fail the run. */
const KNOWN_CRITICAL: Record<string, string> = {
  "aria-allowed-attr": "BUG-A11Y-01 (search input has aria-expanded without role=combobox)",
  "aria-valid-attr-value": "BUG-A11Y-02 (Radix Tabs used as a segmented control without TabsContent: flight trip type, price-history range → aria-controls points to a missing panel)",
};
const OUT = fileURLToPath(new URL("../test-results/a11y/", import.meta.url));
const iso = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let productSlug = "";
test.beforeAll(async ({ request }) => {
  const res = await request.get(`${API_URL}/v1/search?q=laptop`);
  productSlug = ((await res.json()) as { items: Array<{ slug: string }> }).items[0]!.slug;
  mkdirSync(OUT, { recursive: true });
});

const pages: Array<{ name: string; path: () => string }> = [
  { name: "home", path: () => "/" },
  { name: "search", path: () => "/search?q=laptop" },
  { name: "product", path: () => `/products/${productSlug}` },
  { name: "login", path: () => "/login" },
  { name: "signup", path: () => "/signup" },
  { name: "flights", path: () => `/flights/search?from=JFK&to=LAX&depart=${iso(30)}&adults=1&cabin=economy` },
  { name: "hotels", path: () => `/hotels/search?city=New%20York&checkin=${iso(30)}&checkout=${iso(32)}&guests=2&rooms=1` },
];

for (const theme of ["light", "dark"] as const) {
  test.describe(`a11y (${theme})`, () => {
    test.use({ colorScheme: theme });
    for (const p of pages) {
      test(`${p.name} has no critical axe violations`, async ({ page }, testInfo) => {
        await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
        await page.goto(p.path());
        await waitForHydration(page);
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const summary = result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
          sample: v.nodes[0]?.failureSummary?.slice(0, 300),
        }));
        writeFileSync(`${OUT}${p.name}-${theme}.json`, JSON.stringify({ page: p.name, theme, url: page.url(), violations: summary }, null, 2));
        const by = (imp: string) => summary.filter((v) => v.impact === imp);
        testInfo.annotations.push({
          type: "axe",
          description: `critical=${by("critical").length} serious=${by("serious").length} moderate=${by("moderate").length} minor=${by("minor").length} :: ${summary.map((v) => `${v.impact}:${v.id}(${v.nodes})`).join(", ")}`,
        });
        const unexpected = by("critical").filter((v) => !KNOWN_CRITICAL[v.id]);
        expect(unexpected, JSON.stringify(unexpected, null, 2)).toEqual([]);
      });
    }
  });
}
