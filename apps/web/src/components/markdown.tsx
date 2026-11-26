import * as React from "react";
import Link from "next/link";

/**
 * Minimal, safe Markdown renderer: builds React elements (text is always escaped by React), never
 * uses dangerouslySetInnerHTML, ignores raw HTML, and only allows http(s), mailto and relative links.
 * Supports: # ## ### headings, paragraphs, - / * / 1. lists, > quotes, **bold**, *italic*, `code`, [text](url).
 */

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export function extractHeadings(md: string): Array<{ id: string; text: string; level: number }> {
  return md
    .split(/\r?\n/)
    .map((l) => /^(#{2,3})\s+(.+?)\s*#*$/.exec(l))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => ({ id: slugifyHeading(stripInline(m[2]!)), text: stripInline(m[2]!), level: m[1]!.length }));
}

function stripInline(s: string): string {
  return s.replace(/\*\*|__|\*|_|`/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h)) return h;
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  if (h.startsWith("#")) return h;
  return null;
}

function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[2] ?? m[3]) out.push(<strong key={k}>{m[2] ?? m[3]}</strong>);
    else if (m[4] ?? m[5]) out.push(<em key={k}>{m[4] ?? m[5]}</em>);
    else if (m[6]) out.push(<code key={k} className="rounded-xs bg-surface-2 px-1 font-mono text-[0.9em]">{m[6]}</code>);
    else if (m[7] && m[8]) {
      const href = safeHref(m[8]);
      if (!href) out.push(m[7]);
      else if (href.startsWith("/") || href.startsWith("#")) out.push(<Link key={k} href={href} className="font-semibold text-primary underline underline-offset-2">{m[7]}</Link>);
      else out.push(<a key={k} href={href} target="_blank" rel="noopener nofollow" className="font-semibold text-primary underline underline-offset-2">{m[7]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** `headingIds` maps heading text → id (from the API TOC) so anchors match exactly. */
export function Markdown({ source, className, headingIds }: { source: string; className?: string; headingIds?: Record<string, string> }) {
  const lines = source.replace(/<[^>]+>/g, "").split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  const flush = () => {
    const k = `b${blocks.length}`;
    if (para.length) {
      blocks.push(<p key={k}>{inline(para.join(" "), k)}</p>);
      para = [];
    }
    if (list) {
      const L = list.ordered ? "ol" : "ul";
      blocks.push(
        <L key={k + "l"} className={list.ordered ? "list-decimal pl-6" : "list-disc pl-6"}>
          {list.items.map((it, j) => (
            <li key={j}>{inline(it, `${k}-${j}`)}</li>
          ))}
        </L>,
      );
      list = null;
    }
    if (quote.length) {
      blocks.push(
        <blockquote key={k + "q"} className="border-l-4 border-hotels pl-4 italic text-text-muted">
          {inline(quote.join(" "), k)}
        </blockquote>,
      );
      quote = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.+?)\s*#*$/.exec(line);
    const ul = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    const q = /^>\s?(.*)$/.exec(line);
    if (!line.trim()) {
      flush();
    } else if (h) {
      flush();
      const level = Math.min(4, Math.max(2, h[1]!.length));
      const text = h[2]!;
      const plain = stripInline(text);
      const id = headingIds?.[plain] ?? slugifyHeading(plain);
      const Tag = (`h${level}` as "h2" | "h3" | "h4");
      blocks.push(
        <Tag key={`h${blocks.length}`} id={id} className="scroll-mt-40">
          {inline(text, `h${blocks.length}`)}
        </Tag>,
      );
    } else if (ul || ol) {
      if (para.length || quote.length) {
        const keep: { ordered: boolean; items: string[] } | null = list;
        list = null;
        flush();
        list = keep;
      }
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul?.[1] ?? ol?.[1])!);
    } else if (q) {
      if (para.length || list) flush();
      quote.push(q[1]!);
    } else {
      if (list || quote.length) flush();
      para.push(line.trim());
    }
  }
  flush();
  return (
    <div
      className={
        "flex flex-col gap-4 text-md leading-relaxed text-text [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:tracking-tight [&_h3]:mt-4 [&_h3]:text-xl [&_h3]:font-bold [&_h4]:font-bold [&_li]:mt-1 " +
        (className ?? "")
      }
    >
      {blocks}
    </div>
  );
}
