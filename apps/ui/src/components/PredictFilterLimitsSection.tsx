import type { Dispatch, SetStateAction } from "react";
import { openExternalUrl } from "../platform/openUrl";
import { ORCAI_DOI, ORCAI_DOI_SHORT } from "../lib/helpLegal";
import { IconFolder } from "./projects/ProjectsIcons";
import {
  ORCAI_DEFAULT_DURATION_LIMITS,
  type CallDurationLimits,
} from "../lib/callDurationLimits";
import {
  DurationBoundField,
  IconDownload,
} from "./predictFilter/filterStudioControls";

type TableRow = { key: string; isDefault: boolean };

export function PredictFilterLimitsSection({
  t,
  busy,
  limitsLabel,
  limits,
  setLimits,
  tableRows,
  selectedClass,
  setSelectedClass,
  countsFor,
  setBound,
  onLoad,
  onSave,
  onPublicationExample,
}: {
  t: (key: string, opts?: Record<string, unknown>) => string;
  busy: boolean;
  limitsLabel: string;
  limits: CallDurationLimits;
  setLimits: Dispatch<SetStateAction<CallDurationLimits>>;
  tableRows: TableRow[];
  selectedClass: string;
  setSelectedClass: (key: string) => void;
  countsFor: (key: string, isDefault: boolean) => {
    found: number;
    keep: number;
    drop: number;
  };
  setBound: (key: string, index: 0 | 1, raw: string) => void;
  onLoad: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onPublicationExample: () => void;
}) {
  return (
        <section className="predict-filter-m05-limits" aria-label={t("predict.filterStudio.limitsTitle")}>
          <header className="predict-filter-m05-limits-head">
            <div className="predict-filter-m05-limits-title-row">
              <h3>{t("predict.filterStudio.limitsTitle")}</h3>
              <span className="predict-filter-m05-limits-file">{limitsLabel}</span>
            </div>
            <div className="predict-filter-m05-limits-actions">
              <button
                type="button"
                className="predict-filter-m05-tool"
                disabled={busy}
                onClick={() => void onLoad()}
              >
                <IconFolder size={13} />
                {t("predict.filterStudio.load")}
              </button>
              <button
                type="button"
                className="predict-filter-m05-tool"
                disabled={busy}
                onClick={() => void onSave()}
              >
                <IconDownload />
                {t("predict.filterStudio.save")}
              </button>
              <button
                type="button"
                className="predict-filter-m05-tool is-outline"
                disabled={busy}
                onClick={() => setLimits(ORCAI_DEFAULT_DURATION_LIMITS)}
              >
                {t("predict.filterStudio.reset")}
              </button>
              <div className="predict-filter-m05-example">
                <button
                  type="button"
                  className="predict-filter-m05-tool is-outline"
                  disabled={busy}
                  aria-describedby="predict-filter-publication-tip"
                  onClick={onPublicationExample}
                >
                  {t("predict.filterStudio.publication")}
                </button>
                <div
                  id="predict-filter-publication-tip"
                  className="predict-filter-m05-example-tip"
                  role="tooltip"
                >
                  <div className="predict-filter-m05-example-tip-card">
                    <p>{t("predict.filterStudio.publicationHint")}</p>
                    <a
                      href={ORCAI_DOI}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void openExternalUrl(ORCAI_DOI);
                      }}
                    >
                      {ORCAI_DOI_SHORT}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="predict-filter-m05-table-wrap">
            <table className="predict-filter-m05-table">
              <thead>
                <tr>
                  <th>{t("predict.filterStudio.colClass")}</th>
                  <th>{t("predict.filterStudio.colMin")}</th>
                  <th>{t("predict.filterStudio.colMax")}</th>
                  <th className="is-num">{t("predict.filterStudio.colFound")}</th>
                  <th className="is-num">{t("predict.filterStudio.colKeep")}</th>
                  <th className="is-num">{t("predict.filterStudio.colDrop")}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  const pair = limits[row.key] ?? [null, null];
                  const counts = countsFor(row.key, row.isDefault);
                  const selected = selectedClass === row.key;
                  return (
                    <tr
                      key={row.key}
                      className={selected ? "is-selected" : undefined}
                      onClick={() => setSelectedClass(row.key)}
                    >
                      <td className="predict-filter-m05-class">
                        {row.isDefault ? "default" : row.key}
                      </td>
                      <td className="predict-filter-m05-bound">
                        <DurationBoundField
                          value={pair[0]}
                          ariaLabel={`${row.key} min`}
                          disabled={busy}
                          onCommit={(raw) => setBound(row.key, 0, raw)}
                        />
                      </td>
                      <td className="predict-filter-m05-bound">
                        <DurationBoundField
                          value={pair[1]}
                          ariaLabel={`${row.key} max`}
                          disabled={busy}
                          onCommit={(raw) => setBound(row.key, 1, raw)}
                        />
                      </td>
                      <td className="is-num">{counts.found || "—"}</td>
                      <td className="is-num is-keep">
                        {counts.found ? counts.keep : "—"}
                      </td>
                      <td className="is-num is-drop">
                        {counts.found ? counts.drop : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="predict-filter-m05-hint">{t("predict.filterStudio.emptyHint")}</p>
        </section>
  );
}
