import { useEffect, useRef, useState } from "react";
import { basename } from "../../platform/dialog";
import {
  boundToInput,
  inputToBound,
  isDurationBoundDraft,
  type DurationBound,
} from "../../lib/callDurationLimits";
import type { FilterPreviewResult } from "../../api/filterPreview";

export const EMPTY_PREVIEW: FilterPreviewResult = {
  total: { found: 0, keep: 0, drop: 0 },
  classes: [],
  files_ok: 0,
  files_missing: [],
};

export function IconDownload({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 2.5v8" />
      <path d="M5 8.2 8 11.2 11 8.2" />
      <path d="M3 13.5h10" />
    </svg>
  );
}

export function DurationBoundField({
  value,
  ariaLabel,
  disabled,
  onCommit,
}: {
  value: DurationBound;
  ariaLabel: string;
  disabled?: boolean;
  onCommit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState(() => boundToInput(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(boundToInput(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={draft}
      aria-label={ariaLabel}
      disabled={disabled}
      placeholder="—"
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!isDurationBoundDraft(raw)) return;
        focusedRef.current = true;
        setDraft(raw);
        onCommit(raw);
      }}
      onBlur={() => {
        focusedRef.current = false;
        onCommit(draft);
        setDraft(boundToInput(inputToBound(draft)));
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function FilterSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="predict-filter-m05-switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="predict-filter-m05-toggle" aria-hidden>
        <span className="predict-filter-m05-toggle-knob" />
      </span>
      <span className="predict-filter-m05-switch-label">{label}</span>
    </button>
  );
}

export function predictedDisplayName(path: string): string {
  return basename(path);
}

