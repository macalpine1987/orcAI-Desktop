import { createContext, useContext } from "react";

/**
 * True while a keep-alive Lab section is the visible route.
 * Default true so Outlet pages (Home, Projects, …) stay unaffected.
 */
export const LabSectionActiveContext = createContext(true);

export function useLabSectionActive(): boolean {
  return useContext(LabSectionActiveContext);
}
