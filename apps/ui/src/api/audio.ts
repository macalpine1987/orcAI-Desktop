import { getSidecarBase } from "./sidecar";

export function audioPlaybackUrl(wavPath: string, channel: number): string {
  const url = new URL(`${getSidecarBase()}/v1/audio/playback`);
  url.searchParams.set("path", wavPath);
  url.searchParams.set("channel", String(channel));
  return url.toString();
}

export function audioSegmentUrl(
  wavPath: string,
  channel: number,
  t0: number,
  t1: number,
): string {
  const url = new URL(`${getSidecarBase()}/v1/audio/segment`);
  url.searchParams.set("path", wavPath);
  url.searchParams.set("channel", String(channel));
  url.searchParams.set("t0", String(t0));
  url.searchParams.set("t1", String(t1));
  return url.toString();
}
