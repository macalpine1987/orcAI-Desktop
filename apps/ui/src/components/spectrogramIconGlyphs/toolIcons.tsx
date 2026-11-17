import { Icon, stroke } from "./iconBase";

export { IconMarkOpacity } from "./markOpacityIcon";

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

/** Colored class bands — Analysis «Классы» affordance on the segment rail. */

export function IconClassesColored({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path
        d="M12 3.2 3.2 8.1l8.8 4.9 8.8-4.9L12 3.2Z"
        fill="#5b8def"
        stroke="none"
      />
      <path
        d="M3.2 11.6 12 16.5l8.8-4.9"
        fill="none"
        stroke="#e0a14a"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.2 15.6 12 20.5l8.8-4.9"
        fill="none"
        stroke="#6bbf6b"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

