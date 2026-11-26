import { Fragment, type ReactNode } from "react";

/**
 * Minimal, safe Markdown preview: builds React elements (no innerHTML), so raw HTML in the source is shown as text.
 * Supports headings (#–####), paragraphs, ul/ol lists, blockquotes, fenced code, hr, **bold**, *italic*, `code`
 * and [links](https://…) — links only for http(s)/mailto, opened with rel="noopener noreferrer nofollow".
 * The public site renders guides with its own (A02) pipeline; this is an editor preview.
 */
export function MarkdownPreview({ source, className }: { source: string; className?: string }) {
  return <div className={className}>{renderBlocks(source)}</div>;
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Order matters: code first (no nested formatting), then links, bold, italic.
  const re = /(`[^`]+`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*|_([^_]+)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={k} className="rounded-xs bg-surface-2 px-1 font-mono text-[0.9em]">{m[1].slice(1, -1)}</code>);
    else if (m[2]) {
      const label = m[3] ?? "";
      const href = m[4] ?? "";
      out.push(
        SAFE_URL.test(href) ? (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline underline-offset-2">
            {renderInline(label, k)}
          </a>
        ) : (
          <span key={k} title="Link removed: only http(s) and mailto links are allowed">
            {label}
          </span>
        ),
      );
    } else if (m[5]) out.push(<strong key={k}>{renderInline(m[6] ?? "", k)}</strong>);
    else out.push(<em key={k}>{renderInline(m[8] ?? m[9] ?? "", k)}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderBlocks(src: string): ReactNode[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const k = () => `b${key++}`;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i] ?? "")) buf.push(lines[i++] ?? "");
      i++;
      blocks.push(
        <pre key={k()} className="my-3 overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-xs">
          {buf.join("\n")}
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = (h[1] ?? "#").length;
      const cls = ["mt-5 mb-2 text-2xl font-semibold", "mt-5 mb-2 text-xl font-semibold", "mt-4 mb-1.5 text-lg font-semibold", "mt-3 mb-1 text-md font-semibold"][level - 1];
      const content = renderInline(h[2] ?? "", k());
      blocks.push(
        level === 1 ? <h1 key={k()} className={cls}>{content}</h1> : level === 2 ? <h2 key={k()} className={cls}>{content}</h2> : level === 3 ? <h3 key={k()} className={cls}>{content}</h3> : <h4 key={k()} className={cls}>{content}</h4>,
      );
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={k()} className="my-4 border-border" />);
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) buf.push((lines[i++] ?? "").replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={k()} className="my-3 border-l-2 border-border-strong pl-3 text-text-muted">
          {renderInline(buf.join(" "), k())}
        </blockquote>,
      );
      continue;
    }
    const ul = /^\s*[-*+]\s+/;
    const ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i] ?? "")) items.push((lines[i++] ?? "").replace(re, ""));
      const lis = items.map((t, n) => <li key={n}>{renderInline(t, `${key}-${n}`)}</li>);
      blocks.push(
        ordered ? (
          <ol key={k()} className="my-2 list-decimal space-y-1 pl-5">
            {lis}
          </ol>
        ) : (
          <ul key={k()} className="my-2 list-disc space-y-1 pl-5">
            {lis}
          </ul>
        ),
      );
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() && !/^(#{1,4}\s|```|>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i] ?? "")) buf.push(lines[i++] ?? "");
    if (buf.length === 0) buf.push(lines[i++] ?? ""); // safety: always consume at least one line
    blocks.push(
      <p key={k()} className="my-2 leading-relaxed">
        {buf.map((l, n) => (
          <Fragment key={n}>
            {n > 0 ? " " : null}
            {renderInline(l, `${key}-${n}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return blocks;
}
