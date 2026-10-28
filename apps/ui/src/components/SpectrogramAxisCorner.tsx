type Props = {
  frequencyUnit?: string;
};

/** Bottom-left corner between frequency and time axes (Y-axis unit). */
export function SpectrogramAxisCorner({ frequencyUnit }: Props) {
  return (
    <div className="analysis-axis-corner shrink-0" aria-hidden>
      {frequencyUnit ? (
        <span className="analysis-axis-corner-unit">{frequencyUnit}</span>
      ) : null}
    </div>
  );
}
