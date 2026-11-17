import { afterEach, describe, expect, it } from "vitest";
import { pointerClearsTimeSelection } from "./spectrogramTimeRange";

function el(html: string): Element {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  const node = root.firstElementChild;
  if (!node) throw new Error("empty html");
  return node;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("pointerClearsTimeSelection", () => {
  it("keeps selection for plot / chrome / zoom / dialog / preserve", () => {
    expect(
      pointerClearsTimeSelection(el('<div data-spectrogram-plot="1"></div>')),
    ).toBe(false);
    expect(
      pointerClearsTimeSelection(el('<div data-spectrogram-chrome="1"></div>')),
    ).toBe(false);
    expect(
      pointerClearsTimeSelection(el('<div data-spectrogram-zoom="1"></div>')),
    ).toBe(false);
    expect(
      pointerClearsTimeSelection(
        el('<div data-preserve-time-selection="1"></div>'),
      ),
    ).toBe(false);
    expect(pointerClearsTimeSelection(el('<div role="dialog"></div>'))).toBe(
      false,
    );
    expect(
      pointerClearsTimeSelection(
        el('<div class="predict-app-modal-overlay"></div>'),
      ),
    ).toBe(false);
  });

  it("clears when clicking outside protected chrome", () => {
    expect(pointerClearsTimeSelection(el("<button>Elsewhere</button>"))).toBe(
      true,
    );
  });
});
