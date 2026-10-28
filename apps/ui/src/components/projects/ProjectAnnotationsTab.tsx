import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import type { ProjectAnnotations } from "../../api/projects";
import { formatBytes } from "../../lib/formatAudio";
import type { ProjectsPageMode } from "../../lib/projectsStudio";
import { IconPlus, IconTxtLarge } from "./ProjectsIcons";
import { useAnnotationDropZone } from "./useAnnotationDropZone";

type Props = {
  data: ProjectAnnotations | null;
  loading: boolean;
  mode: ProjectsPageMode;
  busy: boolean;
  canModify: boolean;
  onAddAnnotations: () => void;
  onImportPaths: (paths: string[]) => void;
  onDeleteAnnotations: (names: string[]) => void;
  onOpenAnnotationsFolder: () => void;
};

function annotationBasename(path: string, recording: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop();
  return base && base.toLowerCase().endsWith(".txt") ? base : `${recording}.txt`;
}

/** m23 / m35 «Аннотации»: import .txt + label matrix; unpaired stems tagged. */
export function ProjectAnnotationsTab({
  data,
  loading,
  mode,
  busy,
  canModify,
  onAddAnnotations,
  onImportPaths,
  onDeleteAnnotations,
  onOpenAnnotationsFolder,
}: Props) {
  const { t } = useTranslation();
  const dropEnabled = canModify && !busy;
  const { zoneRef, active: dropActive, dropProps } = useAnnotationDropZone({
    enabled: dropEnabled,
    onDropPaths: onImportPaths,
  });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const pairedNames = useMemo(() => {
    if (!data) return [] as string[];
    return data.rows.map((row) => annotationBasename(row.annotation_path, row.recording));
  }, [data]);

  const unpairedNames = useMemo(() => {
    if (!data) return [] as string[];
    return (data.unpaired ?? []).map((item) => item.name);
  }, [data]);

  const allNames = useMemo(
    () => [...pairedNames, ...unpairedNames],
    [pairedNames, unpairedNames],
  );

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      for (const name of prev) {
        if (allNames.includes(name)) next.add(name);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [allNames]);

  if (loading && !data) {
    return <p className="text-xs text-foreground-muted">{t("projects.studio.annotations.loading")}</p>;
  }
  if (!data) return null;

  const total = data.rows.reduce((acc, r) => acc + r.total_labels, 0);
  const unpaired = data.unpaired ?? [];
  const empty = data.rows.length === 0 && unpaired.length === 0;
  const allSelected = allNames.length > 0 && allNames.every((n) => selected.has(n));

  const toggleOne = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allNames));
  const clearSelection = () => setSelected(new Set());

  const addButton = (
    <button
      type="button"
      className="ps-btn"
      onClick={onAddAnnotations}
      disabled={busy || !canModify}
      title={!canModify ? t("projects.recordingsRequireInit") : undefined}
    >
      <IconPlus />
      {t("projects.studio.annotations.add")}
    </button>
  );

  const deleteButton = (
    <button
      type="button"
      className="ps-btn ps-btn-danger"
      onClick={() => onDeleteAnnotations([...selected])}
      disabled={busy || !canModify || selected.size === 0}
      title={
        selected.size === 0
          ? t("projects.studio.annotations.deleteNeedSelection")
          : t("projects.studio.annotations.deleteSelectedTip")
      }
    >
      {t("projects.studio.actions.delete")}
    </button>
  );

  if (empty) {
    return (
      <div className="space-y-3">
        <div
          ref={zoneRef}
          className={clsx("ps-empty", dropActive && "is-drop-active")}
          {...dropProps}
        >
          <IconTxtLarge className="ps-empty-icon" />
          <div className="min-w-0">
            <h3 className="ps-empty-title">{t("projects.studio.annotations.emptyTitle")}</h3>
            <p className="ps-empty-steps">{t("projects.studio.annotations.empty")}</p>
            <p className="ps-empty-drop-hint">{t("projects.studio.annotations.dropHint")}</p>
            <div className="ps-empty-actions">{addButton}</div>
          </div>
        </div>
        {mode === "lab" ? (
          <p className="text-[10px] text-foreground-muted">
            {t("projects.studio.empty.labHint")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={zoneRef}
      className={clsx("space-y-3 ps-recordings-drop", dropActive && "is-drop-active")}
      {...dropProps}
    >
      <p className="ps-hint-bar">{t("projects.studio.annotations.maskNote")}</p>

      <div className="ps-toolbar">
        <span>
          {t("projects.studio.annotations.summary", {
            annotated: data.annotated_count,
            total: data.total_count,
            unpaired: unpaired.length,
          })}
        </span>
        {allNames.length > 0 ? (
          <button
            type="button"
            className="ps-btn ps-btn-sm"
            onClick={allSelected ? clearSelection : selectAll}
            disabled={busy}
          >
            {allSelected
              ? t("projects.studio.actions.clearSelection")
              : t("projects.studio.actions.selectAll")}
          </button>
        ) : null}
        {selected.size > 0 ? (
          <span className="text-[10px] text-foreground-muted">
            {t("projects.studio.actions.selected", {
              selected: selected.size,
              total: allNames.length,
            })}
          </span>
        ) : null}
        <div className="ml-auto flex gap-2">
          {data.annotations_dir ? (
            <button
              type="button"
              className="ps-btn ps-btn-sm"
              onClick={onOpenAnnotationsFolder}
              disabled={busy}
            >
              {t("projects.studio.annotations.openFolder")}
            </button>
          ) : null}
          {addButton}
          {deleteButton}
        </div>
      </div>

      {data.classes.length === 0 ? (
        <p className="text-xs text-foreground-muted">{t("projects.studio.annotations.noClasses")}</p>
      ) : null}

      {data.rows.length > 0 ? (
        <div className="ps-table-wrap max-h-[min(26rem,50cqh)]">
          <table className="ps-table">
            <thead>
              <tr>
                <th className="w-8">
                  <span className="sr-only">{t("projects.studio.table.select")}</span>
                </th>
                <th>{t("projects.studio.annotations.file")}</th>
                {data.classes.map((c) => (
                  <th key={c} className="is-mono is-center" title={c}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => {
                const name = annotationBasename(row.annotation_path, row.recording);
                const isSel = selected.has(name);
                return (
                  <tr key={row.recording} className={clsx(isSel && "is-selected")}>
                    <td>
                      <input
                        type="checkbox"
                        checked={isSel}
                        disabled={busy || !canModify}
                        onChange={() => toggleOne(name)}
                        aria-label={t("projects.studio.table.select")}
                      />
                    </td>
                    <td className="is-file" title={row.annotation_path}>
                      {row.recording}
                    </td>
                    {data.classes.map((c) => {
                      const v = row.counts[c];
                      return (
                        <td
                          key={c}
                          className="is-mono is-center"
                          title={v == null ? t("projects.studio.annotations.maskNote") : undefined}
                        >
                          {v == null ? <span className="text-foreground-muted">–</span> : v}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {unpaired.length > 0 ? (
        <div className="space-y-2">
          <p className="ps-hint-bar is-warn">
            {t("projects.studio.annotations.unpairedHint", { count: unpaired.length })}
          </p>
          <div className="ps-table-wrap max-h-[12rem]">
            <table className="ps-table">
              <thead>
                <tr>
                  <th className="w-8">
                    <span className="sr-only">{t("projects.studio.table.select")}</span>
                  </th>
                  <th>{t("projects.studio.annotations.file")}</th>
                  <th className="is-right">{t("projects.studio.artifacts.size")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {unpaired.map((item) => {
                  const isSel = selected.has(item.name);
                  return (
                    <tr key={item.name} className={clsx(isSel && "is-selected")}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isSel}
                          disabled={busy || !canModify}
                          onChange={() => toggleOne(item.name)}
                          aria-label={t("projects.studio.table.select")}
                        />
                      </td>
                      <td className="is-file" title={item.path}>
                        {item.name}
                        <span className="ps-tag is-warn">
                          {t("projects.studio.annotations.noWav")}
                        </span>
                      </td>
                      <td className="is-right is-mono is-muted">
                        {formatBytes(item.size_bytes)}
                      </td>
                      <td className="is-right">
                        <button
                          type="button"
                          className="ps-btn ps-btn-sm ps-btn-danger"
                          disabled={busy || !canModify}
                          onClick={() => onDeleteAnnotations([item.name])}
                        >
                          {t("projects.studio.actions.delete")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="ps-footer">
        {data.rows.length > 0 ? (
          <span>{t("projects.studio.annotations.total", { count: total })}</span>
        ) : null}
        {data.unlisted_labels.length > 0 ? (
          <span className="ps-text-warn">
            {t("projects.studio.annotations.unlisted", {
              labels: data.unlisted_labels.join(", "),
            })}
          </span>
        ) : null}
      </div>

      {mode === "lab" ? (
        <p className="text-[10px] text-foreground-muted">
          {t("projects.studio.empty.labHint")}
        </p>
      ) : null}
    </div>
  );
}
