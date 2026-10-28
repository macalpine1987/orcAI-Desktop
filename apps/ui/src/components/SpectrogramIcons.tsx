import type { ReactNode } from "react";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export function IconChevronLeft() {
  return (
    <Icon>
      <path {...stroke} d="m14 6-6 6 6 6" />
    </Icon>
  );
}

export function IconChevronRight() {
  return (
    <Icon>
      <path {...stroke} d="m10 6 6 6-6 6" />
    </Icon>
  );
}

/** m04 segment strip: smooth single-cycle sine. */
export function IconWaveform({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.5 12c1.5-6 3-8 4.75-8S11 18 12 18s3.75-14 5.5-14S20 18 21.5 12"
      />
    </Icon>
  );
}

/** Compact dropdown chevron for m04 file menu. */
export function IconChevronDown({ size = 11 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m6.5 9 5.5 5.5L17.5 9"
      />
    </Icon>
  );
}

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
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={2.35}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.6 8.2a5.6 5.6 0 1 0-1.2 6.4"
      />
      <path
        fill="currentColor"
        stroke="none"
        d="M18.4 4.1v5.1h-5.1z"
      />
    </Icon>
  );
}

/** Open hand — free pan / grab tool for the spectrogram (reads at 16–18px). */
export function IconHand({ size = 18 }: { size?: number }) {
  const handStroke = {
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2.25,
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

export function IconFilter() {
  return (
    <Icon>
      <path
        {...stroke}
        d="M4 5h16l-6 7v5l-4 2v-7L4 5Z"
      />
    </Icon>
  );
}

export function IconLayers() {
  return (
    <Icon>
      <path {...stroke} d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path {...stroke} d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </Icon>
  );
}

/** Playback volume — speaker / динамик. */
export function IconVolume({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path
        {...stroke}
        d="M4 9.5h2.4L11 5.8v12.4L6.4 14.5H4V9.5Z"
      />
      <path {...stroke} d="M14.2 9.2a3.6 3.6 0 0 1 0 5.6" />
      <path {...stroke} d="M16.6 7a6.2 6.2 0 0 1 0 10" />
    </Icon>
  );
}

/** Overlay mark fill strength (toolbar opacity slider). */
/** Mockup SpecHeaderBar glyph: ◐ (circle with left half black). */
export function IconMarkOpacity() {
  return (
    <span className="predict-logic-mark-opacity-glyph" aria-hidden>
      ◐
    </span>
  );
}

export function IconLanes() {
  return (
    <Icon>
      <path {...stroke} d="M4 6h16M4 12h16M4 18h10" />
    </Icon>
  );
}

export function IconExport({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path {...stroke} d="M12 3v12M8 11l4 4 4-4" />
      <path {...stroke} d="M5 19h14" />
    </Icon>
  );
}

export function IconTrash({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path {...stroke} d="M5 7h14" />
      <path {...stroke} d="M10 7V5h4v2" />
      <path {...stroke} d="M8 7l1 12h6l1-12" />
    </Icon>
  );
}

export function IconPalette() {
  return (
    <Icon size={16}>
      <circle {...stroke} cx="8" cy="10" r="2.5" />
      <circle {...stroke} cx="14" cy="8" r="2.5" />
      <circle {...stroke} cx="15" cy="14" r="2.5" />
    </Icon>
  );
}

export function IconPlay({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      {/* Optical center: triangle slightly right of geometric center */}
      <path
        d="M9.2 6.4c0-.55.58-.9 1.06-.64l8.05 4.6c.5.28.5 1 0 1.28l-8.05 4.6c-.48.28-1.06-.09-1.06-.64V6.4Z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

export function IconPause({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="7.25" y="6.5" width="3.25" height="11" rx="0.85" fill="currentColor" stroke="none" />
      <rect x="13.5" y="6.5" width="3.25" height="11" rx="0.85" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconStop() {
  return (
    <Icon>
      <rect x="8.1" y="8.1" width="7.8" height="7.8" rx="1.1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** Skip to start of track — bar + filled chevron (DAW). */
export function IconToStart() {
  return (
    <Icon>
      <path
        d="M7.5 6.75v10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M17.25 6.85c0-.48-.5-.78-.9-.55l-7.1 4.7c-.42.28-.42.82 0 1.1l7.1 4.7c.4.23.9-.07.9-.55V6.85Z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

/** Skip to end of track — filled chevron + bar (DAW). */
export function IconToEnd() {
  return (
    <Icon>
      <path
        d="M6.75 6.85c0-.48.5-.78.9-.55l7.1 4.7c.42.28.42.82 0 1.1l-7.1 4.7c-.4.23-.9-.07-.9-.55V6.85Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M16.5 6.75v10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Icon>
  );
}

export function IconSkipBack() {
  return (
    <Icon>
      <path
        d="M11.4 6.85c0-.48-.5-.78-.9-.55L3.4 11c-.42.28-.42.82 0 1.1l7.1 4.7c.4.23.9-.07.9-.55V6.85Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M20.1 6.85c0-.48-.5-.78-.9-.55L12.1 11c-.42.28-.42.82 0 1.1l7.1 4.7c.4.23.9-.07.9-.55V6.85Z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

export function IconSkipForward() {
  return (
    <Icon>
      <path
        d="M3.9 6.85c0-.48.5-.78.9-.55L11.9 11c.42.28.42.82 0 1.1l-7.1 4.7c-.4.23-.9-.07-.9-.55V6.85Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M12.6 6.85c0-.48.5-.78.9-.55L20.6 11c.42.28.42.82 0 1.1l-7.1 4.7c-.4.23-.9-.07-.9-.55V6.85Z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

export function IconLoop({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      {/* Squircle loop + arrowhead at top-right (m04 / Logic). */}
      <path
        {...stroke}
        d="M15.75 8.35H9.1a3.15 3.15 0 0 0 0 7.3h6.65a3.15 3.15 0 0 0 2.55-5.05"
      />
      <path
        fill="currentColor"
        stroke="none"
        d="M13.55 5.55 17.15 8.2l-3.6 2.65V5.55Z"
      />
    </Icon>
  );
}

/** Playlist / analyzed-files picker — list rows with play mark (player-style). */
export function IconAudioFiles({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path
        fill="currentColor"
        stroke="none"
        d="M4.2 6.1 9.1 9.05a.55.55 0 0 1 0 .95L4.2 12.95A.55.55 0 0 1 3.4 12.5V6.55a.55.55 0 0 1 .8-.45Z"
      />
      <path {...stroke} d="M11.25 7.1H20" />
      <path {...stroke} d="M11.25 12H20" />
      <path {...stroke} d="M5.5 17H20" />
    </Icon>
  );
}
