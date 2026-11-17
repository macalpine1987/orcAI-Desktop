import { Link } from "react-router-dom";
import { PageHelpButton } from "../components/PageHelpButton";
import { classColorsEditable } from "../lib/classColors";
import {
  estimateTrain,
  hpsFileNameForModel,
  sanitizeWizardDataPaths,
  wizardPathAbsolute,
} from "./defaults";
import { estimateFromSnippetCount } from "./snippetCalc";
import { finetuneBaseSharesExamples } from "./finetune";
import { FinetuneDataStep } from "./FinetuneDataStep";
import { TrainWizardDataStep } from "./TrainWizardDataStep";
import { TrainWizardFooter } from "./TrainWizardFooter";
import { TrainWizardLaunchPlan } from "./TrainWizardLaunchPlan";
import { TrainWizardModelStep } from "./TrainWizardModelStep";
import {
  TrainWizardScenarioNav,
  TrainWizardScenarioStep,
} from "./TrainWizardScenarioShell";
import { TrainWizardSpectroStep } from "./TrainWizardSpectroStep";
import { TrainWizardHpsModal } from "./TrainWizardHpsModal";
import { TrainWizardParamsJsonModal } from "./TrainWizardParamsJsonModal";
import { TrainWizardSnippetCalcModal } from "./TrainWizardSnippetCalcModal";
import { TrainWizardSynonymsModal } from "./TrainWizardSynonymsModal";
import { WIZARD_STEP_IDS, type TrainScenario } from "./types";
import { useTrainWizardDraft } from "./useTrainWizardDraft";
import { wizardErrorMessage } from "./wizardHelpers";

type Props = {
  onClose: (result?: {
    planId?: string;
    firstJobId?: string;
    jobCount?: number;
    includesHpsearch?: boolean;
    commands?: string[];
  }) => void;
  /** Deep-link from Models card: open on finetune card. */
  initialScenario?: TrainScenario;
  /** Base model id or path for finetune. */
  initialBaseModel?: string | null;
};

export function TrainWizard({
  onClose,
  initialScenario,
  initialBaseModel = null,
}: Props) {
  const w = useTrainWizardDraft({ onClose, initialScenario, initialBaseModel });
  const {
    t,
    notifySaved,
    computeDevice,
    capabilities,
    classColorOverrides,
    setClassColor,
    projectId,
    projectDir,
    projectName,
    draft,
    setDraft,
    pipeline,
    busy,
    error,
    setError,
    notice,
    setNotice,
    colorPickerFor,
    setColorPickerFor,
    modelDirTaken,
    synonymsOpen,
    setSynonymsOpen,
    hpsOpen,
    setHpsOpen,
    paramsJsonOpen,
    setParamsJsonOpen,
    snippetCalcOpen,
    setSnippetCalcOpen,
    snippetInventory,
    catalogModels,
    annotationExampleIds,
    finetuneApplyStatus,
    setFinetuneApplyStatus,
    setFinetuneLock,
    finetuneAppliedKeyRef,
    finetuneErrorRetriesRef,
    inheritedLocked,
    locale,
    idx,
    load,
    selectedCalls,
    disabledClasses,
    planFull,
    planEtaTotalMin,
    rareClass,
    paramsOk,
    cmdPreview,
    cliCopied,
    onCopyCli,
    go,
    synonymRuleCount,
    persistEquivalences,
    synonymsByClass,
    commitClassSynonyms,
    canNext,
    nextBlockedReason,
    launchBlockedReason,
    canLaunch,
    saveDraftParams,
    saveParamsJsonToDisk,
    revealParamsJson,
    launch,
    browsePath,
  } = w;

  if (!projectId) {
    return (
      <div className="tw-page">
        <p className="pp-empty">
          {t("pipeline.noProject")}{" "}
          <Link to="/projects" className="underline">
            {t("nav.projects")}
          </Link>
        </p>
      </div>
    );
  }

  const annotated = pipeline?.readiness.annotations.annotated ?? draft.classes.reduce(
    (n, c) => Math.max(n, c.recordings),
    0,
  );
  const totalRec = pipeline?.readiness.recordings.rows ?? 0;
  const skippedRec = Math.max(0, totalRec - annotated);
  const est =
    snippetInventory == null ? null : estimateFromSnippetCount(snippetInventory);
  const trainEst = estimateTrain(draft.model);
  const colorsEditable = classColorsEditable(draft.scenario);


  return (
    <div className="tw-page">
      <div className="studio-panel tw-work-panel">
        <div className="tw-header">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground">
              {inheritedLocked
                ? t("wizard.titleFinetune")
                : t("wizard.title")}
            </h1>
            <p className="mt-1 text-sm text-foreground-muted">
              {inheritedLocked && draft.step === "data"
                ? t("wizard.stepSubtitle.dataFinetune")
                : t(`wizard.stepSubtitle.${draft.step}`)}
            </p>
          </div>
          <div className="tw-header-actions">
            <PageHelpButton topic="train.wizard" hint={t("help.hint.train")} />
          </div>
        </div>

        <div className="tw-body">
          <TrainWizardScenarioNav
            draft={draft}
            inheritedLocked={inheritedLocked}
            idx={idx}
            go={go}
            projectName={projectName}
            totalRec={totalRec}
            annotated={annotated}
          />
          <section className="tw-main">
            {error ? <p className="tw-error">{error}</p> : null}
            {notice ? <p className="tw-notice">{notice}</p> : null}

            {draft.step === "scenario" ? (
              <TrainWizardScenarioStep
                draft={draft}
                setDraft={setDraft}
                finetuneAppliedKeyRef={finetuneAppliedKeyRef}
                setFinetuneLock={setFinetuneLock}
                setFinetuneApplyStatus={setFinetuneApplyStatus}
                onReloadFromScratch={() => void load()}
                onClose={() => onClose()}
              />
            ) : null}

            {draft.step === "data" && inheritedLocked ? (
              <FinetuneDataStep
                catalogModels={catalogModels}
                exampleClassIds={annotationExampleIds}
                baseModel={draft.finetuneBaseModel}
                classes={draft.classes}
                spectro={draft.spectro}
                model={draft.model}
                recordingTableRel={draft.recordingTableRel}
                recordingTableAbs={wizardPathAbsolute(
                  projectDir,
                  draft.recordingTableRel,
                )}
                dataHint={t("wizard.finetuneDataHint", {
                  total: totalRec,
                  annotated,
                })}
                locale={locale === "ru" ? "ru" : "en"}
                classColorOverrides={classColorOverrides}
                applyStatus={finetuneApplyStatus}
                onBaseChange={(v) => {
                  const picked = catalogModels.find((m) => m.path === v || m.id === v);
                  if (
                    v &&
                    picked &&
                    annotationExampleIds !== null &&
                    !finetuneBaseSharesExamples(picked.calls, annotationExampleIds)
                  ) {
                    return;
                  }
                  finetuneAppliedKeyRef.current = null;
                  finetuneErrorRetriesRef.current = 0;
                  setFinetuneLock(null);
                  setFinetuneApplyStatus(v ? "loading" : "idle");
                  setDraft((d) => ({
                    ...d,
                    scenario: "finetune",
                    finetuneBaseModel: v,
                  }));
                }}
                onBrowseTable={() => void browsePath("recordingTableRel")}
                onTableChange={(value) =>
                  setDraft((d) => ({
                    ...d,
                    ...sanitizeWizardDataPaths(
                      {
                        recordingTableRel: value,
                        annotationsRel: d.annotationsRel,
                        equivalencesRel: d.equivalencesRel,
                      },
                      projectDir,
                    ),
                  }))
                }
              />
            ) : null}

            {draft.step === "data" && !inheritedLocked ? (
              <TrainWizardDataStep
                draft={draft}
                setDraft={setDraft}
                projectDir={projectDir ?? ""}
                totalRec={totalRec}
                annotated={annotated}
                skippedRec={skippedRec}
                selectedCalls={selectedCalls}
                disabledClasses={disabledClasses}
                synonymRuleCount={synonymRuleCount}
                synonymsByClass={synonymsByClass}
                classColorOverrides={classColorOverrides}
                colorsEditable={colorsEditable}
                colorPickerFor={colorPickerFor}
                setColorPickerFor={setColorPickerFor}
                setClassColor={setClassColor}
                commitClassSynonyms={commitClassSynonyms}
                browsePath={browsePath}
                onOpenSynonyms={() => setSynonymsOpen(true)}
              />
            ) : null}

            {draft.step === "spectro" ? (
              <TrainWizardSpectroStep
                draft={draft}
                setDraft={setDraft}
                inheritedLocked={inheritedLocked}
                locale={locale === "ru" ? "ru" : "en"}
                est={est}
              />
            ) : null}

            {draft.step === "model" ? (
              <TrainWizardModelStep
                draft={draft}
                setDraft={setDraft}
                inheritedLocked={inheritedLocked}
                projectId={projectId}
                trainEst={trainEst}
                computeDevice={computeDevice}
                capabilities={capabilities}
                onOpenSnippetCalc={() => setSnippetCalcOpen(true)}
              />
            ) : null}

            {draft.step === "preflight" ? (
              <TrainWizardLaunchPlan
                draft={draft}
                setDraft={setDraft}
                inheritedLocked={inheritedLocked}
                pipeline={pipeline}
                selectedCalls={selectedCalls}
                annotated={annotated}
                rareClass={rareClass}
                paramsOk={paramsOk}
                planFull={planFull}
                planEtaTotalMin={planEtaTotalMin}
                modelDirTaken={modelDirTaken}
                locale={locale === "ru" ? "ru" : "en"}
                onConfigureHps={() => setHpsOpen(true)}
              />
            ) : null}
          </section>
        </div>

        <TrainWizardFooter
          draft={draft}
          inheritedLocked={inheritedLocked}
          idx={idx}
          planFullLength={planFull.length}
          launchBlockedReason={launchBlockedReason}
          nextBlockedReason={nextBlockedReason}
          canLaunch={canLaunch}
          busy={busy}
          canNext={canNext()}
          cmdPreview={cmdPreview}
          cliCopied={cliCopied}
          onCopyCli={() => void onCopyCli()}
          onClose={() => onClose()}
          go={go}
          onSaveDraft={() => void saveDraftParams()}
          onOpenParamsJson={() => setParamsJsonOpen(true)}
          onLaunch={(prepOnly) => void launch(prepOnly)}
          onNext={() => {
            if (draft.step === "data") {
              void (async () => {
                try {
                  await persistEquivalences();
                  go(WIZARD_STEP_IDS[idx + 1]!);
                } catch (err) {
                  const msg = wizardErrorMessage(err, t);
                  if (msg) setError(msg);
                }
              })();
              return;
            }
            go(WIZARD_STEP_IDS[idx + 1]!);
          }}
        />
      </div>
      <TrainWizardSynonymsModal
        open={synonymsOpen}
        classes={draft.classes}
        equivalencesMap={draft.equivalencesMap}
        classColorOverrides={classColorOverrides}
        fileRel={draft.equivalencesRel}
        onClose={() => setSynonymsOpen(false)}
        onSave={(map) => {
          void (async () => {
            try {
              await persistEquivalences(map);
              setSynonymsOpen(false);
              notifySaved(t("wizard.synonymsSaved"));
            } catch (err) {
              const msg = wizardErrorMessage(err, t);
              if (msg) setError(msg);
            }
          })();
        }}
      />
      <TrainWizardHpsModal
        open={hpsOpen}
        hps={draft.hps}
        fileRel={hpsFileNameForModel(draft.model.name)}
        onClose={() => setHpsOpen(false)}
        onSave={(next) => {
          setDraft((d) => ({ ...d, hps: next, includeHpsearch: true }));
          setNotice(t("wizard.hpsSaved"));
        }}
      />
      <TrainWizardSnippetCalcModal
        open={snippetCalcOpen}
        projectId={projectId}
        draft={draft}
        onClose={() => setSnippetCalcOpen(false)}
        onApply={(batches) => {
          setDraft((d) => ({
            ...d,
            model: {
              ...d.model,
              n_batch_train: batches.train,
              n_batch_val: batches.val,
              n_batch_test: batches.test,
            },
          }));
          setNotice(t("wizard.calcApplied"));
        }}
      />
      <TrainWizardParamsJsonModal
        open={paramsJsonOpen}
        draft={draft}
        fileRel={
          pipeline?.parameter_filename?.trim() || "orcai_parameter.json"
        }
        busy={busy}
        onClose={() => setParamsJsonOpen(false)}
        onSave={saveParamsJsonToDisk}
        onReveal={revealParamsJson}
      />
    </div>
  );
}
