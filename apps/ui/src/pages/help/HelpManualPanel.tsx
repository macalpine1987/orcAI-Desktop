import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  MANUAL_CHAPTERS,
  PREDICT_TOC_ANCHORS,
  TRAIN_TOC_ANCHORS,
  chapterById,
  chapterTitle,
  helpHref,
  resolveHelpTopic,
  topicForChapterId,
} from "../../lib/helpManifest";
import { pickManualView } from "../../lib/helpMarkdown";
import { loadManualChapter } from "../../lib/helpManualLoad";
import { HelpMarkdown } from "./HelpMarkdown";

export function HelpManualPanel({ topicId }: { topicId: string | null }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("en") ? "en" : "ru";
  const resolved = resolveHelpTopic(topicId);
  const chapterId = resolved?.chapter ?? "getting-started";
  const chapter = chapterById(chapterId) ?? MANUAL_CHAPTERS[0];

  const source = useMemo(
    () => loadManualChapter(locale, chapter.file),
    [locale, chapter.file],
  );
  const view = useMemo(
    () => pickManualView(source, resolved?.anchor),
    [source, resolved?.anchor],
  );

  const crumb = resolved?.anchor
    ? `${t("help.manual.crumb")} › ${chapterTitle(chapter, locale)} › ${view.title}`
    : `${t("help.manual.crumb")} › ${chapterTitle(chapter, locale)}`;

  return (
    <div className="help-manual">
      <nav className="help-toc settings-studio-card" aria-label={t("help.tabManual")}>
        <div className="help-toc-head">
          <span>{t("help.tabManual")}</span>
          <span className="help-toc-lang">{locale.toUpperCase()}</span>
        </div>
        <ol className="help-toc-list">
          {MANUAL_CHAPTERS.map((ch, index) => {
            const active = ch.id === chapter.id;
            return (
              <li key={ch.id}>
                <Link
                  to={helpHref({ topic: topicForChapterId(ch.id) })}
                  className={active ? "help-toc-item is-active" : "help-toc-item"}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="help-toc-num">
                    {String(index).padStart(2, "0")}
                  </span>
                  <span>{chapterTitle(ch, locale)}</span>
                </Link>
                {ch.id === "predict" && active ? (
                  <ul className="help-toc-sub">
                    {PREDICT_TOC_ANCHORS.map((row) => (
                      <li key={row.anchor}>
                        <Link
                          to={helpHref({ topic: row.topic })}
                          className={
                            resolved?.anchor === row.anchor
                              ? "help-toc-subitem is-active"
                              : "help-toc-subitem"
                          }
                        >
                          {t(`help.manual.predict.${row.anchor}`)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {ch.id === "train" && active ? (
                  <ul className="help-toc-sub">
                    {TRAIN_TOC_ANCHORS.map((row) => (
                      <li key={row.anchor}>
                        <Link
                          to={helpHref({ topic: row.topic })}
                          className={
                            resolved?.anchor === row.anchor
                              ? "help-toc-subitem is-active"
                              : "help-toc-subitem"
                          }
                        >
                          {t(`help.manual.train.${row.anchor}`)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="help-manual-main">
        <article className="settings-studio-card help-chapter-card">
          <div className="help-chapter-meta">
            <span>{crumb}</span>
            <span className="help-chapter-file">
              {`docs/manual/${locale}/${chapter.file}.md`}
              {resolved?.anchor ? `#${resolved.anchor}` : ""}
            </span>
          </div>
          <div className="settings-studio-card-body help-chapter-body">
            <h1>{view.title || chapterTitle(chapter, locale)}</h1>
            {source.trim() ? (
              <HelpMarkdown source={stripLeadingHeading(view.source)} />
            ) : (
              <p>{t("help.manual.missing")}</p>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}

function stripLeadingHeading(src: string): string {
  return src.replace(/^#+ .+\n+/, "");
}
