import type { ReactNode } from "react";
import type { NavItemId } from "../layout/navigation";

/** m16/v12 sidebar — thin outline icons, shared app-wide via AppShell. */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const ICONS: Record<NavItemId, ReactNode> = {
  home: (
    <Icon>
      <path
        {...stroke}
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
      />
    </Icon>
  ),
  projects: (
    <Icon>
      <path
        {...stroke}
        d="M4 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
      />
    </Icon>
  ),
  predict: (
    <Icon>
      <circle {...stroke} cx="11" cy="11" r="7" />
      <path {...stroke} d="m16.5 16.5 5.5 5.5" />
    </Icon>
  ),
  pipeline: (
    <Icon>
      <path
        {...stroke}
        d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"
      />
      <path {...stroke} d="M22 10v6" />
      <path {...stroke} d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </Icon>
  ),
  models: (
    <Icon>
      <path
        {...stroke}
        d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
      />
      <path {...stroke} d="m3.3 7 8.7 5 8.7-5" />
      <path {...stroke} d="M12 22V12" />
    </Icon>
  ),
  results: (
    <Icon>
      <rect {...stroke} x="4" y="4" width="16" height="16" rx="2" />
      <path {...stroke} d="M8 16.5 11 12.5l3 2 5-6" />
      <circle cx="8" cy="16.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="12.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="14.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="8.5" r="1" fill="currentColor" stroke="none" />
    </Icon>
  ),
  jobs: (
    <Icon>
      <circle cx="5" cy="6" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="1.25" fill="currentColor" stroke="none" />
      <path {...stroke} d="M9 6h11M9 12h11M9 18h11" />
    </Icon>
  ),
  settings: (
    <Icon>
      <circle {...stroke} cx="12" cy="12" r="3" />
      <path
        {...stroke}
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      />
    </Icon>
  ),
  help: (
    <Icon>
      <circle {...stroke} cx="12" cy="12" r="9" />
      <path
        {...stroke}
        d="M9.5 9.5a2.5 2.5 0 1 1 4.2 1.8c-.9.7-1.7 1.5-1.7 2.7"
      />
      <circle cx="12" cy="17.5" r="0.75" fill="currentColor" stroke="none" />
    </Icon>
  ),
};

export function NavIcon({ id, className }: { id: NavItemId; className?: string }) {
  return <span className={className}>{ICONS[id]}</span>;
}
