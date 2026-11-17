# Главная · порядок шагов плана обучения

Инструкция для Cursor на Windows. Перенести исправление порядка шагов на рейке плана обучения на **Главной**, как на macOS после правки к orcAI Desktop **1.0.4**. Версию Windows-ветки не менять. Скрипты сборки macOS не копировать.

Краткая запись в журнале: `docs/WINDOWS-CHANGES-AFTER-1.0.3.md` §85.

Синхронизация локали монитора — отдельно: `docs/WINDOWS-TRAIN-MONITOR-LOCALE.md` (§84).

Этот файл не входит в справку приложения. Каталог `docs/manual/` не трогать.

## Проблема

Пока мастер обучения ставит план в очередь, на Главной в карточке проекта показывается рейка шагов (`HomeWizardPlanRail`).

Список `active_plan.commands` sidecar собирал, обходя jobs в порядке **`updated_at DESC`** (как `list_jobs_db`). В рейке шаги шли «с конца» (часто `test` → `train` → … → `create-spectrograms`), а не как на доске конвейера.

## Не делать

- Не менять версию Desktop и не копировать скрипты сборки macOS.
- Не менять канонический порядок `TRAIN_STEP_IDS` / `TRAIN_PIPELINE_STEP_IDS` / `FROM_SCRATCH_COMMANDS`.
- Не сортировать по алфавиту и не опираться на порядок вставки в SQLite.
- Не убирать `hpsearch` из плана, если он был в `commands` / `includes_hpsearch`.
- Не переписывать UI рейки (`HomeWizardPlanRail`) ради порядка — порядок задаётся данными.

## Поведение после фикса

Рейка на Главной (и поле `active_plan.commands` в API) всегда в порядке доски:

`create-spectrograms` → `create-label-arrays` → `create-snippet-table` → `create-tvt-snippet-tables` → `create-tvt-data` → [`hpsearch`] → `train` → `test`

Опциональный `hpsearch` только если он есть в плане. Статусы по-прежнему с `board.steps`.

## Файлы

| Файл | Действие |
|---|---|
| `apps/sidecar/src/orcai_desktop_sidecar/pipeline_jobs.py` | в `_active_wizard_plan`: собрать `seen`, затем `commands = [id for id in TRAIN_STEP_IDS if id in seen]` |
| `apps/sidecar/tests/test_train_pipeline.py` | тест `test_active_plan_commands_follow_pipeline_order_not_job_recency` |
| `apps/ui/src/lib/homeWizardPlan.ts` | в `resolvePlanCommandIds`: фильтровать через `TRAIN_PIPELINE_STEP_IDS`, не сохранять discovery-order |
| `apps/ui/src/lib/homeWizardPlan.test.ts` | кейс «reorders commands into pipeline board order» |

## Как переносить

Windows-ветка может разойтись с macOS. Не делать слепой `git checkout` всего дерева.

### 1. Sidecar — `_active_wizard_plan`

В `pipeline_jobs.py` заменить набор `commands` с `append` по обходу jobs на:

```python
    # Jobs arrive newest-first (updated_at DESC). Collect the set, then emit
    # board/Home order — not discovery order.
    seen: set[str] = set()
    for job in jobs:
        params = job.get("params") if isinstance(job.get("params"), dict) else {}
        if _plan_id_of_params(params) != plan_id:
            continue
        if not _job_belongs(params, project_dir):
            continue
        command = str(job.get("command") or "").strip()
        if not command or command not in TRAIN_STEP_IDS:
            continue
        seen.add(command)
    commands = [step_id for step_id in TRAIN_STEP_IDS if step_id in seen]
```

`TRAIN_STEP_IDS` уже импортируется в этом модуле. Поля ответа (`plan_id`, `queued`, `running`, `job_id`, `includes_hpsearch`) не менять.

### 2. UI — `resolvePlanCommandIds`

В `apps/ui/src/lib/homeWizardPlan.ts`:

```ts
function resolvePlanCommandIds(plan: PipelineActivePlan): string[] {
  if (Array.isArray(plan.commands) && plan.commands.length > 0) {
    const allowed = new Set<string>(TRAIN_PIPELINE_STEP_IDS);
    const seen = new Set<string>();
    for (const raw of plan.commands) {
      const id = String(raw ?? "").trim();
      if (!id || !allowed.has(id)) continue;
      seen.add(id);
    }
    // Always board order — sidecar may list jobs newest-first.
    return TRAIN_PIPELINE_STEP_IDS.filter((id) => seen.has(id));
  }
  return TRAIN_PIPELINE_STEP_IDS.filter((id) => {
    if (id === "hpsearch") return Boolean(plan.includes_hpsearch);
    return true;
  });
}
```

Оба слоя нужны: sidecar чинит API; UI защищает рейку от старого бэкенда.

### 3. Тесты

Перенести ассерты из macOS:

- `test_active_plan_commands_follow_pipeline_order_not_job_recency` — jobs в DESC-порядке → `commands` в порядке пайплайна.
- UI: `homeWizardPlan.test.ts` — входной `commands` в обратном порядке → `view.steps` в порядке доски.

Проверка:

```bash
cd apps/ui && npx vitest run src/lib/homeWizardPlan.test.ts

cd apps/sidecar
set PYTHONPATH=src
# Windows: свой Python 3.11 с orcAI; не системный 3.13
python -m unittest tests.test_train_pipeline.TrainPipelineInspectTests.test_active_plan_commands_follow_pipeline_order_not_job_recency
```

На macOS QA: если unittest идёт через stamp-venv, workspace `src` должен быть **первым** в `PYTHONPATH`, иначе подтянется старый `site-packages/orcai_desktop_sidecar`.

## Автопрокрутка к running (§86)

Отдельная инструкция (хелпер, refs, тесты, QA): `docs/WINDOWS-HOME-WIZARD-PLAN-AUTOSCROLL.md`.

## QA вручную (Windows)

1. Запустить sidecar + движок, открыть проект с фокусом обучения.
2. Мастер → поставить полный план (без/с hpsearch).
3. На **Главной** рейка: сверху первые prep-шаги, внизу `train` / `test` (не наоборот).
4. Сверить с доской **Обучение** — тот же порядок id.
5. План с hpsearch: `hpsearch` между `create-tvt-data` и `train`.
6. Автопрокрутка к running — см. QA в `WINDOWS-HOME-WIZARD-PLAN-AUTOSCROLL.md`.
