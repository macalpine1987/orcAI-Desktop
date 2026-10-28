export type MdInline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; children: MdInline[] }
  | { kind: "em"; children: MdInline[] }
  | { kind: "link"; href: string; children: MdInline[] };

export type MdBlock =
  | { type: "h1" | "h2" | "h3"; text: string; id: string }
  | { type: "p"; inlines: MdInline[] }
  | { type: "ul" | "ol"; items: MdInline[][] }
  | { type: "table"; headers: string[]; rows: string[][] };

const HEADING_RE = /^(#{1,3})\s+(.+?)\s*(?:\{#([A-Za-z0-9._-]+)\})?\s*$/;

export function slugifyHeading(raw: string): string {
  const trimmed = raw.trim();
  if (/^[A-Za-z][A-Za-z0-9._-]*$/.test(trimmed)) return trimmed;
  return trimmed
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-|-$/g, "");
}

function parseInlines(input: string): MdInline[] {
  const out: MdInline[] = [];
  let rest = input;
  while (rest.length > 0) {
    const code = rest.match(/^`([^`]+)`/);
    if (code) {
      out.push({ kind: "code", text: code[1] });
      rest = rest.slice(code[0].length);
      continue;
    }
    const link = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (link) {
      out.push({
        kind: "link",
        href: link[2],
        children: parseInlines(link[1]),
      });
      rest = rest.slice(link[0].length);
      continue;
    }
    const strong = rest.match(/^\*\*(.+?)\*\*/);
    if (strong) {
      out.push({ kind: "strong", children: parseInlines(strong[1]) });
      rest = rest.slice(strong[0].length);
      continue;
    }
    const em = rest.match(/^_(.+?)_/);
    if (em) {
      out.push({ kind: "em", children: parseInlines(em[1]) });
      rest = rest.slice(em[0].length);
      continue;
    }
    const next = rest.search(/[`\[]|\*\*|_/);
    if (next === 0) {
      out.push({ kind: "text", text: rest[0] });
      rest = rest.slice(1);
      continue;
    }
    if (next === -1) {
      out.push({ kind: "text", text: rest });
      break;
    }
    out.push({ kind: "text", text: rest.slice(0, next) });
    rest = rest.slice(next);
  }
  return out;
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSep(line: string): boolean {
  return /^\|?\s*:?-{3,}/.test(line);
}

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      const text = heading[2].replace(/\s*\{#[A-Za-z0-9._-]+\}\s*$/, "").trim();
      const id = heading[3] || slugifyHeading(text);
      blocks.push({
        type: level === 1 ? "h1" : level === 2 ? "h2" : "h3",
        text,
        id,
      });
      i += 1;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const headers = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: MdInline[][] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(parseInlines(lines[i].replace(/^\d+\.\s+/, "")));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: MdInline[][] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(parseInlines(lines[i].replace(/^[-*]\s+/, "")));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING_RE.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "p", inlines: parseInlines(para.join(" ")) });
  }
  return blocks;
}

export type ManualSection = { id: string; title: string; source: string };

/** Split a chapter on `##` headings; the preface before the first `##` is id "". */
export function splitManualSections(src: string): ManualSection[] {
  const normalized = src.replace(/\r\n/g, "\n");
  const parts = normalized.split(/^## /m);
  if (parts.length === 1) {
    return [{ id: "", title: "", source: normalized.trim() }];
  }
  const sections: ManualSection[] = [];
  const preface = parts[0].trim();
  if (preface) sections.push({ id: "", title: "", source: preface });
  for (const part of parts.slice(1)) {
    const nl = part.indexOf("\n");
    const headingLine = (nl === -1 ? part : part.slice(0, nl)).trim();
    const body = nl === -1 ? "" : part.slice(nl + 1);
    const tagged = headingLine.match(/^(.+?)\s*\{#([A-Za-z0-9._-]+)\}\s*$/);
    const title = (tagged ? tagged[1] : headingLine).trim();
    const id = tagged ? tagged[2] : slugifyHeading(title);
    sections.push({
      id,
      title,
      source: `## ${headingLine}\n${body}`.trim(),
    });
  }
  return sections;
}

export function pickManualView(
  src: string,
  anchor?: string,
): { title: string; source: string; fileLabel?: string } {
  const blocks = parseMarkdown(src);
  const h1 = blocks.find((b) => b.type === "h1");
  const chapterTitle = h1 && h1.type === "h1" ? h1.text : "";
  if (!anchor) {
    return { title: chapterTitle, source: src };
  }
  const sections = splitManualSections(src);
  const hit = sections.find((s) => s.id === anchor);
  if (!hit) return { title: chapterTitle, source: src };
  return { title: hit.title || chapterTitle, source: hit.source };
}
