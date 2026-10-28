# Баг-репорт · Senior QA retest · 2026-09-28 (после Settings inset + QA-01…07)

**Роль:** Senior QA  
**Дата:** 2026-09-28 (второй проход)  
**Объект:** полный продукт; акцент — связка «Показывать спектрограмму» ↔ «Длинные записи», регресс фиксов QA-01…07  
**База:** working tree после inset-рамки в Настройках  
**Предыдущий отчёт:** `QA-2026-09-28-senior-bugreport.md`  
**Метод:** code review + unit/gate; живой `.app` — Pending  
**Ограничение фикса:** только код / логика; дизайн не менять

---

## Вердикт

| | |
|--|--|
| Рекомендация | **Conditional Pass** после фикса QA-09 (hydrate); нужен живой retest stamp |
| Регресс QA-01…07 | **Hold** в дереве (engine host start, SSE `started_at`, table-hero scroll/rail/footer/focus, Settings hint) |
| orcAI fidelity / layout heroes | Без новых дефектов; `vh` только у модалок |
| Новый дефект | QA-09 — **Fixed** в этом проходе |

Продукт остаётся верным orcAI 3.0.2. Недавняя рамка «Анализ · отображение» логически верна в UI; дыра была только на **холодном старте** при устаревшем диске.

---

## Регресс ранее закрытых пунктов

| ID | Тема | Статус в коде |
|----|------|----------------|
| QA-01 | Engine start CPU/GPU → `invokeSidecarEngineStart` | Hold |
| QA-02 | SSE `started_at` | Hold |
| QA-03 | table-hero internal scroll | Hold |
| QA-04 | `is-file-nav-only` rail | Hold |
| QA-05 | studio footer `footerFileShown` | Hold |
| QA-06 | Settings spectrogram hint | Hold |
| QA-07 | `focusDetection` early-return | Hold |

---

## Новые дефекты

### QA-09 · Medium — Hydrate: `largeWavOptimize` остаётся true при `showSpectrogram=false` на диске

**Шаги:**  
1. Включить «Длинные записи», выключить «Показывать спектрограмму» (до фикса связки — или руками в store: оба флага true/false).  
2. Перезапустить приложение.  

**Факт:** `readInterfaceDefaults` читал флаги независимо → `setLiveLargeWavOptimize(true)` при table-hero. UI-toggle казался выкл., но live-флаг для API спектрограммы мог остаться true; после повторного включения спектрограммы «Длинные записи» воскресали без клика.  

**Ожидание:** без спектрограммы optimize всегда off в state, live-флаге и на диске.  

**Где:** `preferences/storage.ts`, `PreferencesContext.tsx` (`readInterfaceDefaults`, init hydrate).  

**Фикс (code-only):**  
- `resolveLargeWavOptimize(stored)` = `resolveShowSpectrogram && largeWavOptimize === true`  
- coerce disk `largeWavOptimize: false` при async hydrate, если table-hero + stale true  

**Статус:** **Fixed** + unit (`showSpectrogram.test.ts`) + EK-10 gate.

---

## Что проверено и не трогать

| Область | Вердикт |
|---------|---------|
| Settings inset + disable toggle | ✓ UI + setter |
| filter-predictions / null `-cdl` / train `-lmf` | ✓ |
| Layout scale (Параметры эталон, Analysis, Jobs, dock cqh) | ✓ |
| Table-hero class modal без «Отображение» | ✓ |
| Двойной `analysis-spectrogram-studio-host` | Info only (QA-08) |

---

## Тесты, обновлённые в этом проходе

- `apps/ui/src/preferences/showSpectrogram.test.ts` — `resolveLargeWavOptimize`  
- `apps/ui/src/lib/ek10SettingsGate.test.ts` — `resolveLargeWavOptimize` в context  

---

## Чек-лист живого retest

1. [ ] Диск: `showSpectrogram=false`, `largeWavOptimize=true` → после старта toggle выкл., API без windowed STFT; повторный вкл. спектрограммы не включает «Длинные записи» сам.  
2. [ ] Settings: выкл. спектрограммы → «Длинные записи» гаснут и disabled; вкл. спектрограммы → можно снова включить optimize.  
3. [ ] Повтор QA-01…07 checklist из первого отчёта.  
4. [ ] Resize / fullscreen / UI Scale 125–150 на Параметрах, Анализе (оба режима), Задачах.
