import { useTranslation } from "react-i18next";
import type { ProjectArtifacts } from "../../api/projects";
import { formatBytes } from "../../lib/formatAudio";
import { formatShortDateTime } from "../../lib/projectsStudio";

type Props = {
  data: ProjectArtifacts | null;
  loading: boolean;
  onOpen: (path: string) => void;
};

/** m24 «Артефакты»: orcAI output folders with counts, size, last update, open. */
export function ProjectArtifactsTab({ data, loading, onOpen }: Props) {
  const { t, i18n } = useTranslation();

  if (loading && !data) {
    return <p className="text-xs text-foreground-muted">{t("projects.studio.artifacts.loading")}</p>;
  }
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="ps-table-wrap">
        <table className="ps-table">
          <thead>
            <tr>
              <th>{t("projects.studio.artifacts.dir")}</th>
              <th className="is-right">{t("projects.studio.artifacts.files")}</th>
              <th className="is-right">{t("projects.studio.artifacts.size")}</th>
              <th>{t("projects.studio.artifacts.updated")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.name} className={item.exists ? undefined : "opacity-60"}>
                <td className="is-mono" title={item.path}>
                  {item.name}/
                </td>
                <td className="is-right is-mono">{item.exists ? item.file_count : "—"}</td>
                <td className="is-right is-mono is-muted">
                  {item.exists ? formatBytes(item.size_bytes) : "—"}
                </td>
                <td className="is-mono is-muted">
                  {formatShortDateTime(item.updated_at, i18n.language)}
                </td>
                <td className="is-right">
                  <button
                    type="button"
                    className="text-[11px] text-sky-400 underline-offset-2 hover:underline disabled:opacity-40"
                    onClick={() => onOpen(item.path)}
                    disabled={!item.exists}
                  >
                    {t("projects.studio.artifacts.open")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ps-footer">{t("projects.studio.artifacts.footer")}</p>
    </div>
  );
}
