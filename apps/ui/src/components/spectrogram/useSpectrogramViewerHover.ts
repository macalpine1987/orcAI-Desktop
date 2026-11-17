import { useCallback, useState } from "react";

export type SpectrogramHoverCoords = {
  timeSec: number;
  yFrac: number;
};

type Options = {
  coordsFromClient: (
    clientX: number,
    clientY: number,
  ) => SpectrogramHoverCoords | null;
};

/** Hover cursor state + client→plot mapping for spectrogram tools/LCD. */
export function useSpectrogramViewerHover({ coordsFromClient }: Options) {
  const [hoverCoords, setHoverCoords] = useState<SpectrogramHoverCoords | null>(
    null,
  );

  const updateHoverFromClient = useCallback(
    (clientX: number, clientY: number) => {
      setHoverCoords(coordsFromClient(clientX, clientY));
    },
    [coordsFromClient],
  );

  return { hoverCoords, setHoverCoords, updateHoverFromClient };
}
