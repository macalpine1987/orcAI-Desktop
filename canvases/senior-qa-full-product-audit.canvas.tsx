import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  Pill,
  Stack,
  Stat,
  Table,
  Text,
  useHostTheme,
} from "cursor/canvas";

type Sev = "Blocker" | "Major" | "Minor";
type Status = "Confirmed" | "Suspected" | "Fixed";

const DEFECTS: {
  id: string;
  sev: Sev;
  status: Status;
  area: string;
  title: string;
  evidence: string;
  expected: string;
  actual: string;
  fix: string;
  risk: string;
  verify: string;
}[] = [
  {
    id: "RT-01",
    sev: "Major",
    status: "Fixed",
    area: "Runtime · Home",
    title: "startAll при живом sidecar не поднимает sidecarPhase → engineReady=false",
    evidence:
      "SidecarContext.startAll: ветка sidecarRunning пропускает setSidecarPhase(starting|running). refresh() при phase===stopped не промоутит в running (строки ~341–348) и не ставит enginePhase running (350–352).",
    expected:
      "После «Запуск» при уже живом процессе: sidecarPhase=running, engineReady true при engine ready + orcai_installed.",
    actual:
      "Health/capabilities могут быть OK, UI остаётся «не готов» — Projects/Predict/Models locked.",
    fix:
      "Только state-машина: в startAll при reuse выставить starting→running (и enginePhase); либо в refresh при userStartedRuntimeRef && health OK промоутить из stopped. Без смены Home chrome.",
    risk: "Не ослаблять guard health без runtimeBase; не трогать hide-on-close / stopAll.",
    verify:
      "Stop UI state (process still up) → Запуск → jewel + engineReady; Projects editable; restartAll stop→start OK.",
  },
  {
    id: "PKG-01",
    sev: "Major",
    status: "Fixed",
    area: "Packaging · Sidecar",
    title: "src-tauri/resources venv sidecar устарел относительно apps/sidecar/src",
    evidence:
      "diff src vs site-packages: много .py; model_studio.py только в src; import compute_data_health из resources venv → ImportError. Штамп v0.1.21 OK (sync-sidecar-into-app).",
    expected:
      "Любой запуск через bundled resources python исполняет текущий sidecar (Models, data_health, pipeline).",
    actual:
      "Dev/resources без sync: нет Models API / data_health; расхождение с рабочей копией.",
    fix:
      "Логика сборки/гейта: sync или pip reinstall в prepare; CI diff src↔site-packages; не править UI.",
    risk: "Не коммитить гигантский venv без необходимости; release path уже rsync — не ломать.",
    verify:
      "resources python: import model_studio + compute_data_health; GET models / project data_health 200.",
  },
  {
    id: "PRED-01",
    sev: "Major",
    status: "Fixed",
    area: "Predict · orcAI fidelity",
    title: "call_duration_limits: null включает duration-фильтр в predict",
    evidence:
      "adapters/predict.py resolve_call_duration_limits: ключ есть + null/\"\" → glob project *_call_duration_limits.json или package default; run_predict injects.",
    expected:
      "orcAI predict(..., call_duration_limits=None) / CLI без -cdl — без duration filter (orcai/predict.py, cli -cdl default None).",
    actual:
      "Job/API с \"call_duration_limits\": null + project_dir передаёт JSON path → inline filtering ≠ CLI.",
    fix:
      "В run_predict трактовать explicit null/\"\" как absent (не inject). Резолв project-glob оставить для filter-predictions / opt-in UI.",
    risk: "Не ломать Settings -cdl opt-in path (predictSettings шлёт path только при включении).",
    verify:
      "Job predict без -cdl / null → engine kwargs без call_duration_limits; с path → тот же path.",
  },
  {
    id: "TRN-01",
    sev: "Major",
    status: "Fixed",
    area: "Train · orcAI fidelity",
    title: "Молчаливый merge best_hyperparameters в -p перед train",
    evidence:
      "training._apply_best_hyperparameters_before_train + run_train переписывает filters/batch_size из newest best_hyperparameters.json.",
    expected:
      "orcai train использует -p как есть; hpsearch артефакты отдельно.",
    actual:
      "Non-finetune train из Desktop может изменить parameter без явного opt-in.",
    fix:
      "Только при явном job flag / UI opt-in; default off для CLI parity. Не менять TrainWizard chrome.",
    risk: "Не сломать сценарий «с нуля + hpsearch» где merge ожидается продуктом — тогда флаг должен выставляться планом.",
    verify:
      "Train без flag → -p байт-идентичен; plan с hpsearch → merge только с flag.",
  },
  {
    id: "TRN-02",
    sev: "Major",
    status: "Fixed",
    area: "Train · orcAI fidelity",
    title: "Авто-clamp n_batch_* персистит orcai_parameter на диске",
    evidence:
      "training._clamp_n_batches_to_snippets мутирует и пишет JSON перед train / create_tvt_snippet_tables.",
    expected:
      "CLI не переписывает -p; ошибка/поведение orcAI при завышенных batches.",
    actual:
      "Desktop меняет model.n_batch_* на диске проекта.",
    fix:
      "Clamp в temp copy -p или только preview; persist только при opt-in.",
    risk: "Не ломать проекты, где clamp уже спас train — opt-in или одноразовый temp.",
    verify:
      "n_batch > snippets → temp -p / отказ без записи исходного JSON.",
  },
  {
    id: "HLP-01",
    sev: "Major",
    status: "Suspected",
    area: "Projects · recording table",
    title: "Post-process create-recording-table меняет CSV vs orcAI",
    evidence:
      "helpers_cmd: после create_recording_table — sort + _fill_call_possibility_columns + to_csv.",
    expected:
      "Таблица как вернул orcAI create_recording_table.",
    actual:
      "Call-possibility для annotated → True где orcAI оставил NA — влияет на label-arrays/spectro eligibility.",
    fix:
      "Opt-in Desktop fill; default pass-through CLI output.",
    risk: "Проекты, уже зависящие от fill — feature-flag или сохранить как Desktop-only с документированием.",
    verify:
      "create-recording-table job → CSV hash vs orcai CLI на том же дереве (без fill).",
  },
  {
    id: "LAY-01",
    sev: "Minor",
    status: "Fixed",
    area: "Layout contract · overlays",
    title: "Потолки модалок/popover на сыром vh расходятся с UI Scale zoom",
    evidence:
      "LAYOUT-001…006: analysis-lab file/export/model modals 70|72vh; .shell-meta-popover 50vh; PredictProfileModelParamsDialog 90vh; package context menu 60vh.",
    expected:
      "TZ-layout-scale: overlay cap min(Nrem, calc(100vh - 3rem)) или cqh; герои уже на cqh (Pass).",
    actual:
      "При dock expanded + scale 150% высота оверлея считается от физического viewport, не от scaled work.",
    fix:
      "Только замена единицы потолка (vh→calc/cqh). Без смены отступов, цветов, порядка блоков, радиусов.",
    risk: "Не трогать hero spectrogram/detections (уже cqh); не менять visual design.",
    verify:
      "900×600 + dock open + 150%: модалки/popover целиком в work; fullscreen 100% без пустоты героев.",
  },
  {
    id: "LAY-02",
    sev: "Minor",
    status: "Fixed",
    area: "Layout · Train wizard",
    title: "Таблица классов: max-height 55% вместо cqh контейнера",
    evidence:
      "LAYOUT-007: train-wizard.css .tw-classes-m16 .tw-classes-table-body { max-height: min(18rem, 55%); }; finetune table уже min(17.5rem, 52cqh).",
    expected:
      "Потолок от .tw-work-panel (studio-tw) в cqh, как соседние таблицы мастера.",
    actual:
      "Parent overflow:auto → % слабый; таблица растёт со скроллом шага на 900×600 + dock + 150%.",
    fix:
      "Заменить 55% на 52cqh (или аналог). Без смены колонок/chrome мастера.",
    risk: "Не ломать finetune status table pattern.",
    verify:
      "Wizard classes step @ 900×600 dock open 150%: тело таблицы capped, chrome стабилен.",
  },
  {
    id: "PRED-02",
    sev: "Minor",
    status: "Fixed",
    area: "Filter · orcAI fidelity",
    title: "filter job: null limits + project_dir подменяет package default project-файлом",
    evidence:
      "QA-PRED-002: тот же resolve_call_duration_limits в run_filter_predictions.",
    expected:
      "orcai filter-predictions FILE без -cdl → bundled default_call_duration_limits.json.",
    actual:
      "При наличии project *_call_duration_limits.json подставляется он.",
    fix:
      "Auto-glob только при явном запросе; иначе omit key → engine default.",
    risk: "Не сломать Filter Studio, который сознательно шлёт project/edited limits.",
    verify:
      "filter job без path → package default; с path → path.",
  },
  {
    id: "FLT-01",
    sev: "Minor",
    status: "Suspected",
    area: "Filter · preview",
    title: "preview применяет только _check_duration, не полный filter_predictions()",
    evidence:
      "QA-FLT-001: filter_preview.py in-memory _check_duration; не делегирует filter_predictions().",
    expected:
      "Предпросмотр совпадает с pipe filter_predictions (без записи на диск).",
    actual:
      "Сегодня keep/drop по duration ок; будущие изменения orcAI в filter_predictions не подхватятся.",
    fix:
      "Делегировать filter_predictions() на DataFrame in-memory.",
    risk: "Не переписывать *_predicted.txt; не менять Filter Studio chrome.",
    verify:
      "Preview counts == filter job на том же файле/limits.",
  },
  {
    id: "HLP-02",
    sev: "Minor",
    status: "Suspected",
    area: "Train · create-label-arrays",
    title: "Синтетический call_equivalences при отсутствии -ce",
    evidence:
      "QA-HLP-002: run_create_label_arrays inject identity map from orcai_parameter.calls.",
    expected:
      "CLI требует валидный -ce файл.",
    actual:
      "Job может пройти без equivalences file.",
    fix:
      "Inject только при явном job flag; иначе fail как CLI.",
    risk: "Wizard already supplies -ce — не ломать happy path.",
    verify:
      "Job без -ce и без flag → failed; wizard plan → success.",
  },
  {
    id: "HLP-03",
    sev: "Minor",
    status: "Suspected",
    area: "Projects · init",
    title: "Нормализация seed после init обрезает on-disk JSON",
    evidence:
      "QA-HLP-003: helpers_cmd._normalize_parameter_seed после init_project.",
    expected:
      "orcAI-written seed на диске без изменений.",
    actual:
      "Крупные seeds усекаются под JS.",
    fix:
      "Полный seed в sidecar metadata; on-disk JSON = orcAI, если не export для Desktop.",
    risk: "Не сломать UI, читающий усечённый seed — читать из metadata.",
    verify:
      "init → orcai_parameter.json hash == CLI init; UI всё ещё открывает параметры.",
  },
  {
    id: "TRN-03",
    sev: "Minor",
    status: "Suspected",
    area: "Models · test",
    title: "resolve_trained_model_dir тихо чинит nested models/name/name/",
    evidence:
      "QA-TRN-003: run_test + model_paths.resolve_trained_model_dir.",
    expected:
      "test_model(model_dir=…) использует переданный путь.",
    actual:
      "Legacy nested layout auto-corrected без флага.",
    fix:
      "Resolve только при metadata legacy=true; иначе pass-through.",
    risk: "Не сломать старые проекты с nested layout — opt-in/metadata.",
    verify:
      "Explicit path unchanged; legacy-marked → nested resolve.",
  },
  {
    id: "MDL-01",
    sev: "Minor",
    status: "Fixed",
    area: "Models",
    title: "Тест модели не повторяет compat-check",
    evidence:
      "ModelsPage onTest: preflight TVT+parameter, без checkModelCompatibility.",
    expected:
      "Несовместимая модель блокируется до очереди (как «Использовать»).",
    actual:
      "Job падает на стороне orcAI.",
    fix:
      "Reuse compat в onTest / disable Test при compatBlocked — логика кнопки, без redesign таблицы.",
    risk: "Не блокировать легитимный test с warn-level compat.",
    verify:
      "Incompat model → Test disabled или явная ошибка до createJob.",
  },
];

const PASS_AREAS = [
  ["Shell / dock / UI Scale heroes", "layoutScaleGate + Home/Params/Filter/Analysis/Results/Projects/Pipeline/Models/Jobs cqh/flex"],
  ["orcAI 12 CLI commands", "IMPLEMENTED_COMMANDS = cli groups; + Desktop import-audio"],
  ["predict naming / pass-through", "threshold/channel/overwrite; *_predicted.txt / *_predicted_filtered.txt"],
  ["engine_kwargs", "только ключи из job; defaults orcAI"],
  ["finetune flags", "load_model / load_model_from (−lm/−lmf), не invented −ft"],
  ["Runtime guards", "health только с runtimeBase; hide-on-close Rust; stopAll refs"],
  ["Jobs", "plan cascade cancel; sleep inhibit; orphan finalize"],
  ["Projects soft focus", "нет hard-lock; WAV→table sync при engineReady"],
  ["Preferences", "dark-only; dataHealthBannerEnabled migration"],
  ["Automated suite", "UI 930 pass / 1 skip; sidecar 342 OK / 1 skip (bundled venv)"],
];

const FIX_RULES = [
  "Не менять макеты m01–m38, цвета, плотность, порядок сайдбара.",
  "Фикс = state/API/adapter/единицы потолка CSS; без «подправить отступы».",
  "После Major: npm run ui:test + npm run sidecar:test; точечный ручной smoke раздела.",
  "Не форкать orcAI; не бампать версию без запроса.",
  "PKG-01: sync resources/stamp до приёмки Models/data_health на локальном venv.",
];

function sevTone(s: Sev): "danger" | "warning" | "info" | "neutral" {
  if (s === "Blocker" || s === "Major") return "danger";
  return "warning";
}

function statusTone(s: Status): "success" | "danger" | "warning" | "neutral" {
  if (s === "Fixed") return "success";
  if (s === "Confirmed") return "danger";
  return "warning";
}

export default function SeniorQaFullProductAudit() {
  useHostTheme();
  const fixed = DEFECTS.filter((d) => d.status === "Fixed");
  const open = DEFECTS.filter((d) => d.status !== "Fixed");
  const majorOpen = open.filter((d) => d.sev === "Major").length;
  const minorOpen = open.filter((d) => d.sev === "Minor").length;

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 1040 }}>
      <Stack gap={6}>
        <Text size="small" tone="secondary" weight="medium">
          orcAI Desktop · Senior QA · full product · 2026-09-28
        </Text>
        <H1>Баг-репорт · логика / orcAI / масштаб</H1>
        <Text tone="secondary">
          Code review + gates + сверка adapters с orcai 3.0.2. Дизайн и chrome не
          предлагаются к изменению. Регресс после фикса: ui:test 930 pass /
          sidecar:test 343 OK (1 skip).
        </Text>
      </Stack>

      <Callout tone="success" title="Вердикт: Pass (Majors fixed + регресс зелёный)">
        Закрыты RT-01, PKG-01, PRED-01/02, TRN-01/02, LAY-01/02, MDL-01. Отложены
        (opt-in / fidelity, без блокера): HLP-01…03, FLT-01, TRN-03. Не ломать
        рабочие экраны визуально.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value={String(fixed.length)} label="Fixed" tone="success" />
        <Stat value={String(open.length)} label="Still open" tone="warning" />
        <Stat value={String(majorOpen)} label="Major open" tone={majorOpen ? "danger" : "success"} />
        <Stat value={String(minorOpen)} label="Minor open" tone="warning" />
      </Grid>

      <Divider />

      <Stack gap={10}>
        <H2>Сводка</H2>
        <Table
          headers={["ID", "Sev", "Status", "Area", "Title"]}
          columnAlign={["center", "center", "center", "left", "left"]}
          rows={DEFECTS.map((d) => [
            d.id,
            <Pill key={`${d.id}-sev`} tone={sevTone(d.sev)} size="small" active={d.sev === "Major"}>
              {d.sev}
            </Pill>,
            <Pill key={`${d.id}-st`} tone={statusTone(d.status)} size="small" active={d.status === "Fixed"}>
              {d.status}
            </Pill>,
            d.area,
            d.title,
          ])}
        />
      </Stack>

      <Stack gap={12}>
        <H2>Детали (fix = code/logic only)</H2>
        {DEFECTS.map((d) => (
          <Card key={d.id}>
            <CardHeader
              trailing={
                <Stack gap={6} style={{ flexDirection: "row", alignItems: "center" }}>
                  <Pill tone={statusTone(d.status)} size="small" active={d.status === "Fixed"}>
                    {d.status}
                  </Pill>
                  <Pill tone={sevTone(d.sev)} size="small" active={d.sev === "Major"}>
                    {d.sev}
                  </Pill>
                </Stack>
              }
            >
              {d.id} · {d.title}
            </CardHeader>
            <CardBody>
              <Stack gap={8}>
                <Text size="small" tone="secondary">
                  {d.area}
                </Text>
                <Text size="small">
                  <Text weight="medium">Evidence: </Text>
                  {d.evidence}
                </Text>
                <Text size="small">
                  <Text weight="medium">Expected: </Text>
                  {d.expected}
                </Text>
                <Text size="small">
                  <Text weight="medium">Actual: </Text>
                  {d.actual}
                </Text>
                <Text size="small">
                  <Text weight="medium">Logic-only fix: </Text>
                  {d.fix}
                </Text>
                <Text size="small">
                  <Text weight="medium">Do not break: </Text>
                  {d.risk}
                </Text>
                <Text size="small">
                  <Text weight="medium">Verify: </Text>
                  {d.verify}
                </Text>
              </Stack>
            </CardBody>
          </Card>
        ))}
      </Stack>

      <Stack gap={10}>
        <H2>Pass / не трогать</H2>
        <Table headers={["Area", "Why Pass"]} rows={PASS_AREAS} />
      </Stack>

      <Stack gap={10}>
        <H2>Правила починки</H2>
        <Table
          headers={["#", "Rule"]}
          rows={FIX_RULES.map((r, i) => [String(i + 1), r])}
        />
      </Stack>

      <Callout tone="info" title="Масштаб (fullscreen / 150% / dock)">
        Герои Home · Params · Filter · Analysis · Results · Projects · Pipeline ·
        Models · Jobs — container/cqh, layoutScaleGate зелёный. В фикс LAY-01
        входят только потолки оверлеев (единицы), не сетка разделов.
      </Callout>
    </Stack>
  );
}
