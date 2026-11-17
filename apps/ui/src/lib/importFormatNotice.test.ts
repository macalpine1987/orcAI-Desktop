import { beforeAll, describe, expect, it } from "vitest";
import i18n, { i18nReady } from "../i18n";
import {
  formatAnnotationRejectedNotice,
  formatWavRejectedNotice,
} from "./importFormatNotice";

beforeAll(async () => {
  await i18nReady;
});

function t(lng: "ru" | "en") {
  return (key: string, options?: Record<string, unknown>) =>
    i18n.t(key, { lng, ...options });
}

describe("wrong-format import notices", () => {
  it("names one WAV reject and lists several", () => {
    const ru = t("ru");
    expect(formatWavRejectedNotice(ru, ["/rec/clip.wav"])).toBeNull();
    expect(formatWavRejectedNotice(ru, ["/rec/song.mp3"])).toBe(
      "Допустимо загружать только аудиофайлы формата WAV. Файл «song.mp3» не поддерживается.",
    );
    expect(formatWavRejectedNotice(ru, ["/rec/a.wav", "/rec/b.flac", "/rec/c.mp3"])).toBe(
      "Допустимо загружать только аудиофайлы формата WAV. Неподдерживаемые файлы: b.flac, c.mp3.",
    );
  });

  it("names a non-txt file and keeps the prediction-export sentence", () => {
    const ru = t("ru");
    const en = t("en");
    expect(formatAnnotationRejectedNotice(ru, ["/ann/clip.txt"])).toBeNull();
    expect(formatAnnotationRejectedNotice(ru, ["/ann/notes.pdf"])).toBe(
      "Допустимо добавлять только текстовые файлы .txt. Файл «notes.pdf» не поддерживается.",
    );
    expect(formatAnnotationRejectedNotice(en, ["/ann/a.csv", "/ann/b.json"])).toBe(
      'Only .txt annotation files can be added. Unsupported files: a.csv, b.json.',
    );
    const predict = formatAnnotationRejectedNotice(ru, ["/ann/clip_predicted.txt"]);
    expect(predict).toContain("clip.txt");
    expect(predict).not.toContain("не поддерживается");
    const mixed = formatAnnotationRejectedNotice(ru, [
      "/ann/clip.txt",
      "/ann/notes.pdf",
      "/ann/clip_filtered.txt",
    ]);
    expect(mixed?.split("\n")).toHaveLength(2);
    expect(mixed).toContain("notes.pdf");
    expect(mixed).toContain("clip.txt");
  });
});
