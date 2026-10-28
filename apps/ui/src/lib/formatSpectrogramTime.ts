/** Timestamp for detection table: `00:14.2` or `1:05:14.2` when hours > 0. */
export function formatSpectrogramTimestamp(sec: number): string {
  const clamped = Math.max(0, sec);
  const totalTenths = Math.round(clamped * 10);
  const h = Math.floor(totalTenths / 36000);
  const m = Math.floor((totalTenths % 36000) / 600);
  const s = (totalTenths % 600) / 10;
  if (h > 0) {
    const secWhole = Math.floor((totalTenths % 600) / 10);
    const tenths = totalTenths % 10;
    return `${h}:${String(m).padStart(2, "0")}:${String(secWhole).padStart(2, "0")}.${tenths}`;
  }
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

/** Short duration for table cells: `2.1`. */
export function formatDetectionDurationValue(sec: number): string {
  return Math.max(0, sec).toFixed(1);
}
