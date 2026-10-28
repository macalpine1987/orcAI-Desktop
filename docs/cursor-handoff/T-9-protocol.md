# Т-9 · Протокол приёмки — Дообучение (ЭК-16)

**Сборка / исходник:** рабочая копия `orcai-desktop` (baseline **v0.1.20** + ЭК-16 / m13).  
**Промпт:** П-9 · `docs/cursor-handoff/промты.md`  
**Макет:** `m13-wizard-finetune.png` (эталон) · from-code `m13-wizard-finetune-from-code.html`  
**Требования:** FR-8.7, FR-8.8 · UC-21  

QA: **Senior QA** · code gate partial 2026-09-24 · **UI sign-off — pending** (переделка под настоящий m13).

## Итог

| Слой | Статус |
|------|--------|
| Code gate (`ek16FinetuneGate`) | ☑ **Pass** (обновлён под m13) |
| UI / живой прогон | ☐ Pending (после переделки m13) |
| **ЭК-16 / Т-9 overall** | ☐ **In progress** |

## Блок A · П-9 / m13 (code)

| ID | Критерий | Pass | Заметки |
|----|----------|------|---------|
| A-01 | Выбор базовой модели (builtin / trained) | ☑ | на шаге 2 · deep-link с Моделей → step `data` |
| A-02 | Locked-блок наследования (классы / spectro / snippet / arch) | ☑ | `FinetuneDataStep` · `tw-ft-inherit` |
| A-03 | Новые данные + таблица статусов классов (ok/few/none) | ☑ | m13 статусы |
| A-04 | Задаются заново: имя, epochs, LR, early stop | ☑ | шаг Model |
| A-05 | train с `--load_model` / `--load_model_from`; база не перезаписывается | ☑ | preview + `plan.ts` + `*-ft` / `*-ftN`; hard-block имя=база / каталог занят |
| A-06 | Нет 3-го сценария hpsearch; opt-in только в from_scratch; повтор — шаг конвейера | ☑ | |
| A-07 | INV-2 на launch: snippets с базы + `forceFinetuneLocks` / match | ☑ | fix 2026-09-24 Senior QA |

## Рекомендация

Живой прогон на штампе; сверка с `m13-wizard-finetune.png`. Code gate обновлён под INV-2.
