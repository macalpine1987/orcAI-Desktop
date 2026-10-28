import {
  FROM_SCRATCH_COMMANDS,
  PREP_ONLY_COMMANDS,
} from "./types";

export type PlanCommand = {
  id: string;
  etaMin: number;
};

const ETA: Record<string, number> = {
  "create-spectrograms": 18,
  "create-label-arrays": 3,
  "create-snippet-table": 5,
  "create-tvt-snippet-tables": 1,
  "create-tvt-data": 9,
  hpsearch: 180,
  train: 250,
  test: 4,
};

export function fromScratchCommands(opts: {
  prepOnly: boolean;
  includeTest: boolean;
  includeHpsearch?: boolean;
}): PlanCommand[] {
  let ids: string[];
  if (opts.prepOnly) {
    ids = [...PREP_ONLY_COMMANDS];
  } else {
    ids = [...FROM_SCRATCH_COMMANDS].filter(
      (id) => opts.includeTest || id !== "test",
    );
    if (opts.includeHpsearch) {
      const trainAt = ids.indexOf("train");
      if (trainAt >= 0 && !ids.includes("hpsearch")) {
        ids = [...ids.slice(0, trainAt), "hpsearch", ...ids.slice(trainAt)];
      }
    }
  }
  return ids.map((id) => ({ id, etaMin: ETA[id] ?? 5 }));
}

export function formatPlanCli(commands: PlanCommand[]): string {
  if (!commands.length) return "";
  return commands.map((c) => `orcai ${c.id} …`).join(" → ");
}

/** Human ETA for plan chips (m12): «≈ 18 м» / «≈ 4 ч 10 м». */
export function formatPlanEta(
  minutes: number,
  labels: { min: string; hour: string },
): string {
  const m = Math.max(0, Math.round(minutes));
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem
      ? `≈ ${h} ${labels.hour} ${rem} ${labels.min}`
      : `≈ ${h} ${labels.hour}`;
  }
  return `≈ ${m} ${labels.min}`;
}
