import { describe, expect, it } from "vitest";
import {
  revealElementInScrollers,
  scrollElementIntoScroller,
} from "./spectrogramDetections";

function box(
  tag: string,
  props: { offsetTop?: number; offsetHeight?: number; offsetParent?: HTMLElement | null },
): HTMLElement {
  const el = document.createElement(tag);
  Object.defineProperty(el, "offsetTop", { value: props.offsetTop ?? 0 });
  Object.defineProperty(el, "offsetHeight", { value: props.offsetHeight ?? 20 });
  Object.defineProperty(el, "offsetParent", { value: props.offsetParent ?? null });
  return el;
}

function scrollerBox(clientHeight: number, scrollHeight: number): HTMLElement {
  const el = document.createElement("div");
  let scrollTop = 0;
  Object.defineProperty(el, "clientHeight", { value: clientHeight });
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight });
  Object.defineProperty(el, "scrollTop", {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  return el;
}

describe("scrollElementIntoScroller", () => {
  it("centers a far row under the sticky header", () => {
    const scroller = scrollerBox(100, 800);
    const row = box("tr", { offsetTop: 500, offsetHeight: 20, offsetParent: scroller });
    expect(scrollElementIntoScroller(row, scroller, 24)).toBe(true);
    expect(scroller.scrollTop).toBe(448);
  });

  it("leaves a row that is already fully visible", () => {
    const scroller = scrollerBox(100, 800);
    scroller.scrollTop = 10;
    const row = box("tr", { offsetTop: 40, offsetHeight: 20, offsetParent: scroller });
    expect(scrollElementIntoScroller(row, scroller, 24)).toBe(true);
    expect(scroller.scrollTop).toBe(10);
  });

  it("returns false when the size is zero or the offset chain misses the scroller", () => {
    const scroller = scrollerBox(0, 800);
    const row = box("tr", { offsetTop: 500, offsetParent: scroller });
    expect(scrollElementIntoScroller(row, scroller, 24)).toBe(false);

    const open = scrollerBox(100, 800);
    const lost = box("tr", { offsetTop: 500, offsetParent: null });
    expect(scrollElementIntoScroller(lost, open, 24)).toBe(false);
    expect(open.scrollTop).toBe(0);
  });

  it("scrolls via getBoundingClientRect when scroller is not an offsetParent", () => {
    // Home plan rail: overflow scroller is position:static → not offsetParent.
    const scroller = scrollerBox(100, 800);
    scroller.getBoundingClientRect = () => rect(0, 100);
    const row = box("li", { offsetTop: 500, offsetHeight: 20, offsetParent: null });
    Object.defineProperty(row, "offsetHeight", { value: 20 });
    row.getBoundingClientRect = () => rect(420, 440);
    scroller.appendChild(row);
    document.body.appendChild(scroller);

    expect(scrollElementIntoScroller(row, scroller, 0)).toBe(true);
    // Center: 420 - (100 - 20) / 2 = 380
    expect(scroller.scrollTop).toBe(380);
    scroller.remove();
  });
});

function rect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

describe("revealElementInScrollers", () => {
  it("scrolls the studio when the selected row sits below its fold", () => {
    const studio = document.createElement("div");
    studio.style.overflowY = "auto";
    let scrollTop = 0;
    Object.defineProperty(studio, "clientHeight", { value: 200 });
    Object.defineProperty(studio, "scrollHeight", { value: 900 });
    Object.defineProperty(studio, "scrollTop", {
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    studio.getBoundingClientRect = () => rect(0, 200);

    const row = document.createElement("tr");
    Object.defineProperty(row, "offsetHeight", { value: 20 });
    row.getBoundingClientRect = () => rect(420, 440);
    studio.appendChild(row);
    document.body.appendChild(studio);

    expect(revealElementInScrollers(row, null, 0)).toBe(true);
    expect(studio.scrollTop).toBe(248);
    studio.remove();
  });

  it("leaves the studio when the row is already on screen", () => {
    const studio = document.createElement("div");
    studio.style.overflowY = "auto";
    let scrollTop = 40;
    Object.defineProperty(studio, "clientHeight", { value: 200 });
    Object.defineProperty(studio, "scrollHeight", { value: 900 });
    Object.defineProperty(studio, "scrollTop", {
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    studio.getBoundingClientRect = () => rect(0, 200);

    const row = document.createElement("tr");
    Object.defineProperty(row, "offsetHeight", { value: 20 });
    row.getBoundingClientRect = () => rect(80, 100);
    studio.appendChild(row);
    document.body.appendChild(studio);

    expect(revealElementInScrollers(row, null, 0)).toBe(true);
    expect(studio.scrollTop).toBe(40);
    studio.remove();
  });
});
