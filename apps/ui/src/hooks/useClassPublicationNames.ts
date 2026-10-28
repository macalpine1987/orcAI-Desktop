import { useEffect, useState } from "react";
import { readTextFile } from "../api/filterPreview";
import { joinFsPath } from "../lib/joinFsPath";
import {
  parseEquivalencesJson,
  publicationNamesFromEquivalences,
} from "../trainWizard/equivalences";
import { useWorkspace } from "./useWorkspace";

const EQUIVALENCES_FILE = "call_equivalences.json";

/** Class → wizard synonym, used as the Type-column publication name. */
export function useClassPublicationNames(): Record<string, string> {
  const { projectDir } = useWorkspace();
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    if (!projectDir) {
      setNames({});
      return;
    }
    void readTextFile(joinFsPath(projectDir, EQUIVALENCES_FILE))
      .then((text) => {
        if (cancelled) return;
        if (!text?.trim()) {
          setNames({});
          return;
        }
        try {
          setNames(publicationNamesFromEquivalences(parseEquivalencesJson(text)));
        } catch {
          setNames({});
        }
      })
      .catch(() => {
        if (!cancelled) setNames({});
      });
    return () => {
      cancelled = true;
    };
  }, [projectDir]);

  return names;
}
