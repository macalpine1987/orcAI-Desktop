import packageJson from "../../package.json";

/** Application release version from package.json. */
export const APP_VERSION: string = packageJson.version;

/** Display label, e.g. `v0.1.1`. */
export function formatAppVersion(version: string = APP_VERSION): string {
  return version.startsWith("v") ? version : `v${version}`;
}
