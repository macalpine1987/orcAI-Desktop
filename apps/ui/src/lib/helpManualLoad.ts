/// <reference types="vite/client" />

const ruModules = import.meta.glob("../../../../docs/manual/ru/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const enModules = import.meta.glob("../../../../docs/manual/en/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function lookup(bag: Record<string, string>, file: string): string {
  const needle = `/${file}.md`;
  const hit = Object.entries(bag).find(([key]) =>
    key.replace(/\\/g, "/").endsWith(needle),
  );
  return hit?.[1] ?? "";
}

export function loadManualChapter(
  locale: string,
  file: string,
): string {
  const bag = locale.startsWith("en") ? enModules : ruModules;
  return lookup(bag, file);
}
