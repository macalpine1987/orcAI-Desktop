import { useEffect, useState } from "react";

/** Tick once per second while ``active`` — shared live-duration clock. */
export function useNowSec(active: boolean, intervalMs = 1000): number {
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000);

  useEffect(() => {
    if (!active) return;
    setNowSec(Date.now() / 1000);
    const id = window.setInterval(
      () => setNowSec(Date.now() / 1000),
      Math.max(250, intervalMs),
    );
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return nowSec;
}
