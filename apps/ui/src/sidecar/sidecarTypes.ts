import type {
  EngineProgressStage,
  SidecarCapabilities,
  SidecarHealth,
} from "../api/sidecar";
import type { RuntimeStep } from "../lib/runtimeProgress";
import type { ComputeDevice } from "../preferences/storage";

export type ServicePhase =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export type { RuntimeStep };

export type SidecarContextValue = {
  online: boolean;
  /** Localhost port chosen for this sidecar session (Tauri only). */
  sidecarPort: number | null;
  engineReady: boolean;
  engineStatus: SidecarHealth["engine"] | null;
  engineStage: EngineProgressStage | null;
  capabilities: SidecarCapabilities | null;
  sidecarPhase: ServicePhase;
  enginePhase: ServicePhase;
  sidecarProgress: number;
  engineProgress: number;
  runtimeStep: RuntimeStep;
  runtimeProgress: number;
  runtimeStatusKey: string;
  /** True during CPU↔GPU restart — work sections stay navigable. */
  gracefulRuntimeRestart: boolean;
  /** Home/Settings/Help always; other sections need engine or graceful restart. */
  sectionsAccessible: boolean;
  lastError: string | null;
  startSidecar: () => Promise<void>;
  stopSidecar: () => Promise<void>;
  startEngineService: (deviceOverride?: ComputeDevice) => Promise<void>;
  /** Restart sidecar + engine so TensorFlow picks up a new CPU/GPU choice. */
  restartRuntimeForComputeDevice: (device: ComputeDevice) => Promise<void>;
  stopEngineService: () => Promise<void>;
  startAll: () => Promise<void>;
  stopAll: () => Promise<void>;
  refresh: () => Promise<void>;
};
