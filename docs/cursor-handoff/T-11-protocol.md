# Т-11 · Протокол приёмки — Модели (ЭК-15)

**Сборка / исходник:** рабочая копия `orcai-desktop` (baseline **v0.1.19** + ЭК-15).  
**Штамп `.app`:** `/tmp/orcAI-Desktop_0.1.19_aarch64.app` (mtime **2026-09-24 13:54**, AUTONOMY GATE PASSED).  
**Промпт:** П-11 · `docs/cursor-handoff/промты.md`  
**Макет:** `m15-models.png` / `m15-models-from-code.png`  
**Требования:** FR-9.1 – FR-9.8 · UC-23, UC-24  

QA: **Senior QA** · code gate 2026-09-24 · **UI sign-off Pass 2026-09-24** (живой прогон).

## Итог

| Слой | Статус |
|------|--------|
| Code gate (текущий tree) | ☑ **Pass** (2026-09-24) |
| Штамп + AUTONOMY GATE | ☑ **Pass** (13:54) |
| UI / макет m15 | ☑ **Pass** (UI sign-off) |
| Живой прогон Т-11 | ☑ **Pass** (UI sign-off) |
| **ЭК-15 / Т-11 overall** | ☑ **Pass** (2026-09-24) |

---

## Code gate

| Проверка | Статус |
|----------|--------|
| `ek15ModelsGate.test.ts` | ☑ 9/9 |
| `tsc --noEmit` (`apps/ui`) | ☑ |
| Sidecar `test_model_studio` (stamp Python) | ☑ 6/6 |

```bash
cd apps/ui && npx vitest run --configLoader native --config vitest.config.mjs src/lib/ek15ModelsGate.test.ts
cd apps/ui && npx tsc --noEmit -p tsconfig.json
PYTHONPATH=apps/sidecar/src \
  "/tmp/orcAI-Desktop_0.1.19_aarch64.app/Contents/Resources/python/venv/bin/python3.11" \
  -m unittest discover -s apps/sidecar/tests -p 'test_model_studio.py'
bash scripts/verify-app-python.sh /tmp/orcAI-Desktop_0.1.19_aarch64.app
```

---

## Блок A · П-11

| ID | Критерий | Pass | Заметки |
|----|----------|------|---------|
| A-01 | Единый список builtin + trained (дата, val_MBA, размер, классы) | ☑ | |
| A-02 | nor описан как дообучение isl (30 эпох) | ☑ | i18n RU/EN |
| A-03 | Карточка: файлы, тест MBA/PR/RE (KPI), F1 по классам (бар); без спектрограммы/shape в UI (макет m15) | ☑ | данные shape/spectro в API остаются |
| A-04 | Использовать → compat check → predict settings | ☑ | блок при mismatch; предупреждение без parameter |
| A-05 | Дообучить | ☑ | **disabled** + `finetuneSoon` до ЭК-16 (принятое отклонение) |
| A-06 | Тест → preflight TVT/parameter → job `test` → `/jobs`; Открыть папку (только trained); Импорт | ☑ | parameter = folder/glob |
| A-07 | Не удалять/править builtin | ☑ | нет UI удаления |
| A-08 | Экспорт trained → копия каталога (не builtin) | ☑ | |

---

## Блок D · Живой прогон

1. [x] Таблица: isl / nor + trained; nor — 30 эпох.  
2. [x] Карточка: файлы + KPI + F1-бары; без спектрограммы/shape.  
3. [x] «Дообучить» disabled + tooltip ЭК-16.  
4. [x] Использовать: compat / предупреждение.  
5. [x] Импорт / Экспорт.  
6. [x] Тест: preflight TVT + job в «Задачи».  

**Scope:** finetune wizard — ЭК-16 (R-04).

---

## Рекомендация

**Pass** — ЭК-15 / Т-11 закрыт (2026-09-24). Следующий этап: **ЭК-16** · Дообучение · П-9 → Т-9 · m13.
