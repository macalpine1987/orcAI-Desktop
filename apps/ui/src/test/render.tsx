import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { SaveNoticeProvider } from "../ui/saveNotice";

export type RenderResult = {
  container: HTMLDivElement;
  root: Root;
  unmount: () => void;
};

export function renderWithProviders(ui: ReactElement): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <SaveNoticeProvider>{ui}</SaveNoticeProvider>
      </I18nextProvider>,
    );
  });
  return {
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export function queryByTitle(container: ParentNode, matcher: RegExp): HTMLElement | null {
  const nodes = container.querySelectorAll<HTMLElement>("[title]");
  for (const node of nodes) {
    const title = node.getAttribute("title") ?? "";
    if (matcher.test(title)) return node;
  }
  return null;
}

export async function findByTitle(
  container: ParentNode,
  matcher: RegExp,
  timeoutMs = 2000,
): Promise<HTMLElement> {
  const start = Date.now();
  for (;;) {
    const el = queryByTitle(container, matcher);
    if (el) return el;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`No element with title matching ${matcher}`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}
