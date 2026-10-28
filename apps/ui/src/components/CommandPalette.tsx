import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ModalCloseButton } from "./ModalCloseButton";
import { useSectionsAccessible } from "../hooks/useAppAccess";
import { isRuntimeFreeNavId } from "../lib/appAccess";
import { useWorkspace } from "../hooks/useWorkspace";
import {
  NAV_ITEMS,
  pipelineNavInactiveForWorkspace,
  type NavItemId,
} from "../layout/navigation";

type CommandItem = {
  id: string;
  label: string;
  group: string;
  keywords: string;
  run: () => void;
};

export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sectionsAccessible = useSectionsAccessible();
  const workspace = useWorkspace();
  const hidePipeline = pipelineNavInactiveForWorkspace(workspace);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const items = useMemo((): CommandItem[] => {
    const allowedNav = NAV_ITEMS.filter(
      (item) =>
        (sectionsAccessible || isRuntimeFreeNavId(item.id)) &&
        !(hidePipeline && item.id === "pipeline"),
    );

    const nav: CommandItem[] = allowedNav.map((item) => ({
      id: `nav-${item.id}`,
      label: t(`nav.${item.id}`),
      group: t("commandPalette.groupNavigate"),
      keywords: `${item.id} ${item.path}`,
      run: () => {
        navigate(item.path);
        close();
      },
    }));

    const quick: CommandItem[] = (
      ["predict", "pipeline", "jobs"] as NavItemId[]
    )
      .filter(
        (id) =>
          (sectionsAccessible || isRuntimeFreeNavId(id)) &&
          !(hidePipeline && id === "pipeline"),
      )
      .map((id) => {
      const navItem = NAV_ITEMS.find((item) => item.id === id)!;
      return {
        id: `quick-${id}`,
        label: t("commandPalette.goTo", { page: t(`nav.${id}`) }),
        group: t("commandPalette.groupQuick"),
        keywords: id,
        run: () => {
          navigate(navItem.path);
          close();
        },
      };
    });

    return [...quick, ...nav];
  }, [close, hidePipeline, navigate, sectionsAccessible, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q),
    );
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && filtered[activeIndex]) {
        e.preventDefault();
        filtered[activeIndex].run();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close, filtered, activeIndex]);

  if (!open) return null;

  return (
    <div
      className="mat-modal-backdrop fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      role="presentation"
      onClick={close}
    >
      <div
        className="mat-modal w-full max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-label={t("commandPalette.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border pr-2">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("commandPalette.placeholder")}
            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none"
          />
          <ModalCloseButton onClick={close} />
        </div>
        <ul className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-foreground-muted">
              {t("commandPalette.empty")}
            </li>
          ) : (
            filtered.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => item.run()}
                  className={`flex w-full flex-col px-4 py-2 text-left text-sm ${
                    index === activeIndex ? "bg-muted" : "hover:bg-muted/60"
                  }`}
                >
                  <span className="font-medium">{item.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-foreground-muted">
                    {item.group}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-border px-4 py-2 font-mono text-[10px] text-foreground-muted">
          {t("commandPalette.hint")}
        </p>
      </div>
    </div>
  );
}
