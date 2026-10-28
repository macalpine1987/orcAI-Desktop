import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getAppShellPortalHost } from "../lib/appShellPortal";
import {
  formatPackageSubtitle,
  type AnalysisPackage,
} from "../workspace/analysisPackages";

type Props = {
  open: boolean;
  anchor: { x: number; y: number };
  packages: AnalysisPackage[];
  activePackageId: string | null;
  disabled?: boolean;
  resolveFileCount: (pkg: AnalysisPackage) => number;
  onSelectPackage: (id: string) => void;
  onManagePackages: () => void;
  onClose: () => void;
};

export function PredictAnalysisPackageContextMenu({
  open,
  anchor,
  packages,
  activePackageId,
  disabled,
  resolveFileCount,
  onSelectPackage,
  onManagePackages,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={t("predict.analysis.packageContextMenuLabel")}
      className="z-50 min-w-[14rem] max-w-[min(24rem,calc(100vw-1rem))] mat-panel py-1 shadow-lg"
      style={{ position: "fixed", left: anchor.x, top: anchor.y }}
    >
      {packages.length === 0 ? (
        <p className="px-3 py-2 text-sm text-foreground-muted">
          {t("predict.analysis.packageContextMenuEmpty")}
        </p>
      ) : (
        <ul className="max-h-[min(20rem,calc(100vh-3rem))] overflow-y-auto py-1">
          {packages.map((pkg) => {
            const resolved = resolveFileCount(pkg);
            const missing = pkg.fileNames.length - resolved;
            const selected = pkg.id === activePackageId;
            return (
              <li key={pkg.id}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => {
                    onSelectPackage(pkg.id);
                    onClose();
                  }}
                  className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-40 ${
                    selected ? "bg-accent/10" : ""
                  }`}
                >
                  <span className="flex w-full items-center gap-2 font-medium text-foreground">
                    {selected ? (
                      <span className="text-accent" aria-hidden>
                        ✓
                      </span>
                    ) : (
                      <span className="w-[1ch]" aria-hidden />
                    )}
                    <span className="min-w-0 truncate">{pkg.name}</span>
                  </span>
                  <span className="mt-0.5 pl-[calc(1ch+0.5rem)] text-[11px] text-foreground-muted">
                    {formatPackageSubtitle(pkg, resolved)}
                  </span>
                  {missing > 0 ? (
                    <span className="mt-0.5 pl-[calc(1ch+0.5rem)] text-[10px] text-amber-800 dark:text-amber-200">
                      {t("predict.analysisPackage.missingFiles", {
                        count: missing,
                      })}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-border px-1 py-1">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onManagePackages();
            onClose();
          }}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-accent hover:bg-muted"
        >
          {t("predict.analysis.managePackages")}
        </button>
      </div>
    </div>,
    getAppShellPortalHost(),
  );
}
