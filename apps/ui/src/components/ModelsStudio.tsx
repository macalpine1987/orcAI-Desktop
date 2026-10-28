import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import type { ModelDetail, OrcaiModel } from "../api/models";
import { colorForLabel } from "../lib/labelColors";
import {
  f1BarTone,
  formatModelMba,
  formatModelSizeBytes,
  formatModelTrainedAt,
  modelOverviewParagraphs,
  modelRowKey,
} from "../lib/modelsStudio";
import { PageHelpButton } from "./PageHelpButton";
import { IconExport, IconFolder, IconWarning } from "./projects/ProjectsIcons";

type Props = {
  models: OrcaiModel[];
  selectedId: string | null;
  detail: ModelDetail | null;
  detailLoading?: boolean;
  activeModelId: string | null;
  busy?: boolean;
  error?: string | null;
  notice?: string | null;
  compatBlocked?: boolean;
  compatUnchecked?: boolean;
  onSelect: (model: OrcaiModel) => void;
  onUse: () => void;
  onFinetune: () => void;
  finetuneBlocked?: boolean;
  onTest: () => void;
  onOpenFolder: () => void;
  onImport: () => void;
  onExport: () => void;
};

export function ModelsStudio({
  models,
  selectedId,
  detail,
  detailLoading = false,
  activeModelId,
  busy = false,
  error = null,
  notice = null,
  compatBlocked = false,
  compatUnchecked = false,
  onSelect,
  onUse,
  onFinetune,
  finetuneBlocked = false,
  onTest,
  onOpenFolder,
  onImport,
  onExport,
}: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "en";
  const builtinLabel = t("models.trainedBuiltin");

  const selected = useMemo(
    () => models.find((m) => modelRowKey(m) === selectedId) ?? null,
    [models, selectedId],
  );

  const canExport = selected != null && selected.kind === "trained";
  const canOpenFolder = selected != null && selected.kind === "trained";

  const descriptionParagraphs = useMemo(
    () => modelOverviewParagraphs(selected, detail, t),
    [selected, detail, t],
  );

  const test = detail?.test ?? null;
  const classRows = test?.classes ?? [];

  return (
    <div className="models-page">
      <div className="models-work-panel studio-panel">
        <header className="models-page-header">
          <div className="models-page-header-top">
            <div className="models-page-header-text min-w-0">
              <h1 className="models-page-title">{t("pages.models.title")}</h1>
              <p className="models-page-subtitle">{t("pages.models.description")}</p>
            </div>
            <PageHelpButton />
          </div>
          <div className="models-page-toolbar">
            <div
              className="jobs-toolbar-filters predict-tabs-m03 models-page-toolbar-actions"
              role="group"
              aria-label={t("models.importExportGroup")}
            >
              <button
                type="button"
                className="predict-tab"
                onClick={onImport}
                disabled={busy}
              >
                <IconFolder />
                {t("models.import")}
              </button>
              <button
                type="button"
                className="predict-tab"
                onClick={onExport}
                disabled={busy || !canExport}
                title={
                  !selected
                    ? t("models.exportNeedSelect")
                    : selected.kind !== "trained"
                      ? t("models.exportBuiltinBlocked")
                      : undefined
                }
              >
                <IconExport />
                {t("models.export")}
              </button>
            </div>
            <p className="models-page-toolbar-note">{t("models.builtinKeepNote")}</p>
          </div>
        </header>

        {error ? (
          <p className="models-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice && !error ? (
          <p className="models-notice" role="status">
            {notice}
          </p>
        ) : null}

        <div className="models-body">
          <div className="models-main">
            <div className="jobs-table-body models-table-body overflow-x-auto">
              <table className="jobs-table w-full text-left">
                <thead>
                  <tr>
                    <th className="models-col-name">{t("models.colName")}</th>
                    <th className="models-col-kind">{t("models.colKind")}</th>
                    <th className="models-col-classes">{t("models.colClasses")}</th>
                    <th className="models-col-mba">{t("models.colValMba")}</th>
                    <th className="models-col-trained">{t("models.colTrained")}</th>
                    <th className="models-col-size">{t("models.colSize")}</th>
                    <th className="jobs-table-actions-col" />
                  </tr>
                </thead>
                <tbody>
                  {models.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="jobs-table-placeholder">
                        {t("models.empty")}
                      </td>
                    </tr>
                  ) : (
                    models.map((m) => {
                      const key = modelRowKey(m);
                      const isSelected = key === selectedId;
                      const isActive =
                        activeModelId != null &&
                        (activeModelId === m.id ||
                          activeModelId === m.path ||
                          activeModelId === m.name);
                      return (
                        <tr
                          key={key}
                          className={clsx(
                            "jobs-table-row",
                            isSelected && "jobs-table-row-selected",
                            isActive && "models-row-active",
                          )}
                          onClick={() => onSelect(m)}
                        >
                          <td className="models-col-name">
                            <span className="models-name">{m.name}</span>
                          </td>
                          <td className="models-col-kind text-foreground-muted">
                            {m.kind === "trained"
                              ? t("models.kindProject")
                              : t("models.kindBuiltinShort")}
                          </td>
                          <td className="models-col-classes font-mono text-foreground-muted">
                            {m.class_count ?? m.calls?.length ?? "—"}
                          </td>
                          <td className="models-col-mba models-cell-metric font-mono">
                            {formatModelMba(m.val_mba)}
                          </td>
                          <td className="models-col-trained text-foreground-muted">
                            {formatModelTrainedAt(
                              m.trained_at,
                              locale,
                              builtinLabel,
                            )}
                          </td>
                          <td className="models-col-size font-mono text-foreground-muted">
                            {formatModelSizeBytes(m.size_bytes, locale)}
                          </td>
                          <td className="jobs-table-actions-col">
                            <button
                              type="button"
                              className="jobs-action-link"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelect(m);
                              }}
                            >
                              {t("models.select")}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <section className="models-desc-panel" aria-label={t("models.descTitle")}>
              <h2 className="models-panel-kicker">{t("models.descTitle")}</h2>
              {descriptionParagraphs.length === 0 ? (
                <p className="models-desc-body">{t("models.descriptionHint")}</p>
              ) : (
                descriptionParagraphs.map((para) => (
                  <p key={para.slice(0, 48)} className="models-desc-body">
                    {para}
                  </p>
                ))
              )}
              <div className="models-compat-note">
                <IconWarning className="models-compat-icon" size={14} />
                <div className="models-compat-copy">
                  <p className="models-compat-text">{t("models.compatWarn")}</p>
                  <p className="models-compat-sub">{t("models.compatCheckNote")}</p>
                </div>
              </div>
            </section>
          </div>

          <aside className="models-card" aria-label={t("models.cardTitle")}>
            <h2 className="models-panel-kicker">{t("models.cardTitle")}</h2>
            {!selected ? (
              <p className="models-card-empty">{t("models.cardEmpty")}</p>
            ) : (
              <>
                <div className="models-card-head">
                  <div className="models-card-name">{selected.name}</div>
                  <div className="models-card-path" title={selected.path}>
                    {detail?.display_path ??
                      selected.display_path ??
                      selected.path}
                  </div>
                </div>

                <div className="models-card-section">
                  <h3 className="models-card-section-title">{t("models.files")}</h3>
                  {detailLoading && !detail ? (
                    <p className="models-card-muted">…</p>
                  ) : (
                    <ul className="models-file-list">
                      {(detail?.files ?? []).map((f) => (
                        <li key={f.name}>{f.name}</li>
                      ))}
                      {(detail?.files?.length ?? 0) === 0 ? (
                        <li className="models-card-muted">{t("models.filesEmpty")}</li>
                      ) : null}
                    </ul>
                  )}
                </div>

                <div className="models-card-actions">
                  <button
                    type="button"
                    className="ps-btn ps-btn-primary models-card-use"
                    onClick={onUse}
                    disabled={busy}
                    title={t("models.useHint")}
                  >
                    {t("models.use")}
                  </button>
                  <button
                    type="button"
                    className="ps-btn"
                    disabled={busy || !selected || finetuneBlocked}
                    title={
                      finetuneBlocked
                        ? t("app.navRequiresTrainingFocus")
                        : !selected
                          ? t("models.finetuneNeedSelect")
                          : undefined
                    }
                    onClick={onFinetune}
                  >
                    {t("models.finetune")}
                  </button>
                  <button
                    type="button"
                    className="ps-btn"
                    onClick={onTest}
                    disabled={
                      busy || selected.kind === "builtin" || compatBlocked
                    }
                    title={
                      selected.kind === "builtin"
                        ? t("models.testBuiltinHint")
                        : compatBlocked
                          ? t("models.compatBlockedTitle")
                          : undefined
                    }
                  >
                    {t("models.test")}
                  </button>
                  <button
                    type="button"
                    className="ps-btn"
                    onClick={onOpenFolder}
                    disabled={busy || !canOpenFolder}
                    title={
                      !canOpenFolder
                        ? t("models.openFolderBuiltinHint")
                        : undefined
                    }
                  >
                    {t("models.openFolder")}
                  </button>
                </div>

                {compatBlocked && detail?.compatibility ? (
                  <p className="models-compat-block" role="status">
                    {t("models.compatBlocked", {
                      count: detail.compatibility.issues.length,
                    })}
                  </p>
                ) : null}
                {compatUnchecked && !compatBlocked ? (
                  <p className="models-compat-unchecked" role="status">
                    {t("models.compatUnchecked")}
                  </p>
                ) : null}

                <div className="models-card-section models-test-section">
                  <div className="models-test-head">
                    <h3 className="models-card-section-title">
                      {t("models.testResults")}
                    </h3>
                    {test?.metrics_path ? (
                      <span className="models-test-source" title={test.metrics_path}>
                        {test.metrics_path.split(/[/\\]/).pop()}
                      </span>
                    ) : null}
                  </div>
                  {!test ? (
                    <p className="models-card-muted">{t("models.testEmpty")}</p>
                  ) : (
                    <>
                      <div className="models-test-kpi" role="group">
                        <div className="models-test-kpi-cell">
                          <span className="models-test-kpi-label">MBA</span>
                          <span className="models-test-kpi-value">
                            {formatModelMba(test.mba)}
                          </span>
                        </div>
                        <div className="models-test-kpi-cell">
                          <span className="models-test-kpi-label">
                            {t("models.precision")}
                          </span>
                          <span className="models-test-kpi-value">
                            {formatModelMba(test.precision)}
                          </span>
                        </div>
                        <div className="models-test-kpi-cell">
                          <span className="models-test-kpi-label">
                            {t("models.recall")}
                          </span>
                          <span className="models-test-kpi-value">
                            {formatModelMba(test.recall)}
                          </span>
                        </div>
                      </div>
                      <ul className="models-class-bars">
                        {classRows.map((row) => {
                          const f1 = row.f1;
                          const pct =
                            f1 != null && Number.isFinite(f1)
                              ? Math.max(0, Math.min(100, f1 * 100))
                              : 0;
                          const tone = f1BarTone(f1);
                          return (
                            <li key={row.label} className="models-class-bar-row">
                              <span
                                className="models-class-dot"
                                style={{
                                  backgroundColor: colorForLabel(row.label),
                                }}
                                aria-hidden
                              />
                              <span className="models-class-label">{row.label}</span>
                              <span className="models-class-track">
                                <span
                                  className={clsx(
                                    "models-class-fill",
                                    `is-${tone}`,
                                  )}
                                  style={{ width: `${pct}%` }}
                                />
                              </span>
                              <span className="models-class-f1" title="F1">
                                {formatModelMba(f1)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
