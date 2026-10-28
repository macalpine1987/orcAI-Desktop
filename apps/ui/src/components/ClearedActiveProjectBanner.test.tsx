import { describe, expect, it } from "vitest";
import { act } from "react";
import { renderWithProviders } from "../test/render";
import { ClearedActiveProjectBanner } from "./ClearedActiveProjectBanner";
import {
  dismissClearedActiveProjectNotice,
  publishClearedActiveProjectNotice,
} from "../workspace/clearedActiveProjectNotice";

describe("ClearedActiveProjectBanner · modal", () => {
  it("shows alertdialog with exclamation icon and OK when notice is set", () => {
    dismissClearedActiveProjectNotice();
    publishClearedActiveProjectNotice({
      path: "/tmp/missing-project",
      name: "missing-project",
    });
    const { unmount } = renderWithProviders(<ClearedActiveProjectBanner />);
    const dialog = document.body.querySelector('[role="alertdialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toMatch(/missing-project/);
    expect(dialog?.querySelector("svg")).toBeTruthy();
    const ok = Array.from(document.body.querySelectorAll("button")).find((b) =>
      /^(ОК|OK)$/.test(b.textContent?.trim() ?? ""),
    );
    expect(ok).toBeTruthy();
    act(() => {
      ok!.click();
    });
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
    unmount();
    dismissClearedActiveProjectNotice();
  });
});
