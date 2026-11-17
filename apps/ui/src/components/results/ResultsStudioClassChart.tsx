import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { ResultsClassBucket } from "../../api/results";
import {
  colorForLabel,
  formatDetectionClassCode,
} from "../../lib/labelColors";

function ClassCol({
  item,
  max,
  selected = false,
  muted = false,
}: {
  item: ResultsClassBucket;
  max: number;
  selected?: boolean;
  muted?: boolean;
}) {
  const color = colorForLabel(item.label);
  const code = formatDetectionClassCode(item.label);
  const barH =
    item.count <= 0 ? 0 : Math.max(0.32, (item.count / Math.max(1, max)) * 3.35);
  return (
    <li
      className={`results-class-col${selected ? " is-selected" : ""}${muted ? " is-muted" : ""}`}
      title={`${code} · ${item.count}`}
      aria-current={selected ? "true" : undefined}
    >
      <span className="results-class-count">{item.count}</span>
      <div className="results-class-bar" style={{ height: `${barH}rem`, background: color }} />
      <span className="results-class-code">{code}</span>
    </li>
  );
}

type Props = {
  classCols: ResultsClassBucket[];
  classMax: number;
  selectedLabel: string;
};

export function ResultsStudioClassChart({
  classCols,
  classMax,
  selectedLabel,
}: Props) {
  const { t } = useTranslation();
  return (
    <section className="results-classes" aria-label={t("results.classesAria")}>
      <div className="results-classes-head">
        <h2 className="results-section-title">{t("results.classesTitle")}</h2>
        <span className="results-classes-hint">{t("results.classesHint")}</span>
      </div>
      {classCols.length === 0 ? (
        <p className="results-empty-hint">{t("results.classesEmpty")}</p>
      ) : (
        <ul
          className="results-class-chart"
          style={{ ["--rs-class-n"]: classCols.length } as CSSProperties}
        >
          {classCols.map((item) => (
            <ClassCol
              key={item.label}
              item={item}
              max={classMax}
              selected={Boolean(selectedLabel) && item.label === selectedLabel}
              muted={Boolean(selectedLabel) && item.label !== selectedLabel}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
