# Т-10 · Протокол приёмки — Монитор обучения (ЭК-14)

**Сборка / исходник:** рабочая копия `orcai-desktop` (baseline **v0.1.19** + ЭК-14).  
**Штамп `.app`:** `/tmp/orcAI-Desktop_0.1.19_aarch64.app` (mtime **2026-09-23 21:45**, AUTONOMY GATE PASSED).  
**Промпт:** П-10 · `docs/cursor-handoff/промты.md`  
**Макеты:** `m14-train-monitor.png` · from-code `m14-train-monitor-from-code.html`  
**Требования:** FR-8.12 – FR-8.14 · UC-19, UC-20  

QA: **Senior QA** · code gate 2026-09-24 · **UI sign-off Pass 2026-09-24** (живой прогон).

## Итог

| Слой | Статус |
|------|--------|
| Code gate (текущий tree) | ☑ **Pass** (2026-09-24) |
| UI / макет m14 (снимок по коду) | ☑ **Pass** |
| Живой прогон Т-10 (монитор → Stop → чекпоинт) | ☑ **Pass** (UI sign-off) |
| Штамп = tree для UI sign-off | ☑ Pass (21:45) |
| **ЭК-14 / Т-10 overall** | ☑ **Pass** (2026-09-24) |

---

## Code gate (2026-09-24)

| Проверка | Статус |
|----------|--------|
| `ek14TrainMonitorGate.test.ts` | ☑ 7/7 |
| `ek13TrainWizardGate.test.ts` (регресс) | ☑ 6/6 |
| `ek12PipelineGate.test.ts` (регресс) | ☑ 7/7 |
| `p15PortabilityGate.test.ts` (ЭК-2) | ☑ 4/4 |
| `tsc --noEmit` (`apps/ui`) | ☑ exit 0 |

```bash
cd apps/ui && npm run test -- --run \
  src/lib/ek14TrainMonitorGate.test.ts \
  src/lib/ek13TrainWizardGate.test.ts \
  src/lib/ek12PipelineGate.test.ts \
  src/lib/p15PortabilityGate.test.ts
cd apps/ui && npx tsc --noEmit -p tsconfig.json
```

---

## Блок A · П-10 / FR-8.12–14 / Т-10

| ID | Критерий | Pass | Заметки |
|----|----------|------|---------|
| A-01 | Монитор — модалка поверх конвейера; Close | ☑ | `PredictAppModalPortal` |
| A-02 | KPI: эпоха / метрика / loss / LR / прошло / осталось | ☑ | UI sign-off |
| A-03 | Прогресс эпохи по батчам | ☑ | |
| A-04 | График train + val по завершённым эпохам | ☑ | history + live JSON |
| A-05 | Панель: модель, чекпоинт, EarlyStopping, ReduceLR, ускоритель | ☑ | |
| A-06 | Stop → cancel; чекпоинт в папке модели | ☑ | UI sign-off |
| A-07 | «Открыть папку» → model_dir | ☑ | |
| A-08 | Консоль — сырой stdout train | ☑ | Lab dock |
| A-09 | Ускоритель согласован с TF в логе | ☑ | |
| A-10 | ETA на 1-й эпохе не ломается | ☑ | |
| A-11 | Повторный train сбрасывает live-сессию | ☑ | code |
| A-12 | Ошибки — `PipelineErrorAlert` RU/EN | ☑ | code |

---

## Блок B · Макет / Lab UI

| ID | Экран | Pass | Заметки |
|----|-------|------|---------|
| B-01 | m14 layout | ☑ | modal над конвейером |
| B-02 | Чистые линии графика (butt caps) | ☑ | |
| B-03 | WKWebView: blur на `::before`, не на overlay | ☑ | |
| B-04 | i18n `monitor.*` RU/EN | ☑ | |
| B-05 | Справка `train.monitor` | ☑ | |
| B-06 | Layout-scale | ☑ | |

### Согласованные отклонения

1. Версия окна **v0.1.19**, не v0.2.0 макетов.  
2. Монитор — **modal** над конвейером (не отдельный роут).  
3. Отметка «лучшей» эпохи — в подписи/легенде при flat val, не кольцом на canvas.

---

## Блок C · Дефекты

| ID | Severity | Описание | Статус |
|----|----------|----------|--------|
| — | — | Критических / блокеров на sign-off нет | — |

---

## Блок D · Чеклист живого прогона

Окружение: штамп **2026-09-23 21:45** · UI sign-off **Pass 2026-09-24**.

1. [x] Обучение → конвейер → Монитор.  
2. [x] Train запущен; KPI / батч / график.  
3. [x] Панель состояния + сырой лог.  
4. [x] Stop → валидный чекпоинт в `models/<name>/`.  
5. [x] Открыть папку.

---

## Рекомендация

**Т-10 Pass.** ЭК-14 закрыт. Следующий этап: **ЭК-15** · Модели (П-11 → Т-11 · m15).
