import { beforeAll, vi } from "vitest";
import React from "react";
import { Window } from "happy-dom";

let domReady = false;

beforeAll(() => {
  if (domReady) return;
  domReady = true;

vi.stubGlobal("React", React);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const window = new Window({ url: "http://localhost/" });
const document = window.document;

vi.stubGlobal("window", window);
vi.stubGlobal("document", document);
vi.stubGlobal("navigator", window.navigator);
vi.stubGlobal("HTMLElement", window.HTMLElement);
vi.stubGlobal("HTMLMediaElement", window.HTMLMediaElement);
vi.stubGlobal("Element", window.Element);
vi.stubGlobal("Node", window.Node);
vi.stubGlobal("Text", window.Text);
vi.stubGlobal("DOMRect", window.DOMRect);
vi.stubGlobal("getComputedStyle", window.getComputedStyle.bind(window));
vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 0),
);
vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
