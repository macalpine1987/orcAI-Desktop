import { Fragment, type ReactNode } from "react";

export type LabLogLineTone = "default" | "success" | "error" | "warn" | "path";

/** Classify a log line for m16 console coloring. */
export function labLogLineTone(line: string): LabLogLineTone {
  const trimmed = line.trim();
  if (/^Output:/i.test(trimmed)) return "success";
  if (/\.(txt|csv|wav|zip|json|log)\b/i.test(trimmed) && !/^error/i.test(trimmed)) {
    return "path";
  }
  if (/\b(error|failed|exception)\b/i.test(trimmed)) return "error";
  if (/\bwarn(ing)?\b/i.test(trimmed)) return "warn";
  return "default";
}

/** Leading-space indent depth (2 spaces per level) for nested log lines. */
export function labLogLineIndentPx(line: string): number {
  const m = line.match(/^(\s+)/);
  if (!m) return 0;
  return Math.floor(m[1]!.length / 2) * 12;
}

const JSON_TOKEN_RE =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/** Token-level JSON syntax colors for inspector pane (m16). */
export function highlightJsonLine(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(JSON_TOKEN_RE.source, "g");

  while ((match = re.exec(line)) !== null) {
    if (match.index > last) {
      nodes.push(line.slice(last, match.index));
    }
    const [full, quoted, colon] = match;
    const key = match.index;
    if (colon) {
      nodes.push(
        <span key={`k${key}`} className="lab-json-key">
          {quoted}
        </span>,
      );
      nodes.push(colon);
    } else if (quoted) {
      nodes.push(
        <span key={`s${key}`} className="lab-json-string">
          {quoted}
        </span>,
      );
    } else if (/^(true|false|null)$/.test(full)) {
      nodes.push(
        <span key={`l${key}`} className="lab-json-literal">
          {full}
        </span>,
      );
    } else {
      nodes.push(
        <span key={`n${key}`} className="lab-json-number">
          {full}
        </span>,
      );
    }
    last = match.index + full.length;
  }

  if (last < line.length) {
    nodes.push(line.slice(last));
  }
  return nodes;
}

export function HighlightedJson({ data }: { data: unknown }) {
  const text = JSON.stringify(data, null, 2);
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {highlightJsonLine(line)}
          {index < lines.length - 1 ? "\n" : null}
        </Fragment>
      ))}
    </>
  );
}
