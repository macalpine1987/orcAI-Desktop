import clsx from "clsx";
import type { RuntimeStep } from "../lib/runtimeProgress";

export type RuntimeReadyLampState = "off" | "loading" | "on";

type Props = {
  state: RuntimeReadyLampState;
  className?: string;
  title?: string;
  "aria-label"?: string;
};

/** Jewel-well pilot lamp for analysis environment readiness. */
export function RuntimeReadyLamp({
  state,
  className,
  title,
  "aria-label": ariaLabel,
}: Props) {
  return (
    <span
      className={clsx(
        "runtime-ready-lamp",
        state === "on" && "is-on",
        state === "loading" && "is-loading",
        className,
      )}
      title={title}
      aria-label={ariaLabel}
      role="img"
    >
      <span className="runtime-ready-lamp-well" aria-hidden>
        <span className="runtime-ready-lamp-jewel" />
      </span>
    </span>
  );
}

export function runtimeReadyLampState(params: {
  runtimeStep: RuntimeStep;
}): RuntimeReadyLampState {
  const step = params.runtimeStep;
  if (step === "ready") return "on";
  if (
    step === "starting_sidecar" ||
    step === "starting_engine" ||
    step === "stopping"
  ) {
    return "loading";
  }
  return "off";
}
