/** Inline synonyms editor for wizard step 2 «Model classes» table. */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MAX_SYNONYMS_PER_CLASS, parseSynonymInput } from "./equivalences";

type Props = {
  classId: string;
  /** Class swatch colour — chips always match. */
  color: string;
  synonyms: string[];
  /** Other model class ids — cannot be used as synonyms (orcAI identity). */
  reservedClassIds?: string[];
  disabled?: boolean;
  onCommit: (nextSynonyms: string[]) => void;
};

export function ClassSynonymsInline({
  classId,
  color,
  synonyms,
  reservedClassIds = [],
  disabled = false,
  onCommit,
}: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  /** Desktop UI shows / edits at most one synonym per class. */
  const visible = synonyms.slice(0, MAX_SYNONYMS_PER_CLASS);
  const atCap = visible.length >= MAX_SYNONYMS_PER_CLASS;

  useEffect(() => {
    setDraft("");
  }, [classId, synonyms.join("\0")]);

  const commitDraft = () => {
    if (disabled || atCap) return;
    const parts = parseSynonymInput(draft);
    if (!parts.length) {
      setDraft("");
      return;
    }
    const reserved = new Set(
      reservedClassIds.map((id) => id.trim()).filter(Boolean),
    );
    const merged = [...visible];
    for (const p of parts) {
      if (merged.length >= MAX_SYNONYMS_PER_CLASS) break;
      if (p === classId || merged.includes(p) || reserved.has(p)) continue;
      merged.push(p);
    }
    setDraft("");
    if (merged.length !== visible.length || synonyms.length > MAX_SYNONYMS_PER_CLASS) {
      onCommit(merged);
    }
  };

  const remove = (raw: string) => {
    if (disabled) return;
    onCommit(visible.filter((s) => s !== raw));
  };

  return (
    <div className="tw-syn-chips tw-syn-chips--inline">
      {visible.map((syn) => (
        <span
          key={syn}
          className="tw-syn-chip tw-syn-chip--class"
          style={{ ["--syn-color" as string]: color }}
        >
          {syn}
          {!disabled ? (
            <button
              type="button"
              aria-label={t("wizard.synonymRemove", { name: syn })}
              onClick={() => remove(syn)}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {!atCap ? (
        <input
          className="tw-input tw-syn-input"
          value={draft}
          disabled={disabled}
          spellCheck={false}
          placeholder={t("wizard.synonymEmpty", { name: classId })}
          aria-label={t("wizard.colSynonyms")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            }
          }}
          onBlur={() => commitDraft()}
        />
      ) : null}
    </div>
  );
}
