export type HelpTab = "manual" | "about" | "license";

export const HELP_TABS: HelpTab[] = ["manual", "about", "license"];

export type ManualChapter = {
  id: string;
  file: string;
  title_ru: string;
  title_en: string;
};

export type HelpTopic = {
  chapter: string;
  anchor?: string;
};

/** Mirrors `docs/manual/manifest.json` (gate-tested). */
export const MANUAL_CHAPTERS: ManualChapter[] = [
  { id: "getting-started", file: "00-getting-started", title_ru: "Начало работы", title_en: "Getting started" },
  { id: "home", file: "01-home", title_ru: "Главная", title_en: "Home" },
  { id: "projects", file: "02-projects", title_ru: "Проекты", title_en: "Projects" },
  { id: "predict", file: "03-predict", title_ru: "Распознавание", title_en: "Predictions" },
  { id: "train", file: "04-train", title_ru: "Обучение", title_en: "Training" },
  { id: "models", file: "05-models", title_ru: "Модели", title_en: "Models" },
  { id: "results", file: "06-results", title_ru: "Результаты", title_en: "Results" },
  { id: "tasks", file: "07-tasks", title_ru: "Задачи", title_en: "Tasks" },
  { id: "settings", file: "08-settings", title_ru: "Настройки", title_en: "Settings" },
  { id: "glossary", file: "09-glossary", title_ru: "Глоссарий", title_en: "Glossary" },
  { id: "troubleshooting", file: "10-troubleshooting", title_ru: "Устранение неполадок", title_en: "Troubleshooting" },
];

export const HELP_TOPICS: Record<string, HelpTopic> = {
  "getting-started": { chapter: "getting-started" },
  glossary: { chapter: "glossary" },
  troubleshooting: { chapter: "troubleshooting" },
  home: { chapter: "home" },
  folder: { chapter: "projects" },
  "folder.wizard": { chapter: "projects", anchor: "focus" },
  "folder.readiness": { chapter: "projects", anchor: "readiness" },
  scope: { chapter: "predict" },
  "scope.params": { chapter: "predict", anchor: "parameters" },
  "scope.studio": { chapter: "predict", anchor: "results" },
  "scope.filter": { chapter: "predict", anchor: "filter" },
  train: { chapter: "train" },
  "train.pipeline": { chapter: "train", anchor: "pipeline" },
  "train.wizard": { chapter: "train", anchor: "wizard" },
  "train.monitor": { chapter: "train", anchor: "monitor" },
  model: { chapter: "models" },
  results: { chapter: "results" },
  tasks: { chapter: "tasks" },
  gear: { chapter: "settings" },
  help: { chapter: "getting-started", anchor: "help-section" },
};

export const PREDICT_TOC_ANCHORS: { anchor: string; topic: string }[] = [
  { anchor: "parameters", topic: "scope.params" },
  { anchor: "results", topic: "scope.studio" },
  { anchor: "filter", topic: "scope.filter" },
];

export const TRAIN_TOC_ANCHORS: { anchor: string; topic: string }[] = [
  { anchor: "pipeline", topic: "train.pipeline" },
  { anchor: "wizard", topic: "train.wizard" },
  { anchor: "monitor", topic: "train.monitor" },
];

const PATH_TOPIC: Record<string, string> = {
  "/": "home",
  "/projects": "folder",
  "/predict": "scope",
  "/pipeline": "train",
  "/models": "model",
  "/results": "results",
  "/jobs": "tasks",
  "/settings": "gear",
};

export function topicForPath(
  pathname: string,
  predictTab?: "run" | "results" | "filter",
): string {
  if (pathname === "/predict") {
    if (predictTab === "results") return "scope.studio";
    if (predictTab === "filter") return "scope.filter";
    return "scope.params";
  }
  return PATH_TOPIC[pathname] ?? "getting-started";
}

export function resolveHelpTopic(topicId: string | null | undefined): HelpTopic | null {
  if (!topicId) return null;
  return HELP_TOPICS[topicId] ?? null;
}

export function chapterById(id: string): ManualChapter | undefined {
  return MANUAL_CHAPTERS.find((ch) => ch.id === id);
}

export function chapterTitle(chapter: ManualChapter, locale: string): string {
  return locale.startsWith("ru") ? chapter.title_ru : chapter.title_en;
}

export function parseHelpTab(raw: string | null): HelpTab {
  if (raw === "orcai") return "about";
  if (raw && (HELP_TABS as string[]).includes(raw)) return raw as HelpTab;
  return "manual";
}

export function helpHref(opts: {
  tab?: HelpTab;
  topic?: string;
  read?: boolean;
}): string {
  const params = new URLSearchParams();
  if (opts.tab && opts.tab !== "manual") params.set("tab", opts.tab);
  if (opts.topic) params.set("topic", opts.topic);
  if (opts.read) params.set("read", "1");
  const q = params.toString();
  return q ? `/help?${q}` : "/help";
}

export function chapterFileRel(locale: "ru" | "en", file: string): string {
  return `docs/manual/${locale}/${file}.md`;
}

const CHAPTER_TOPIC: Record<string, string> = {
  "getting-started": "getting-started",
  home: "home",
  projects: "folder",
  predict: "scope",
  train: "train",
  models: "model",
  results: "results",
  tasks: "tasks",
  settings: "gear",
  glossary: "glossary",
  troubleshooting: "troubleshooting",
};

export function topicForChapterId(chapterId: string): string {
  return CHAPTER_TOPIC[chapterId] ?? "getting-started";
}
