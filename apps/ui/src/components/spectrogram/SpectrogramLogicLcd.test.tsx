import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../test/render";
import { SpectrogramLogicLcd } from "./SpectrogramLogicLcd";

describe("SpectrogramLogicLcd · position transport overlay", () => {
  it("scopes play/pause transport to the Position panel only", () => {
    const { container, unmount } = renderWithProviders(
      <SpectrogramLogicLcd
        studioTransport
        playheadSec={12}
        duration={120}
        channel={1}
        lcdTransport="playing"
        lcdWindowT0={0}
        lcdWindowT1={60}
      />,
    );

    const root = container.querySelector(".predict-logic-lcd--m04");
    expect(root).toBeTruthy();
    expect(root?.getAttribute("data-lcd-transport")).toBe("playing");

    const clocks = container.querySelectorAll(".predict-logic-lcd-panel-clock");
    expect(clocks).toHaveLength(3);
    expect(clocks[0]?.textContent).toBe("00:12");
    expect(clocks[1]?.textContent).toBe("02:00");

    const transports = container.querySelectorAll(".predict-logic-lcd-transport");
    expect(transports).toHaveLength(1);
    expect(transports[0]?.classList.contains("is-playing")).toBe(true);

    // Transport overlays Position (playhead), not Duration/Channel.
    const positionValue = clocks[0]?.parentElement;
    expect(positionValue?.classList.contains("predict-logic-lcd-panel-value")).toBe(
      true,
    );
    expect(positionValue?.querySelector(".predict-logic-lcd-transport")).toBe(
      transports[0],
    );
    expect(clocks[1]?.parentElement?.querySelector(".predict-logic-lcd-transport")).toBeNull();
    expect(clocks[2]?.parentElement?.querySelector(".predict-logic-lcd-transport")).toBeNull();

    unmount();
  });

  it("CSS overlays transport absolutely so position digits are not flex-shifted", () => {
    const css = readFileSync(
      new URL("../../styles/analysis-lab-filter.css", import.meta.url),
      "utf8",
    );
    const transport = css.slice(
      css.indexOf(".predict-logic-lcd-transport {"),
      css.indexOf(".predict-logic-lcd-transport.is-idle"),
    );
    expect(transport).toContain("position: absolute");
    expect(transport).toContain("left: 0");
    expect(transport).not.toContain("flex-shrink: 0");

    const valueBlock = css.slice(
      css.indexOf(".predict-logic-lcd-panel-value {"),
      css.indexOf(".predict-logic-lcd-transport {"),
    );
    expect(valueBlock).toContain("justify-content: center");
    expect(valueBlock).toContain("position: relative");
    // No flex gap that permanently offsets MM:SS for a reserved glyph slot.
    expect(valueBlock).not.toMatch(/gap:\s*0\.28rem/);
  });
});
