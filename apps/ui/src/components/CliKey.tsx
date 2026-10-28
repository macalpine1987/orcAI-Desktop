/** Inline CLI short key for predict field labels. */
export function CliKey({ flag }: { flag: string }) {
  return (
    <span className="predict-cli-key font-mono text-[10px] font-normal text-foreground-muted">
      ({flag})
    </span>
  );
}
