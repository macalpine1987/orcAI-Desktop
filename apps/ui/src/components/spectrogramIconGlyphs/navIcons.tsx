import { Icon, stroke } from "./iconBase";

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

/** Segment prev — solid filled triangle (Analysis rail · option A). */

export function IconSegmentPrev() {
  return (
    <Icon>
      <path
        d="M15.4 6.2 7.85 12l7.55 5.8Z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

/** Segment next — solid filled triangle (Analysis rail · option A). */

export function IconSegmentNext() {
  return (
    <Icon>
      <path
        d="M8.6 6.2 16.15 12 8.6 17.8Z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

/** File-menu ▼ — same filled triangle as prev/next, tip down. */

export function IconSegmentDown() {
  return (
    <Icon>
      <path
        d="M6.2 8.6 17.8 8.6 12 16.15Z"
        fill="currentColor"
        stroke="none"
      />
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

/**
 * Return-to-player glyph on the Analysis segment rail (classes tools mode).
 * Play triangle in a circle — mockup: docs/mockups/orcai-player-play-circle-icon-mockup.jpg
 */

export function IconPlayerReturn({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle
        cx="12"
        cy="12"
        r="8.25"
        fill="none"
        stroke="#7dffa3"
        strokeWidth={1.75}
      />
      <path d="M10.1 8.2 17.1 12 10.1 15.8Z" fill="#ffc078" stroke="none" />
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

