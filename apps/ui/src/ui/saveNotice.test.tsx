import { act } from "react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/render";
import { useSaveNotice } from "./saveNotice";

function Probe() {
  const { notifySaved, notifyHeaderError, setHeaderTip, activeNotice, dismissHeaderError } =
    useSaveNotice();
  return (
    <div>
      <output data-kind>{activeNotice?.kind ?? ""}</output>
      <output data-message>{activeNotice?.message ?? ""}</output>
      <button type="button" data-info onClick={() => notifySaved("Сохранено")}>
        info
      </button>
      <button
        type="button"
        data-error
        onClick={() => notifyHeaderError("Сбой записи")}
      >
        error
      </button>
      <button
        type="button"
        data-tip
        onClick={() =>
          setHeaderTip("data-health", { message: "Добавьте аннотации" })
        }
      >
        tip
      </button>
      <button type="button" data-clear-error onClick={() => dismissHeaderError()}>
        clear-error
      </button>
    </div>
  );
}

describe("header notice priority", () => {
  it("prefers error over tip and info flash", async () => {
    const { container, unmount } = renderWithProviders(<Probe />);
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-tip]")?.click();
    });
    expect(container.querySelector("[data-kind]")?.textContent).toBe("tip");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-info]")?.click();
    });
    expect(container.querySelector("[data-kind]")?.textContent).toBe("info");
    expect(container.querySelector("[data-message]")?.textContent).toBe(
      "Сохранено",
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-error]")?.click();
    });
    expect(container.querySelector("[data-kind]")?.textContent).toBe("error");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-clear-error]")?.click();
    });
    // Info flash may already have timed out in test env; tip remains.
    const kind = container.querySelector("[data-kind]")?.textContent;
    expect(kind === "tip" || kind === "info").toBe(true);
    unmount();
  });
});
