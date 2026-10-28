# Т-8 · Протокол приёмки — Мастер обучения (ЭК-13)

**Сборка / исходник:** рабочая копия `orcai-desktop` (baseline **v0.1.18** + ЭК-13).  
**Штамп `.app`:** `/tmp/orcAI-Desktop_0.1.18_aarch64.app` (mtime **2026-09-22 16:00**, AUTONOMY GATE PASSED).  
**Промпт:** П-8 · `docs/cursor-handoff/промты.md`  
**Макеты:** `m08`…`m12` (+ from-code)  
**Требования:** FR-8.1 – FR-8.6, FR-8.9 – FR-8.11 · UC-16, UC-18, UC-22  

QA: **Senior QA** · первично 2026-09-21 · ретест кода 2026-09-22 · **UI sign-off Pass 2026-09-22**.

## Итог

| Слой | Статус |
|------|--------|
| Code gate (текущий tree) | ☑ **Pass** |
| UI / макеты m08–m12 (снимок по коду) | ☑ **Pass** с оговорками |
| Дефекты D-13-01…04 | ☑ **Closed** (код) |
| Product copy UC-*/NFR-* в UI | ☑ **Closed** |
| Кнопка «Обновить» в мастере | ☑ **Removed** |
| Opt-in `hpsearch` + Path coerce | ☑ **Pass** |
| Живой прогон Т-8 (мастер → очередь → train) | ☑ **Pass** (UI sign-off) |
| Штамп = tree для UI sign-off | ☑ **Pass** (16:00) |
| **ЭК-13 / Т-8 overall** | ☑ **Pass** (2026-09-22) |

---

## Code gate (2026-09-22)

| Проверка | Статус |
|----------|--------|
| `ek13TrainWizardGate.test.ts` | ☑ 6/6 |
| `ek13QaPlan.test.ts` | ☑ 13/13 |
| `ek12PipelineGate.test.ts` (регресс) | ☑ 7/7 |
| `classColors.test.ts` | ☑ 4/4 |
| `p15PortabilityGate.test.ts` (ЭК-2) | ☑ 4/4 |
| `projectsStudio.test.ts` (UC cleanup) | ☑ 20/20 |
| `tsc --noEmit` (`apps/ui`) | ☑ exit 0 |

```bash
cd apps/ui && npm run test -- --run \
  src/lib/ek13TrainWizardGate.test.ts \
  src/lib/ek13QaPlan.test.ts \
  src/lib/ek12PipelineGate.test.ts \
  src/lib/classColors.test.ts \
  src/lib/p15PortabilityGate.test.ts \
  src/lib/projectsStudio.test.ts
cd apps/ui && npx tsc --noEmit -p tsconfig.json
```

---

## Блок A · П-8 / FR-8 / Т-8

| ID | Критерий | Pass | Заметки |
|----|----------|------|---------|
| A-01 | 5 шагов мастера; сценарий «с нуля» | ☑ | `WIZARD_STEP_IDS` |
| A-02 | План с нуля = 7 команд без `hpsearch` (default) | ☑ | gate + `ek13QaPlan` |
| A-02b | Opt-in `includeHpsearch` → … → tvt → **hpsearch** → train → test | ☑ | согласовано с П-7 note / FR-8.1; не сценарий hpsearch (П-9) |
| A-03 | «Только подготовка» = 5 команд, **без** train/test/hpsearch | ☑ | |
| A-04 | Полный запуск пишет `*_orcai_parameter.json` + jobs по порядку | ☑ | UI sign-off |
| A-05 | Параметры только из orcAI (`draftToParameterJson`) | ☑ | |
| A-06 | Предполёт: блок при нет классов / disk `off` / нет engine | ☑ | `canLaunch` + reason |
| A-07 | Finetune card; hpsearch **не** 3-й сценарий (opt-in + pipeline step) | ☑ | см. решение 2026-09-24 |
| A-08 | Пресет публикации orcai-v1 | ☑ | |
| A-09 | Полный прогон / обучение на stamp | ☑ | UI sign-off 2026-09-22 |

---

## Блок B · Макеты / Lab UI

| ID | Экран | Pass | Заметки |
|----|-------|------|---------|
| B-01…B-05 | m08–m12 | ☑ | focus-cards / пути / spectro / model / preflight |
| B-06 | Footer по шагам | ☑ | |
| B-07 | i18n `wizard.*` RU/EN | ☑ | без UC/NFR/ЭК в product copy |
| B-08 | Справка `train.wizard` | ☑ | |
| B-09 | Layout-scale | ☑ | без `vh` у героя |
| B-10 | Нет «Обновить» в шапке мастера | ☑ | на конвейере — остаётся |

### Согласованные отклонения

1. Версия окна **v0.1.18**, не v0.2.0 макетов.  
2. Тоггл «Тест после обучения» = `-tu` / `-uts`; шаг `test` в полном плане всегда.  
3. Счётчик «метки вне calls» — текст в hint синонимов; отдельного KPI отброшенных меток при снятии класса нет (**minor**, не блокер).  
4. На шаге **train** % в свёрнутой консоли — по эпохам (orcAI `TqdmCallback` verbose=0); до конца 1-й эпохи может не быть числа — **ожидаемо**.

---

## Блок C · Дефекты

| ID | Severity | Описание | Статус |
|----|----------|----------|--------|
| D-13-01 | Major | Нет пресета публикации | ☑ Fixed |
| D-13-02 | Major | Launch без блокировок | ☑ Fixed |
| D-13-03 | Minor | Имя модели без FS-check | ☑ Fixed |
| D-13-04 | Minor | m08 CLI без `test` | ☑ Fixed |
| D-13-05 | Blocker | Живой прогон prep / train | ☑ **Closed** (UI sign-off) |
| D-13-06 | Major (sign-off) | Штамп отстаёт от tree | ☑ **Closed** (stamp 16:00) |
| D-13-07 | Minor | Нет явного счётчика отброшенных меток вне выбранных calls | ☐ Open (косметика / не блокер) |

### До закрытия этапа (в штампе 16:00)

- Каскадная отмена pending siblings по `plan_id`  
- Запрет idle sleep (`caffeinate` / Windows ES) на train/prep  
- Ранний `running` до TF-init (статус «Выполняется» на коротких шагах)  
- Без баннера «синонимы сохранены в call_equivalences.json»

---

## Блок D · Чеклист живого прогона

Окружение: штамп **2026-09-22 16:00** · UI sign-off **Pass**.

1. [x] Обучение → Мастер; «с нуля» → Далее.  
2. [x] Шаг 2–5 / запуск плана на stamp.  
3. [x] Очередь Jobs + статусы на конвейере.  
4. [x] Train: % в свёрнутой консоли — по эпохам (согласовано).  

---

## Рекомендация

**Т-8 Pass.** ЭК-13 закрыт. Следующий этап: **ЭК-14** · Монитор обучения (П-10 → Т-10 · m14).
