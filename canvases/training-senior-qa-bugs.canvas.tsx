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

type Sev = "Blocker" | "Major" | "Minor" | "Cosmetic";

const DEFECTS: {
  id: string;
  sev: Sev;
  area: string;
  title: string;
  evidence: string;
  expected: string;
  actual: string;
  risk: string;
  verify: string;
}[] = [
  {
    id: "TRN-01",
    sev: "Major",
    area: "Pipeline · Sidecar",
    title: "Шаг hpsearch на доске игнорирует HPS-файл мастера",
    evidence:
      "Wizard plan.ts передаёт hps_parameter; train_pipeline.params_for(hpsearch) — только data_dir/output_dir",
    expected:
      "Повторный hpsearch с доски использует {model}_hps_parameter.json (или явный выбор)",
    actual: "Всегда default_hps_parameter.json orcAI — кастомная сетка теряется молча",
    risk: "Не ломать wizard-план, где hps_parameter уже есть; не требовать файл, если его нет",
    verify:
      "Opt-in HPS → job с -hp; затем Run hpsearch на доске → тот же путь в params",
  },
  {
    id: "TRN-02",
    sev: "Major",
    area: "Wizard · Pipeline",
    title: "Deep-link мастера обходит блокировку активного плана",
    evidence:
      "Кнопка «Мастер» disabled при wizardPlanActive; /pipeline?view=wizard всё равно монтирует TrainWizard; Models «Дообучить» без проверки",
    expected: "Второй запуск мастера/плана запрещён, пока plan_id в pending/running",
    actual: "Можно поставить второй каскад — гонка по одному дереву проекта",
    risk: "Не блокировать просмотр доски; deep-link с Моделей при idle должен работать",
    verify:
      "Старт from_scratch → Models → Дообучить → launch отказ; после Cancel — OK",
  },
  {
    id: "TRN-03",
    sev: "Major",
    area: "Monitor",
    title: "Stop недоступен, пока train в очереди (pending)",
    evidence: "train_monitor.can_stop = status==running only; UI disabled на !can_stop",
    expected: "Stop отменяет pending и running train",
    actual: "Queued train только из Задач / баннера плана",
    risk: "Не включать Stop в idle/done; не отменять чужие plan-siblings без намерения",
    verify: "Train pending → Monitor Stop → cancelled; running train тоже Stop",
  },
  {
    id: "TRN-04",
    sev: "Major",
    area: "Wizard · Finetune",
    title: "Гонка: suggest имени до прихода catalogModels",
    evidence:
      "apply-base effect читает catalogModels=[]; fetchModels — отдельный effect; возможен *.keras overwrite чужого -ft",
    expected: "Имя -ft / -ftN учитывает уже занятые каталоги до Next/launch",
    actual: "Быстрый путь может предложить занятое *-ft (база сама защищена)",
    risk: "Не вернуть rewrite finetuneBaseModel→path (loop); не ломать легитимный -ftN",
    verify: "Есть orcai-isl-v1-ft → deep-link → suggested -ft2 до Next; taken → block",
  },
  {
    id: "TRN-05",
    sev: "Minor",
    area: "Pipeline",
    title: "Оптимистичный баннер плана: 0/0 и без Cancel",
    evidence: "optimisticPlan {queued:0,running:0,job_id:null}; Cancel только при job_id",
    expected: "Реальные счётчики ASAP или Cancel по plan_id",
    actual: "Кратко «0 · 0» без Cancel, доска уже locked",
    risk: "Не сбрасывать optimistic рано и не разблокировать Run поверх живого плана",
    verify: "Launch → за 1 busy-poll ненулевые счётчики + Cancel",
  },
  {
    id: "TRN-06",
    sev: "Minor",
    area: "Pipeline",
    title: "Fallback output_dir → spectrograms/, а не recording_data/",
    evidence: "API/wizard пишут recording_data; PipelinePage fallback join …/spectrograms",
    expected: "Fallback совпадает с primary tree",
    actual: "Редкий путь дробит артефакты",
    risk: "Не сломать проекты с legacy spectrograms/ (sidecar читает оба)",
    verify: "Force missing output_dir → запись в recording_data; snippet находит",
  },
  {
    id: "TRN-07",
    sev: "Cosmetic",
    area: "i18n",
    title: "Мёртвый models.finetuneSoon («будет в ЭК-16»)",
    evidence: "Ключ в ru/en; ModelsStudio намеренно без него (ek16FinetuneGate)",
    expected: "Удалить или не держать в product locales",
    actual: "Вводит переводчиков/поиск в заблуждение",
    risk: "Нулевой, если ключ нигде не рендерится",
    verify: "Grep — нет UI refs; ключи сняты",
  },
  {
    id: "TRN-08",
    sev: "Minor",
    area: "Wizard",
    title: "Частичный createJob оставляет orphan plan jobs",
    evidence: "launch() цикл createJob без транзакции; сбой mid-loop → onClose не вызывается",
    expected: "Rollback/cancel частичного plan_id или явный recovery",
    actual: "Сироты в очереди; пользователь на ошибке мастера",
    risk: "Не отменять чужие jobs; сохранить cascade по plan_id",
    verify: "Mock fail 4-го createJob → prior plan cancelled или Cancel на доске",
  },
];

const BY_DESIGN = [
  {
    item: "estimate_pipeline_disk_needed / 1.4× warn",
    why: "Анти-«нужно ~0»; покрыто test_train_pipeline",
  },
  {
    item: "Нет 3-го сценария hpsearch",
    why: "Opt-in + шаг конвейера; ek13 gate 1b/1c",
  },
  {
    item: "trainEstimate device CPU/GPU",
    why: "Предпочтение Settings + active_compute_device",
  },
  {
    item: "tabSubtitle без «Команда»",
    why: "Локали ««{{command}}» выполняется»",
  },
  {
    item: "Finetune card chain vs full prep plan",
    why: "Как m13; preflight chips = реальный план",
  },
  {
    item: "План всегда с test; toggle -tu/-uts",
    why: "ek13QaPlan + комментарий в planForDraft",
  },
  {
    item: "Early stop / ReduceLR счётчики",
    why: "Индикаторы patience, не отдельные режимы UI",
  },
];

function sevTone(s: Sev): "danger" | "warning" | "info" | "neutral" {
  if (s === "Blocker" || s === "Major") return "danger";
  if (s === "Minor") return "warning";
  return "neutral";
}

export default function TrainingSeniorQaBugs() {
  useHostTheme();
  const major = DEFECTS.filter((d) => d.sev === "Major").length;
  const minor = DEFECTS.filter((d) => d.sev === "Minor").length;
  const cos = DEFECTS.filter((d) => d.sev === "Cosmetic").length;

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 980 }}>
      <Stack gap={6}>
        <Text size="small" tone="secondary" weight="medium">
          orcAI Desktop · Обучение · Senior QA · 2026-09-24
        </Text>
        <H1>Баг-репорты · раздел «Обучение»</H1>
        <Text tone="secondary">
          Конвейер · мастер (с нуля / дообучение) · монитор · sidecar. Code review + сверка
          с gates. Живой UI sign-off штампа не входил в этот проход.
        </Text>
      </Stack>

      <Callout tone="success" title="Вердикт: Fixed (code) · 2026-09-24 evening">
        TRN-01…08 закрыты в коде. Регресс: sidecar train_pipeline/monitor 33 OK · UI gates
        ek12/13/15/16 + finetune 49 OK. Живой UI sign-off на штампе — отдельно.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value={String(DEFECTS.length)} label="Defects" tone="warning" />
        <Stat value={String(major)} label="Major" tone="danger" />
        <Stat value={String(minor)} label="Minor" tone="warning" />
        <Stat value={String(cos)} label="Cosmetic" tone="neutral" />
      </Grid>

      <Divider />

      <Stack gap={10}>
        <H2>Сводка дефектов</H2>
        <Table
          headers={["ID", "Sev", "Area", "Title"]}
          columnAlign={["center", "center", "left", "left"]}
          rows={DEFECTS.map((d) => [
            d.id,
            <Pill key={d.id} tone={sevTone(d.sev)} size="small" active={d.sev === "Major"}>
              {d.sev}
            </Pill>,
            d.area,
            d.title,
          ])}
        />
      </Stack>

      <Stack gap={12}>
        <H2>Детали баг-репортов</H2>
        {DEFECTS.map((d) => (
          <Card key={d.id}>
            <CardHeader
              trailing={
                <Pill tone={sevTone(d.sev)} size="small" active={d.sev === "Major"}>
                  {d.sev}
                </Pill>
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
                  <Text weight="medium">Risk if fixed carelessly: </Text>
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
        <H2>Не баги / by design</H2>
        <Table
          headers={["Item", "Why"]}
          rows={BY_DESIGN.map((r) => [r.item, r.why])}
        />
      </Stack>

      <Callout tone="info" title="Правило починки">
        Не чинить пачкой без регресса. После каждого Major: npm ui gate tests (ek12/ek13/ek16)
        + sidecar test_train_pipeline / test_train_monitor; ручной smoke — мастер с нуля без
        hpsearch, дообучение Next, Run train на доске.
      </Callout>
    </Stack>
  );
}
