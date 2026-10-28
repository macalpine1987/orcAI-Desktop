import { useTranslation } from "react-i18next";
import type { ModelProfile } from "../workspace/predictModelProfiles";

type Props = {
  profiles: ModelProfile[];
  activeProfileId: string | null;
  disabled?: boolean;
  canDeleteActive: boolean;
  onSelectProfile: (id: string) => void;
  onCreateProfile: () => void;
  onDeleteProfile: () => void;
};

export function PredictProfileList({
  profiles,
  activeProfileId,
  disabled,
  canDeleteActive,
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
}: Props) {
  const { t } = useTranslation();

  return (
    <aside className="flex min-w-0 flex-col">
      <h2 className="mb-2 text-sm font-semibold text-foreground">
        {t("predict.profile.listTitle")}
      </h2>
      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onCreateProfile}
          className="rounded border border-accent/50 bg-accent/10 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/20 disabled:opacity-40"
        >
          {t("predict.profile.create")}
        </button>
        <button
          type="button"
          disabled={disabled || !canDeleteActive}
          onClick={onDeleteProfile}
          title={!canDeleteActive ? t("predict.profile.deleteDisabledNone") : undefined}
          className="rounded border border-red-500/40 px-3 py-1.5 text-sm text-red-700 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300"
        >
          {t("predict.profile.delete")}
        </button>
      </div>
      <ul
        className="flex max-h-[min(32rem,70cqh)] flex-col gap-1.5 overflow-y-auto mat-card p-2"
        role="listbox"
        aria-label={t("predict.profile.listTitle")}
      >
        {profiles.length === 0 ? (
          <li className="px-2 py-3 text-xs text-foreground-muted">
            {t("predict.profile.listEmpty")}
          </li>
        ) : (
          profiles.map((p) => {
            const selected = p.id === activeProfileId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={disabled}
                  onClick={() => onSelectProfile(p.id)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] disabled:opacity-40 ${
                    selected
                      ? "border-accent bg-surface shadow-sm ring-2 ring-accent/25"
                      : "border-transparent bg-surface/60 hover:border-border hover:bg-surface"
                  }`}
                >
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {p.name}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
