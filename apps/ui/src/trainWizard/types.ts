/** Training wizard draft state. */

/** Wizard branches only. Isolated ``hpsearch`` runs from the pipeline step (not a third scenario). */
export type TrainScenario = "from_scratch" | "finetune";

export type WizardStepId =
  | "scenario"
  | "data"
  | "spectro"
  | "model"
  | "preflight";

export const WIZARD_STEP_IDS: readonly WizardStepId[] = [
  "scenario",
  "data",
  "spectro",
  "model",
  "preflight",
] as const;

export type ClassStatRow = {
  id: string;
  count: number;
  recordings: number;
  duration_sec: number;
  coverage: number;
  selected: boolean;
};

export type SpectroFields = {
  sampling_rate: number;
  nfft: number;
  n_overlap: number;
  freq_low: number;
  freq_high: number;
  quantile_low: number;
  quantile_high: number;
  snippet_duration: number;
  snippets_per_sec: number;
  segment_duration: number;
  fraction_removal: number;
  train: number;
  val: number;
  test: number;
};

/** orcAI ``model.call_weights`` — null in JSON when ``none``. */
export type CallWeightsMethod = "none" | "balanced" | "max" | "uniform";

export type ModelFields = {
  name: string;
  architecture: "ResNetLSTM" | "ResNet1DConv";
  filters: string;
  epochs: number;
  kernel_size: number;
  batch_size: number;
  dropout_rate: number;
  learning_rate: string;
  lstm_units: number;
  /** Keras ``kernel_initializer`` for conv blocks (`model.conv_initializer`). */
  conv_initializer: string;
  /** Keras initializer for LSTM (`model.lstm_initializer`). */
  lstm_initializer: string;
  monitor: string;
  early_stopping_patience: number;
  reduce_lr_patience: number;
  reduce_lr_factor: number;
  /** Scientific / decimal string → ``ReduceLROnPlateau_min_learning_rate``. */
  reduce_lr_min_learning_rate: string;
  /** Maps to JSON ``null`` when ``none``. */
  call_weights: CallWeightsMethod;
  shuffle: boolean;
  seed: number;
  n_batch_train: number;
  n_batch_val: number;
  n_batch_test: number;
};

/** orcAI ``default_hps_parameter.json`` as editable wizard fields (comma lists). */
export type HpsFields = {
  filters_set1: string;
  filters_set2: string;
  filters_set3: string;
  lstm_units: string;
  dropout_rate: string;
  kernel_size: string;
  batch_size: string;
  tuner_max_epochs: number;
  tuner_early_stopping_patience: number;
};

export type TrainWizardDraft = {
  scenario: TrainScenario;
  step: WizardStepId;
  /** Base model id/path when scenario is finetune. */
  finetuneBaseModel: string | null;
  recordingTableRel: string;
  annotationsRel: string;
  equivalencesRel: string;
  /** Raw annotation label → canonical class (orcAI call_equivalences.json). */
  equivalencesMap: Record<string, string>;
  classes: ClassStatRow[];
  spectro: SpectroFields;
  model: ModelFields;
  /** Opt-in: insert ``hpsearch`` before train in the from-scratch plan. */
  includeHpsearch: boolean;
  hps: HpsFields;
  testAfterTrain: boolean;
  compression: string;
};

/** From-scratch plan without hpsearch. */
export const FROM_SCRATCH_COMMANDS = [
  "create-spectrograms",
  "create-label-arrays",
  "create-snippet-table",
  "create-tvt-snippet-tables",
  "create-tvt-data",
  "train",
  "test",
] as const;

export const PREP_ONLY_COMMANDS = FROM_SCRATCH_COMMANDS.slice(0, 5);
