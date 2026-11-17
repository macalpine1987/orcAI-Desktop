/**
 * Opt-in UI for ``hpsearch -pl`` (MirroredStrategy on multiple GPUs).
 * Kept false for Mac-primary builds (single Metal device); wiring stays in
 * draft / pipeline so the control can be re-enabled later without rewiring.
 */
export const SHOW_HPSEARCH_PARALLEL_UI = false;
