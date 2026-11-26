import { describe, expect, it } from "vitest";
import { extractHeadings, loadGuides, parseGuide, sanitizeMarkdown } from "../src";

const SAMPLE = `---
slug: sample
city: Sample City
country: Testland
countryIso2: TL
iataCityCode: SMP
title: "Sample city travel guide"
description: "A sample guide used by the content package unit tests only."
bestTimeToVisit: "Spring"
neighborhoods: [Old Town, Harbor]
tags: [city-break, food]
lastReviewed: 2026-11-26
---

## Why visit
Text <script>alert(1)</script> and [bad](javascript:alert(1)).

### Getting around
## Why visit
`;

describe("guides", () => {
  it("parses frontmatter and body", () => {
    const g = parseGuide(SAMPLE);
    expect(g.frontmatter.slug).toBe("sample");
    expect(g.frontmatter.lastReviewed).toBe("2026-11-26");
    expect(g.frontmatter.neighborhoods).toEqual(["Old Town", "Harbor"]);
    expect(g.body.startsWith("## Why visit")).toBe(true);
  });
  it("rejects invalid frontmatter", () => {
    expect(() => parseGuide(SAMPLE.replace("countryIso2: TL", "countryIso2: tl"))).toThrow(/countryIso2/);
  });
  it("extracts unique heading ids and sanitises markdown", () => {
    const g = parseGuide(SAMPLE);
    expect(extractHeadings(g.body)).toEqual([
      { id: "why-visit", text: "Why visit", level: 2 },
      { id: "getting-around", text: "Getting around", level: 3 },
      { id: "why-visit-2", text: "Why visit", level: 2 },
    ]);
    const clean = sanitizeMarkdown(g.body);
    expect(clean).not.toMatch(/<script|javascript:/i);
  });
  it("loads every guide in packages/content/guides without errors", () => {
    const r = loadGuides();
    expect(r.errors).toEqual([]);
    expect(r.guides.length).toBeGreaterThan(0);
  });
});
