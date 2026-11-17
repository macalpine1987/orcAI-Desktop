import { useEffect, useRef, useState } from "react";
import { fetchProject, updateProject } from "../../api/projects";
import {
  type SpectrogramColormap,
  spectrogramColormapFromProject,
} from "../../lib/spectrogramView";
import { silentCatch } from "../../lib/silentCatch";
import {
  COLORMAP_STORAGE_KEY,
  loadColormap,
} from "./spectrogramViewerHelpers";

type Options = {
  layout: "proLab" | "compact" | "scientific";
  isScientific: boolean;
  activeProjectId: string | null | undefined;
};

export function useSpectrogramColormap({
  layout,
  isScientific,
  activeProjectId,
}: Options) {
  const colormapChoiceRev = useRef(0);
  const [colormapState, setColormapState] = useState<SpectrogramColormap>(() =>
    layout === "scientific" ? "gray" : loadColormap(),
  );
  const colormap = colormapState;
  const lightGrayCanvas = isScientific && colormap === "gray";

  const setColormap = (map: SpectrogramColormap) => {
    setColormapState(map);
    if (isScientific) {
      colormapChoiceRev.current += 1;
      if (!activeProjectId) return;
      void updateProject(activeProjectId, { spectrogram_colormap: map }).catch(
        silentCatch("colormapPersist"),
      );
      return;
    }
    try {
      localStorage.setItem(COLORMAP_STORAGE_KEY, map);
    } catch (err) {
      silentCatch("colormapLocalStorage")(err);
    }
  };

  useEffect(() => {
    if (layout !== "scientific") return;
    colormapChoiceRev.current = 0;
    if (!activeProjectId) {
      setColormapState("gray");
      return;
    }
    let cancelled = false;
    void fetchProject(activeProjectId)
      .then((project) => {
        if (cancelled || colormapChoiceRev.current !== 0) return;
        setColormapState(
          spectrogramColormapFromProject(project.spectrogram_colormap),
        );
      })
      .catch((err) => {
        silentCatch("colormapFetch")(err);
        if (!cancelled && colormapChoiceRev.current === 0) {
          setColormapState("gray");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [layout, activeProjectId]);

  useEffect(() => {
    if (isScientific) return;
    try {
      localStorage.setItem(COLORMAP_STORAGE_KEY, colormapState);
    } catch (err) {
      silentCatch("colormapLocalStorageWrite")(err);
    }
  }, [colormapState, isScientific]);

  return { colormap, colormapState, setColormap, lightGrayCanvas };
}
