import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  loadProjectClassColors,
  saveProjectClassColors,
} from "../lib/classColors";
import { useSaveNotice } from "../ui/saveNotice";
import { useWorkspace } from "./useWorkspace";

/** Live project class-color overrides (empty when no project / file). */
export function useProjectClassColors(): {
  colors: Record<string, string>;
  setColor: (classId: string, hex: string | null) => void;
  reload: () => void;
  ready: boolean;
} {
  const { t } = useTranslation();
  const { notifyHeaderError } = useSaveNotice();
  const { projectDir } = useWorkspace();
  const [colors, setColors] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  const reload = useCallback(() => {
    if (!projectDir) {
      setColors({});
      setReady(true);
      return;
    }
    setReady(false);
    void loadProjectClassColors(projectDir).then((next) => {
      setColors(next);
      setReady(true);
    });
  }, [projectDir]);

  useEffect(() => {
    reload();
  }, [reload]);

  const setColor = useCallback(
    (classId: string, hex: string | null) => {
      setColors((prev) => {
        const next = { ...prev };
        if (!hex) delete next[classId];
        else next[classId] = hex;
        if (projectDir) {
          void saveProjectClassColors(projectDir, next).catch(() => {
            notifyHeaderError(t("projects.studio.classColors.saveFailed"));
          });
        }
        return next;
      });
    },
    [projectDir, notifyHeaderError, t],
  );

  return { colors, setColor, reload, ready };
}
