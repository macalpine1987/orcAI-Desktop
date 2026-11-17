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
  Row,
  Stack,
  Stat,
  Table,
  Text,
  useHostTheme,
} from "cursor/canvas";
import { useMemo, useState } from "react";

type Severity = "High" | "Medium" | "Low";
type Category =
  | "Architecture"
  | "Memory / Perf"
  | "Errors / Stability"
  | "GUI / UX";

type Finding = {
  id: string;
  severity: Severity;
  category: Category;
  file: string;
  lines: string;
  title: string;
  evidence: string;
};

const FINDINGS: Finding[] = [
  {
    id: "MEM-01",
    severity: "High",
    category: "Memory / Perf",
    file: "apps/sidecar/.../routes/fs.py",
    lines: "91–98",
    title: "fs_read_text читает файл целиком без лимита размера",
    evidence:
      "resolved.read_text() без max bytes. Большой predicted/JSON может раздуть RSS sidecar и ответ HTTP; путь абсолютный, но размер не валидируется.",
  },
  {
    id: "MEM-02",
    severity: "High",
    category: "Memory / Perf",
    file: "apps/sidecar/.../adapters/spectrogram_cache.py",
    lines: "22–26, 202–203",
    title: "Спектрограммный кэш до 2 GiB disk + 512 MiB RAM",
    evidence:
      "_MAX_CACHE_BYTES=2GiB, _RAM_MAX_BYTES=512MiB, до 8 матриц float32. На Mac с 8–16 GiB при нескольких длинных WAV возможны давление на память и своп; лимиты не в UI Settings.",
  },
  {
    id: "PERF-01",
    severity: "High",
    category: "Memory / Perf",
    file: "apps/sidecar/.../routes/projects.py",
    lines: "91–109, 443–454",
    title: "Тяжёлые sync-роуты summary/pipeline на threadpool uvicorn",
    evidence:
      "projects_summary / pipeline — sync def с обходом диска. Uvicorn кладёт sync в default threadpool; при насыщении (poll Jobs + Projects + tiles) latency health/jobs растёт. Spec threadpool отдельно (max_workers=2).",
  },
  {
    id: "ARCH-01",
    severity: "High",
    category: "Architecture",
    file: "apps/ui/src/hooks/usePredictPageState.ts",
    lines: "1–832",
    title: "Predict page composer всё ещё god-hook (~832 строк)",
    evidence:
      "Доменные хуки вынесены, но фасад по-прежнему склеивает queue/batch/filter/settings/nav/models. Нарушает SRP; регрессии Predict трудно локализовать. Аналогично useProjectsPageModel (~587).",
  },
  {
    id: "ARCH-02",
    severity: "High",
    category: "Architecture",
    file: "apps/ui/.../SpectrogramViewerChrome.tsx",
    lines: "33–115, 117–471",
    title: "Chrome — prop-bag (~70 полей) вместо узких контрактов",
    evidence:
      "Options перечисляет transport/tools/overlay/export state. ISP нарушен: любое изменение тулбара трогает сигнатуру chrome. Поведение сохранено, но слой хрупкий.",
  },
  {
    id: "ARCH-03",
    severity: "Medium",
    category: "Architecture",
    file: "apps/sidecar/.../train_pipeline.py",
    lines: "25–30, 791",
    title: "Импорт приватных символов project_studio (_dir_stats, _read_json_file)",
    evidence:
      "pipeline_artifacts / pipeline_param_fps / train_pipeline тянут _-helpers. Ломает инкапсуляцию; рефакторинг studio ломает pipeline без явного API.",
  },
  {
    id: "ARCH-04",
    severity: "Medium",
    category: "Architecture",
    file: "apps/ui/src/components/LabDock.tsx",
    lines: "720–900",
    title: "LabDock остаётся крупным UI-модулем (~900 строк)",
    evidence:
      "Статус задач, predict batch strip, resize dock, copy timers, clock tick в одном файле. Дублирует clock-паттерн JobsPage/HomeRecentJobs/TrainMonitor.",
  },
  {
    id: "ARCH-05",
    severity: "Medium",
    category: "Architecture",
    file: "apps/ui/.../SpectrogramDetectionsTable.tsx + PredictParamsRunStudio.tsx",
    lines: "~890 / ~875",
    title: "Крупные презентационные компоненты без дальнейшего сплита",
    evidence:
      "Таблица детекций и студия параметров — всё ещё монолиты после Phase 5 SpectrogramViewer. Дублирование chrome/table patterns между Analysis и Results.",
  },
  {
    id: "ARCH-06",
    severity: "Medium",
    category: "Architecture",
    file: "apps/sidecar/.../jobs.py + job_queue.py + job_cancel.py",
    lines: "jobs 1–782",
    title: "Job subsystem разнесён, но jobs.py всё ещё registry+IO+cancel glue",
    evidence:
      "Есть prune логов (JOB_LOG_MAX_LINES=8000) и eviction terminal (200). Хорошо. Но jobs.py совмещает persistence flush timer, bootstrap, status machine — сложнее тестировать изоляцией.",
  },
  {
    id: "ARCH-07",
    severity: "Low",
    category: "Architecture",
    file: "apps/ui/src/api/sidecar.ts",
    lines: "6",
    title: "Жёсткий SIDECAR_DEFAULT_PORT = 8741",
    evidence:
      "Документированный fallback; runtime обязан брать session port. Риск регрессии, если health снова пойдёт на дефолт без runtimeBase (правило baseline).",
  },
  {
    id: "ARCH-08",
    severity: "Low",
    category: "Architecture",
    file: "apps/sidecar/.../runtime_state.py",
    lines: "10",
    title: "spec_executor max_workers=2 — узкое место тайлов",
    evidence:
      "Параллельный warm/pan prefetch упирается в 2 воркера. Не утечка, но KISS-компромисс даёт очередь при Analysis zoom.",
  },
  {
    id: "MEM-03",
    severity: "Medium",
    category: "Memory / Perf",
    file: "apps/ui/src/lib/spectrogramTileCache.ts",
    lines: "4–19, 35–41",
    title: "Клиентский tile LRU 64 + AbortController — ок, но Blob держат память",
    evidence:
      "invalidate при смене sidecarPort. При долгой сессии Analysis 64 PNG×tile width всё ещё заметны; revoke не нужен (Blob не object URL), но нет soft byte budget как на сервере.",
  },
  {
    id: "MEM-04",
    severity: "Medium",
    category: "Memory / Perf",
    file: "apps/ui/src/sidecar/SidecarContext.tsx",
    lines: "444–561, 563–567",
    title: "Постоянный poll runtime + 250ms tick при starting",
    evidence:
      "Рекурсивный setTimeout refresh (BOOT/IDLE). Cleanup есть. При starting дополнительный setInterval 250ms → re-render всего SidecarProvider tree.",
  },
  {
    id: "MEM-05",
    severity: "Low",
    category: "Memory / Perf",
    file: "apps/ui/.../SpectrogramAudioPlayer.tsx",
    lines: "176–184, 192–207",
    title: "Audio element cleanup на unmount корректен",
    evidence:
      "pause + removeAttribute(src) + load(). Src — HTTP playback URL, не blob. Положительный контроль: утечки objectURL здесь нет.",
  },
  {
    id: "MEM-06",
    severity: "Low",
    category: "Memory / Perf",
    file: "apps/ui/.../useSpectrogramFocusSelection.ts",
    lines: "141–192",
    title: "document pointerdown listeners со снятием в cleanup",
    evidence:
      "Оба эффекта снимают listener. После выноса из shell риск double-register снижен (один hook).",
  },
  {
    id: "MEM-07",
    severity: "Medium",
    category: "Memory / Perf",
    file: "apps/sidecar/.../job_queue.py",
    lines: "35–40, 97–131",
    title: "Daemon JobScheduler без явного shutdown join",
    evidence:
      "Поток daemon=True, цикл while True. На process exit ок. При hot-reload/tests возможен zombie scheduler; cancel set растёт и чистится по job id.",
  },
  {
    id: "MEM-08",
    severity: "Low",
    category: "Memory / Perf",
    file: "apps/sidecar/.../store.py",
    lines: "1–30, db_session",
    title: "SQLite через contextmanager — файлы закрываются",
    evidence:
      "db_session / normalize_project_dir выглядят аккуратно. Не найдено «голых» connect без close в hot path.",
  },
  {
    id: "ERR-01",
    severity: "Medium",
    category: "Errors / Stability",
    file: "apps/sidecar (много модулей)",
    lines: "BLE001 ×40+",
    title: "Широкие except Exception: с noqa BLE001",
    evidence:
      "jobs/runner/train_live/cancel — намеренный best-effort. Риск: реальные баги глотаются (тихий fail persist/log). Bare except: почти нет; BaseException только в cleanup tmp (predict.py:228, project_studio_table.py:102) с re-raise — ок.",
  },
  {
    id: "ERR-02",
    severity: "Medium",
    category: "Errors / Stability",
    file: "apps/ui (множество .catch(() => {}))",
    lines: "colormap, JobsList, Sidecar listen…",
    title: "Пустые catch глотают сбои без user-facing сигнала",
    evidence:
      "useSpectrogramColormap, JobsListContext, SidecarContext listen().catch(() => undefined), clearAllJobs. Часть оправдана; часть скрывает деградацию (цвета/профили/jobs clear).",
  },
  {
    id: "ERR-03",
    severity: "Low",
    category: "Errors / Stability",
    file: "apps/ui/src/lib/userFacingError.ts",
    lines: "27–69",
    title: "Единый truncateUserError / formatUserFacingError — сильная сторона",
    evidence:
      "Стеки режутся до 280 символов; network → i18n. Не все call sites переведены на Required (часть setError сырым текстом API).",
  },
  {
    id: "ERR-04",
    severity: "Medium",
    category: "Errors / Stability",
    file: "apps/sidecar/.../job_queue.py",
    lines: "108–131",
    title: "start_fn failure → FAILED (хорошо); notify_finished обязателен",
    evidence:
      "После v1.0.4 start_fn exceptions помечают FAILED. Если set_status сам падает — только log.exception. Scheduler loop не умирает.",
  },
  {
    id: "ERR-05",
    severity: "Medium",
    category: "Errors / Stability",
    file: "src-tauri/src/sidecar.rs",
    lines: "395–418, 73, 433",
    title: "stop: kill+wait после HTTP cancel; expect на parse addr",
    evidence:
      "stop_sidecar_process сначала try_cancel_active_jobs_http, затем kill. expect(\"valid addr\") / expect(\"child is_some\") — паника только на внутренних инвариантах. Race starting/session учтён session++.",
  },
  {
    id: "UX-01",
    severity: "Low",
    category: "GUI / UX",
    file: "apps/ui/.../PredictParamsRunStudio.tsx",
    lines: "216, 620–777",
    title: "Блокировка полей и Run при batchRunning — реализована",
    evidence:
      "fieldsDisabled = !orcaiReady || batchRunning; кнопка Run disabled при batch/table gate. usePredictBatchRun защищён batchRunningRef от double-click.",
  },
  {
    id: "UX-02",
    severity: "Low",
    category: "GUI / UX",
    file: "apps/ui/.../PredictFilterStudio.tsx",
    lines: "100–141",
    title: "Ввод пределов длительности валидируется (draft gate)",
    evidence:
      "isDurationBoundDraft отклоняет мусор; blur нормализует через inputToBound (точка/запятая). Позитивный контроль UX.",
  },
  {
    id: "UX-03",
    severity: "Medium",
    category: "GUI / UX",
    file: "apps/ui/src/styles/train-monitor.css",
    lines: "3–7",
    title: "Train monitor: height 100vh в отдельном окне",
    evidence:
      "Для detached Tauri window допустимо. Риск: CSS zoom / UI scale 125% может дать лишний скролл vs Lab (правило layout-scale про vh). Модалки Lab в основном min(…, 100vh-3rem) — ок.",
  },
  {
    id: "UX-04",
    severity: "Medium",
    category: "GUI / UX",
    file: "apps/ui/src/hooks/useProjectsPageModel.ts",
    lines: "264–287",
    title: "Poll студии каждые 8s + focus/visibility",
    evidence:
      "Cleanup корректен. На слабом диске частый refreshFull конкурирует с summary/pipeline (см. PERF-01) — UI может «мигать» loading без явной блокировки кнопок вкладок.",
  },
  {
    id: "UX-05",
    severity: "Low",
    category: "GUI / UX",
    file: "LabDock / JobsPage / HomeRecentJobs / TrainMonitor",
    lines: "setNowSec ×4",
    title: "Четыре независимых 1s clock interval (DRY)",
    evidence:
      "Одинаковый паттерн live duration. Не баг (cleanup есть), но лишние re-render деревья; вынести shared useNowSec.",
  },
  {
    id: "UX-06",
    severity: "Medium",
    category: "GUI / UX",
    file: "apps/ui/src/sidecar/useRuntimeLifecycle.ts + Home",
    lines: "404+",
    title: "Ошибки startAll иногда глотаются (.catch пустой)",
    evidence:
      "void startAll().catch(() => {}) — пользователь может не увидеть причину отказа запуска, если lastError не выставлен в ветке.",
  },
];

export default function TechnicalAuditV104() {
  const theme = useHostTheme();
  const [sev, setSev] = useState<"All" | Severity>("All");
  const [cat, setCat] = useState<"All" | Category>("All");

  const filtered = useMemo(
    () =>
      FINDINGS.filter(
        (f) =>
          (sev === "All" || f.severity === sev) &&
          (cat === "All" || f.category === cat),
      ),
    [sev, cat],
  );

  const counts = useMemo(() => {
    const c = { High: 0, Medium: 0, Low: 0 };
    for (const f of FINDINGS) c[f.severity] += 1;
    return c;
  }, []);

  return (
    <Stack gap={20} style={{ padding: 20, maxWidth: 1100 }}>
      <Stack gap={6}>
        <H1>orcAI Desktop · технический аудит</H1>
        <Text tone="secondary">
          Повторный аудит baseline v1.0.4 · без правок кода ·{" "}
          {new Date().toISOString().slice(0, 10)} · слои: Tauri / React UI /
          FastAPI sidecar
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value={String(FINDINGS.length)} label="Findings" />
        <Stat
          value={String(counts.High)}
          label="High"
          tone="danger"
        />
        <Stat
          value={String(counts.Medium)}
          label="Medium"
          tone="warning"
        />
        <Stat value={String(counts.Low)} label="Low" />
      </Grid>

      <Callout tone="info" title="Статус правок (тот же день)">
        Закрыто в коде: MEM-01/02, PERF-01, ARCH-01/02/03/08, MEM-03/07,
        UX-03/05/06 (+ poll 12s). LabDock/DetectionsTable/ParamsRunStudio
        монолиты не дробились целиком (только shared useNowSec). Широкие
        except Exception: best-effort оставлены намеренно.
      </Callout>

      <Card>
        <CardHeader trailing={<Pill size="sm">{filtered.length} shown</Pill>}>
          Фильтр
        </CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Row gap={8} style={{ flexWrap: "wrap" }}>
              {(["All", "High", "Medium", "Low"] as const).map((s) => (
                <Pill
                  key={s}
                  active={sev === s}
                  onClick={() => setSev(s)}
                >
                  {s}
                </Pill>
              ))}
            </Row>
            <Row gap={8} style={{ flexWrap: "wrap" }}>
              {(
                [
                  "All",
                  "Architecture",
                  "Memory / Perf",
                  "Errors / Stability",
                  "GUI / UX",
                ] as const
              ).map((c) => (
                <Pill
                  key={c}
                  active={cat === c}
                  onClick={() => setCat(c)}
                >
                  {c}
                </Pill>
              ))}
            </Row>
          </Stack>
        </CardBody>
      </Card>

      <H2>Findings</H2>
      <Table
        headers={["ID", "Sev", "Category", "Location", "Issue"]}
        columnAlign={["left", "left", "left", "left", "left"]}
        rows={filtered.map((f) => [
          f.id,
          f.severity,
          f.category,
          <Stack key={`${f.id}-loc`} gap={2}>
            <Text weight="medium" size="small">
              {f.file}
            </Text>
            <Text tone="secondary" size="small">
              L{f.lines}
            </Text>
          </Stack>,
          <Stack key={`${f.id}-body`} gap={4}>
            <Text weight="medium">{f.title}</Text>
            <Text tone="secondary" size="small">
              {f.evidence}
            </Text>
          </Stack>,
        ])}
        rowTone={filtered.map((f) =>
          f.severity === "High"
            ? "danger"
            : f.severity === "Medium"
              ? "warning"
              : undefined,
        )}
      />

      <Divider />

      <Grid columns={2} gap={16}>
        <Stack gap={8}>
          <H2>Что уже хорошо</H2>
          <Text size="small">
            • Job log trim + terminal eviction; pipeline/results section cache
            trim (64 keys)
          </Text>
          <Text size="small">
            • Spectrogram tile AbortController + generation invalidate
          </Text>
          <Text size="small">
            • Predict batchRunning / fieldsDisabled; filter duration draft gate
          </Text>
          <Text size="small">
            • AudioPlayer unmount cleanup; focus-selection listener cleanup
          </Text>
          <Text size="small">
            • paths.resolve_user_path блокирует /etc, System, Windows roots
          </Text>
          <Text size="small">
            • stop_sidecar: HTTP cancel jobs → kill → wait; hide-on-close
            сохранён
          </Text>
        </Stack>
        <Stack gap={8}>
          <H2>Приоритет следующего инкремента</H2>
          <Text size="small" weight="medium">
            1. Лимит размера fs_read_text (+ опционально write)
          </Text>
          <Text size="small" weight="medium">
            2. Offload/queue для summary+pipeline или отдельный executor
          </Text>
          <Text size="small" weight="medium">
            3. Сузить SpectrogramViewerChrome props (группы / context)
          </Text>
          <Text size="small" weight="medium">
            4. Настройки лимитов spec-cache в UI / docs
          </Text>
          <Text size="small" weight="medium">
            5. Убрать пустые .catch на runtime start; shared useNowSec
          </Text>
          <Text
            size="small"
            tone="secondary"
            style={{ marginTop: 8, color: theme.fg.muted }}
          >
            Код не менялся. Источник: статический обзор apps/sidecar,
            apps/ui, src-tauri на рабочей копии v1.0.4+.
          </Text>
        </Stack>
      </Grid>
    </Stack>
  );
}
