import { useCallback, useEffect, useState } from "react";
import {
  loadProjectClassColors,
  saveProjectClassColors,
} from "../lib/classColors";
import { useWorkspace } from "./useWorkspace";

/** Live project class-color overrides (empty when no project / file). */
export function useProjectClassColors(): {
  colors: Record<string, string>;
  setColor: (classId: string, hex: string | null) => void;
  reload: () => void;
  ready: boolean;
} {
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
            /* keep UI state; next saveDraft/launch retries */
          });
        }
        return next;
      });
    },
    [projectDir],
  );

  return { colors, setColor, reload, ready };
}
