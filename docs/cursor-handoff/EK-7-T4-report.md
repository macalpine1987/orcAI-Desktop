# ЭК-7 / П-4 → Т-4 — отчёт (Распознавание · Анализ)

**Дата:** 2026-09-16  
**Этап:** ЭК-7 · **П-4 → Т-4**  
**Макет:** `m04-predict-studio.png`  
**Сборка:** `/tmp/orcAI-Desktop_0.1.13_aarch64.app` (версия не бампалась) · **AUTONOMY GATE PASSED** (прогон `build-macos-release.sh` 2026-09-16)

**Итог code gate:** **Pass** (2026-09-16)  
**Итог UI приёмки:** **Pass** (2026-09-16, пользователь, `T-4-protocol.md`)

---

## Сделано

Студия разбора на вкладке **Анализ** раздела «Распознавание» (внутренний tab id `results`).

1. **Транспорт:** play/pause, цикл, контраст меток, LCD позиции / длительности / канала, zoom, громкость (`SpectrogramAudioPlayer`, studio transport).
2. **Сегменты 200 с:** стрелки записи и сегмента у центральной линии; пресеты окна 200/60/20/5 с (`SpectrogramFileSegmentRail`).
3. **Спектрограмма:** `display_kind=orcai` → sidecar `make_spectrogram`; серая шкала; ось 0–16 кГц; квантили 0.01–0.999. Альтернативных режимов отрисовки на этой вкладке нет (`layout="scientific"` + `colormap=gray`, colormap UI скрыт).
4. **Классы (правая рейка):** цвет Paul Tol / orcAI, код WHISTLE…TAILSLAP, счётчик, чекбокс видимости; классы без детекций приглушены. Дополнительно (не в П-4): фильтр **Вероятности** 0–100 (вариант C) и блок **Отображение** (подписи mean_p / метки).
5. **Таблица «Обнаруженные сигналы»:** начало, конец, длительность, класс (код), тип (расшифровка), вероятность, файл. Клик по строке и клик по оверлею сходятся в `focusDetection` / `selectedSegment`.
6. **Масштаб Lab UI:** герои от контейнера (`cqh`), не `vh`; спектрограмма `min(32rem, 52cqh)`; таблица ~3–8 строк (`28cqh`). ТЗ: `TZ-layout-scale.md`.

---

## Тесты

| Набор | Файл | Результат |
|---|---|---|
| UI static gate П-4 | `apps/ui/src/lib/ek7PredictResultsGate.test.ts` | Pass (8) |
| Tiles orcai/gray | `SpectrogramViewer.test.tsx` | Pass |
| Скрытие класса | `SpectrogramOverlay.test.tsx` | Pass |
| Палитра / коды / типы | `labelColors.test.ts` | Pass |
| Выбор детекции | `spectrogramDetections.test.ts` | Pass |
| Ось 16 кГц | `spectrogramAxis.test.ts` | Pass |
| Layout cqh | `layoutScaleGate.test.ts` | Pass |
| ЭК-2 / П-15 | `p15PortabilityGate.test.ts` | Pass |
| Probability floor C | `spectrogramProbFloor.test.ts`, `PredictResultsClassSidebar.test.tsx` | Pass |
| Sidecar render | `apps/sidecar/tests/test_spectrogram_render.py` (bundled Python 3.11) | Pass (19) |
| `tsc --noEmit` | `apps/ui` | Pass |

ЭК-1: в этом закрытии Python sidecar не менялся. ЭК-2: `p15PortabilityGate` зелёный.

---

## Отклонения от макета / П-4

- Вкладка и крошка названы **Анализ** / **Analysis**, не «Результаты»: в приложении уже есть раздел «Результаты» (ЭК-9). Id вкладки остался `results`.
- Колонки **Частоты** в таблице нет: оверлеи — горизонтальные class-lane (Wiley MMS), не TF-боксы; `hz_min`/`hz_max` остаются в данных строки.
- Прокрутка при >7 классах — у всей правой колонки, не изолированно у списка классов.
- Фильтрация длительностей — отдельная вкладка «Фильтрация» (ЭК-8 / П-5), не внутри Анализа.
- На странице «Спектрограмма» по-прежнему есть inferno/viridis; на вкладке Анализ студии шкала только серая.

---

## Риски

- Список классов без собственного overflow: на узком окне с фильтром вероятностей могут уехать переключатели «Отображение».
- Синхронизация и Full Screen проверены вручную (Т-4 A–E, Pass).

---

## Следующее

- **ЭК-8 · Распознавание · Фильтрация** (П-5 → Т-5, `m05-predict-filter.png`).
