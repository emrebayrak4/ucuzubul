import { ImageResponse } from "next/og";
import { brand } from "@pricora/config/brand";

export const OG_SIZE = { width: 1200, height: 630 };

/** Shared 1200×630 social card: brand bar, eyebrow, title, one fact line. System font only (no network fetch). */
export function ogCard({ eyebrow, title, fact, note }: { eyebrow: string; title: string; fact: string; note?: string }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#FFFFFF", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", height: 96, padding: "0 64px", background: "#0029F8", color: "#FFFFFF", fontSize: 40, fontWeight: 800 }}>
          {brand.name}
          <span style={{ marginLeft: 24, fontSize: 24, fontWeight: 500, opacity: 0.85 }}>{brand.tagline}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "56px 64px", justifyContent: "center" }}>
          <div style={{ fontSize: 28, color: "#4B5563", textTransform: "uppercase", letterSpacing: 2 }}>{eyebrow}</div>
          <div style={{ marginTop: 16, fontSize: title.length > 60 ? 52 : 64, fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>{title.length > 110 ? title.slice(0, 107) + "…" : title}</div>
          <div style={{ marginTop: 28, fontSize: 34, color: "#0029F8", fontWeight: 700 }}>{fact}</div>
          {note ? <div style={{ marginTop: 12, fontSize: 24, color: "#B45309" }}>{note}</div> : null}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
