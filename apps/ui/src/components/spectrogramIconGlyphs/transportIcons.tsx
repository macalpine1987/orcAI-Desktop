import { Icon } from "./iconBase";

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

export function IconLoop({ size = 22 }: { size?: number }) {
  return (
    <Icon size={size}>
      {/* Music-style repeat: two stadium arrows (user ref); slightly bolder than Reset. */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 11.25V9a3.75 3.75 0 0 1 3.75-3.75H19" />
        <path d="M16 2.75 20.25 5.5 16 8.25" />
        <path d="M19 12.75V15a3.75 3.75 0 0 1-3.75 3.75H5" />
        <path d="M8 21.25 3.75 18.5 8 15.75" />
      </g>
    </Icon>
  );
}

/** Playlist / analyzed-files picker — list rows with play mark (player-style). */

