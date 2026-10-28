type IconProps = { size?: number; className?: string };

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };
}

export function IconPlus({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function IconFolder({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M1.5 4.5h4l1.2 1.5H14.5v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1Z" />
      <path d="M1.5 7h13" />
    </svg>
  );
}

export function IconFolderLarge({ size = 36, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M1.5 4.25h4.15L6.9 5.75H14.5a.75.75 0 0 1 .75.75v6.75a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1V5a.75.75 0 0 1 .75-.75h.5Z" />
    </svg>
  );
}

/** Empty recordings state — speaker + WAV badge (same size as IconFolderLarge). */
export function IconAudioLarge({ size = 48, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {/* Speaker body */}
      <rect x="5" y="16" width="7" height="16" rx="1.5" />
      {/* Cone */}
      <path d="M12 18.5 24 12v24L12 29.5Z" />
      {/* Sound waves */}
      <path d="M28.5 18.5c2.4 2 2.4 9 0 11" />
      <path d="M33 14.5c4.2 3.5 4.2 15.5 0 19" />
      {/* WAV chip — high-contrast plate */}
      <rect
        className="ps-empty-badge-plate"
        x="22"
        y="33.5"
        width="21"
        height="9.5"
        rx="2"
        fill="#1a1b1d"
        stroke="#d4b04a"
        strokeWidth={1.5}
      />
      <text
        className="ps-empty-badge-label"
        x="32.5"
        y="40.4"
        textAnchor="middle"
        fill="#f2e6b8"
        stroke="none"
        fontSize="6.2"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="800"
        letterSpacing="0.35"
      >
        WAV
      </text>
    </svg>
  );
}

/** Empty annotations state — text document + TXT badge. */
export function IconTxtLarge({ size = 48, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {/* Document */}
      <path d="M11 5h15l9 9v26a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path d="M26 5v9h9" />
      {/* Text lines */}
      <path d="M15 22h16M15 27h16M15 32h10" />
      {/* TXT chip — high-contrast plate */}
      <rect
        className="ps-empty-badge-plate"
        x="22.5"
        y="33.5"
        width="20"
        height="9.5"
        rx="2"
        fill="#1a1b1d"
        stroke="#d4b04a"
        strokeWidth={1.5}
      />
      <text
        className="ps-empty-badge-label"
        x="32.5"
        y="40.4"
        textAnchor="middle"
        fill="#f2e6b8"
        stroke="none"
        fontSize="6.2"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="800"
        letterSpacing="0.35"
      >
        TXT
      </text>
    </svg>
  );
}

export function IconRefresh({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M13 8a5 5 0 1 1-1.5-3.6" />
      <path d="M13 2.5V6h-3.5" />
    </svg>
  );
}

/** Stacked project rows — «Список проектов». */
export function IconProjectsList({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M2.5 3.25h11a0.75 0.75 0 0 1 0.75 0.75v1.5a0.75 0.75 0 0 1-0.75 0.75h-11a0.75 0.75 0 0 1-0.75-0.75v-1.5a0.75 0.75 0 0 1 0.75-0.75Z" />
      <path d="M2.5 7.5h11a0.75 0.75 0 0 1 0.75 0.75v1.5a0.75 0.75 0 0 1-0.75 0.75h-11a0.75 0.75 0 0 1-0.75-0.75v-1.5a0.75 0.75 0 0 1 0.75-0.75Z" />
      <path d="M2.5 11.75h8" />
      <path d="M4 4.75h1.25M4 9h1.25" />
    </svg>
  );
}

export function IconCheck({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="m3 8.5 3 3 7-7" />
    </svg>
  );
}

export function IconSearch({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  );
}

export function IconTrain({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M2 4h9M2 8h12M2 12h7" />
      <path d="m11 2 2 2-2 2" />
      <path d="m9 10 2 2-2 2" />
    </svg>
  );
}

/** Export catalogue — tray with upward arrow. */
export function IconExport({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 2.5v8" />
      <path d="m5 5 3-3 3 3" />
      <path d="M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

export function IconFilter({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M2 3h12L9.5 8.5V13l-3-1.5V8.5Z" />
    </svg>
  );
}

export function IconArrowRight({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export function IconChevronDown({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)} strokeWidth={1.75}>
      <path d="M4 6.5 8 10.5 12 6.5" />
    </svg>
  );
}

export function IconWarning({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 2.5 14.5 13.5H1.5Z" />
      <path d="M8 6.5v3.5M8 12h.01" />
    </svg>
  );
}
