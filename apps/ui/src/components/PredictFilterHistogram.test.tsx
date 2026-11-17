import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/render";
import { durationHistogram, formatHistSeconds } from "../lib/callDurationLimits";
import { PredictFilterHistogram } from "./PredictFilterHistogram";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../styles/predict-filter.css"),
  "utf8",
);

describe("PredictFilterHistogram", () => {
  it("draws a count scale, flush columns, and two long-call intervals", () => {
    expect(css).toMatch(/\.predict-filter-m05-hist-bars\s*\{[^}]*gap:\s*0/);
    expect(css).not.toMatch(/\.predict-filter-m05-hist-bars\s*\{[^}]*gap:\s*1px/);
    const durations = [...Array.from({ length: 37 }, () => 1), 7, 10, 20];
    const hist = durationHistogram(durations, [1, 6.5]);
    const { container, unmount } = renderWithProviders(
      <PredictFilterHistogram
        bins={hist.bins}
        tails={hist.tails}
        min={1}
        max={6.5}
        span={hist.span}
        binWidth={hist.binWidth}
        color="#7dffa3"
        minLabel={(n) => `мин ${n}`}
        maxLabel={(n) => `макс ${n}`}
        axisLabel="Длительность, с"
        countAxisLabel="Сигналы"
        formatSeconds={formatHistSeconds}
        scaleLabel={(n) => `${n} с`}
        tailRangeLabel={(from, to) => `${from}–${to} с`}
        tailOpenLabel={(from) => `${from} с и дольше`}
        binTip={(bin) => `${bin.count} · ${formatHistSeconds(bin.start)}–${formatHistSeconds(bin.end)} с`}
        legendKeep="Останется"
        legendDrop="Отсеется"
        hint="Выделите область"
        brushLabel="Гистограмма"
        onChange={() => undefined}
      />,
    );
    const plot = container.querySelector(".predict-filter-m05-hist-plot");
    const canvas = plot?.querySelector(".predict-filter-m05-hist-canvas");
    const y = plot?.querySelector(".predict-filter-m05-hist-y");
    expect(y?.textContent).toBe("37190");
    const yRisks = Array.from(canvas?.querySelectorAll(".predict-filter-m05-hist-risk.is-y") ?? []);
    expect(yRisks).toHaveLength(3);
    expect(yRisks[0]?.getAttribute("style")).toContain("bottom: 100%");
    expect(yRisks[1]?.getAttribute("style")).toContain(`bottom: ${(19 / 37) * 100}%`);
    expect(yRisks[2]?.getAttribute("style")).toContain("bottom: 0%");
    const yGuides = Array.from(
      canvas?.querySelectorAll(".predict-filter-m05-hist-guide.is-h") ?? [],
    );
    expect(yGuides).toHaveLength(3);
    expect(yGuides[1]?.getAttribute("style")).toContain(`bottom: ${(19 / 37) * 100}%`);
    expect(
      Array.from(canvas?.querySelectorAll(".predict-filter-m05-hist-guide.is-v") ?? []).map(
        (node) => node.getAttribute("style"),
      ),
    ).toEqual(["left: 0%;", "left: 25%;", "left: 50%;", "left: 75%;", "left: 100%;"]);
    expect(container.querySelectorAll(".predict-filter-m05-hist-slot")).toHaveLength(32);
    const scale = plot?.querySelector(".predict-filter-m05-hist-ticks-scale");
    expect(scale?.textContent).toBe("02468 с");
    expect(
      Array.from(canvas?.querySelectorAll(".predict-filter-m05-hist-risk.is-x") ?? []).map((node) =>
        node.getAttribute("style"),
      ),
    ).toEqual(["left: 0%;", "left: 25%;", "left: 50%;", "left: 75%;", "left: 100%;"]);
    expect(plot?.contains(scale ?? null)).toBe(true);
    const tails = Array.from(container.querySelectorAll(".predict-filter-m05-hist-tail")).map(
      (node) => node.textContent,
    );
    expect(tails).toEqual(["18–12 с", "112 с и дольше"]);
    const tip = container.querySelector(".predict-filter-m05-hist-slot")?.getAttribute("title");
    expect(tip).toBe("0 · 0–0.25 с");
    expect(container.textContent).not.toMatch(/Колонка|Column/);
    expect(container.textContent).toContain("мин 1.0");
    expect(container.textContent).toContain("макс 6.5");
    unmount();
  });
});
