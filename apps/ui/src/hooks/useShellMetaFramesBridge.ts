import { useSyncExternalStore } from "react";
import {
  getShellMetaFramesBridge,
  subscribeShellMetaFramesBridge,
  type ShellMetaFramesBridge,
} from "../lib/shellMetaFrames";

export function useShellMetaFramesBridge(): ShellMetaFramesBridge {
  return useSyncExternalStore(
    subscribeShellMetaFramesBridge,
    getShellMetaFramesBridge,
    getShellMetaFramesBridge,
  );
}
