import { Icon, stroke } from "./iconBase";

export function IconZoomIn() {
  return (
    <Icon>
      <circle {...stroke} cx="10.5" cy="10.5" r="6.25" />
      <path {...stroke} d="m15.25 15.25 5 5" />
      <path {...stroke} d="M10.5 8v5M8 10.5h5" />
    </Icon>
  );
}

export function IconZoomOut() {
  return (
    <Icon>
      <circle {...stroke} cx="10.5" cy="10.5" r="6.25" />
      <path {...stroke} d="m15.25 15.25 5 5" />
      <path {...stroke} d="M8 10.5h5" />
    </Icon>
  );
}

/** Reset generic control to default (e.g. opacity slider). */

export function IconZoomReset() {
  return (
    <Icon>
      <path {...stroke} d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
    </Icon>
  );
}

/** Circular arrow for glossy yellow–orange slider reset chips. */

export function IconCircularReset({ size = 12 }: { size?: number }) {
  return (
    <Icon size={size}>
      <g transform="translate(12 12) scale(1.5) translate(-12.66 -10.13)">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth={1.45}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.6 8.2a5.6 5.6 0 1 0-1.2 6.4"
        />
        <path fill="currentColor" stroke="none" d="M18.4 4.1v5.1h-5.1z" />
      </g>
    </Icon>
  );
}

/** Open hand — free pan / grab tool for the spectrogram (reads at 16–18px). */

export function IconHand({ size = 18 }: { size?: number }) {
  const handStroke = {
    fill: "none" as const,
    stroke: "currentColor",
    /* Same weight as IconCircularReset — thicker strokes read as a white glow. */
    strokeWidth: 1.45,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Icon size={size}>
      {/* Index / middle / ring fingers */}
      <path {...handStroke} d="M18 11V6.5a1.75 1.75 0 0 0-3.5 0" />
      <path {...handStroke} d="M14.5 10V4.5a1.75 1.75 0 0 0-3.5 0v2" />
      <path {...handStroke} d="M11 10.5V6.25a1.75 1.75 0 0 0-3.5 0v8" />
      {/* Thumb + palm outline */}
      <path
        {...handStroke}
        d="M18 8.25a1.75 1.75 0 0 1 3.5 0V14a7.5 7.5 0 0 1-7.5 7.5h-1.65c-2.55 0-4.15-.8-5.55-2.2L3.4 15.85a1.7 1.7 0 0 1 2.4-2.4L8 15.65"
      />
    </Icon>
  );
}

/**
 * Fit the visible window to the current file segment — inward frame + horizontal
 * span (Audacity “Zoom to Fit”, Premiere “Fit to Frame” on the time axis).
 */

export function IconZoomFitSegment() {
  return (
    <Icon>
      <path {...stroke} d="M8 5H5V8" />
      <path {...stroke} d="M16 5h3v3" />
      <path {...stroke} d="M19 16v3h-3" />
      <path {...stroke} d="M8 19H5v-3" />
      <path {...stroke} d="M9 9.5v5M15 9.5v5" />
      <path {...stroke} d="M10 12H14" />
      <path {...stroke} d="M10.5 10.5 9 12l1.5 1.5" />
      <path {...stroke} d="M13.5 10.5 15 12l-1.5 1.5" />
    </Icon>
  );
}

export function IconLinearSpec() {
  return (
    <Icon>
      <path {...stroke} d="M4 19V5M4 19h16" />
      <path {...stroke} d="M7 16l3-5 3 3 4-9" />
    </Icon>
  );
}

export function IconLogMel() {
  return (
    <Icon>
      <path {...stroke} d="M4 19V5M4 19h16" />
      <path {...stroke} d="M7 17c2-8 4-10 6-12 2 4 4 6 7 12" />
    </Icon>
  );
}

