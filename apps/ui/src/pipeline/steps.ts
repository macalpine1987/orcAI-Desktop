export type PipelineStepId =
  | "init"
  | "predict"
  | "filter-predictions"
  | "create-spectrograms"
  | "create-label-arrays"
  | "create-snippet-table"
  | "create-tvt-snippet-tables"
  | "create-tvt-data"
  | "hpsearch"
  | "train"
  | "test";

export type PipelineStep = {
  id: PipelineStepId;
  order: number;
  /** Dedicated UI route; if set, primary action is navigation. */
  route?: string;
  /** Param keys shown in Expert quick-run (paths from workspace when possible). */
  paramKeys?: string[];
};

/** Eight orcAI training steps on the board. */
export const TRAIN_PIPELINE_STEPS: PipelineStep[] = [
  {
    id: "create-spectrograms",
    order: 1,
    paramKeys: ["recording_table_path", "output_dir"],
  },
  {
    id: "create-label-arrays",
    order: 2,
    paramKeys: ["recording_table_path", "output_dir"],
  },
  {
    id: "create-snippet-table",
    order: 3,
    paramKeys: ["recording_table_path", "recording_data_dir"],
  },
  {
    id: "create-tvt-snippet-tables",
    order: 4,
    paramKeys: ["output_dir"],
  },
  { id: "create-tvt-data", order: 5, paramKeys: ["tvt_dir"] },
  { id: "hpsearch", order: 6, paramKeys: ["data_dir", "output_dir"] },
  { id: "train", order: 7, paramKeys: ["data_dir", "output_dir"] },
  { id: "test", order: 8, paramKeys: ["model_dir", "data_dir"] },
];

export const PIPELINE_STEPS: PipelineStep[] = [
  { id: "init", order: 1, route: "/projects", paramKeys: ["project_dir", "project_name"] },
  { id: "predict", order: 2, route: "/predict", paramKeys: ["recording_path"] },
  {
    id: "filter-predictions",
    order: 3,
    paramKeys: ["predicted_labels"],
  },
  ...TRAIN_PIPELINE_STEPS.map((step, index) => ({ ...step, order: index + 4 })),
];
