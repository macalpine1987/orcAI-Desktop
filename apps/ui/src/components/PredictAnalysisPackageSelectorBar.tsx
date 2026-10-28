import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  formatPackageSubtitle,
  resolvePackageFileNames,
  type AnalysisPackage,
} from "../workspace/analysisPackages";
import type { PredictQueue } from "../workspace/predictQueue";

type Props = {
  queue: PredictQueue;
  packages: AnalysisPackage[];
  activePackage: AnalysisPackage | null;
  disabled?: boolean;
  menuOpen: boolean;
  onToggleMenu: (anchor: { x: number; y: number }) => void;
  /** Render inside analysis toolbar row (compact). */
  inline?: boolean;
};

export function PredictAnalysisPackageSelectorBar({
  queue,
  packages,
  activePackage,
  disabled,
  menuOpen,
  onToggleMenu,
  inline = false,
}: Props) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const resolvedCount = activePackage
    ? resolvePackageFileNames(queue, activePackage).length
    : 0;

  const openMenu = () => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onToggleMenu({ x: rect.left, y: rect.bottom + 4 });
  };

  return (
    <div
      className={
        inline
          ? "flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-initial sm:flex-none"
          : "flex flex-wrap items-center gap-2"
      }
    >
      <span
        className={
          inline
            ? "shrink-0 text-xs font-medium text-foreground-muted"
            : "text-sm font-medium text-foreground-muted"
        }
      >
        {t("predict.analysis.packageButtonPrefix")}
      </span>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={openMenu}
        className={
          inline
            ? "inline-flex min-h-9 max-w-[min(100%,18rem)] items-center gap-2 mat-panel px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm hover:bg-muted disabled:opacity-40 sm:max-w-xs"
            : "inline-flex min-h-10 max-w-full items-center gap-2 mat-panel px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted disabled:opacity-40"
        }
      >
        <span className="truncate">
          {activePackage
            ? activePackage.name
            : t("predict.analysis.packageButtonPlaceholder")}
        </span>
        <span className="shrink-0 text-foreground-muted" aria-hidden>
          ▾
        </span>
      </button>
      {activePackage ? (
        <span className="text-xs text-foreground-muted">
          {formatPackageSubtitle(activePackage, resolvedCount)}
        </span>
      ) : packages.length > 0 ? (
        <span className="text-xs text-foreground-muted">
          {t("predict.analysis.packageCount", { count: packages.length })}
        </span>
      ) : null}
    </div>
  );
}
