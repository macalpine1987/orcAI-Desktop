/** Pure helpers for the project detail CSV table toggle. */

export type CsvPanelToggleInput = {
  isOpen: boolean;
  hasTablePath: boolean;
  hasPreview: boolean;
};

export type CsvPanelToggleResult =
  | { action: "close" }
  | { action: "open"; needsFetch: boolean }
  | { action: "noop" };

export function nextCsvPanelToggle(
  input: CsvPanelToggleInput,
): CsvPanelToggleResult {
  if (!input.hasTablePath) return { action: "noop" };
  if (input.isOpen) return { action: "close" };
  return { action: "open", needsFetch: !input.hasPreview };
}
