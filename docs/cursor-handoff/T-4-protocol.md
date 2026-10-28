# Т-4 · Протокол приёмки — Распознавание · Анализ (ЭК-7)

**Сборка:** `/tmp/orcAI-Desktop_0.1.13_aarch64.app`  
**Промпт:** П-4 · `docs/cursor-handoff/промты.md`  
**Макет:** `mockups/m04-predict-studio.png`  
**Вкладка в UI:** «Анализ» (внутренний id `results`; отдельный раздел сайдбара «Результаты» не путать)

## Code gate

| Проверка | Статус |
|----------|--------|
| `apps/ui/src/lib/ek7PredictResultsGate.test.ts` | ☑ |
| `SpectrogramViewer.test.tsx` (`display_kind=orcai`, `colormap=gray`) | ☑ |
| `SpectrogramOverlay.test.tsx` (скрытие класса убирает оверлей) | ☑ |
| `labelColors.test.ts` (Paul Tol / коды / типы) | ☑ |
| `spectrogramDetections.test.ts` (выбор строки ↔ интервал) | ☑ |
| `layoutScaleGate.test.ts` (cqh, не vh) | ☑ |
| `p15PortabilityGate.test.ts` (ЭК-2) | ☑ |
| sidecar `test_spectrogram_render.py` (16 кГц, quantiles, `orcai`) | ☑ |
| `tsc --noEmit` (apps/ui) | ☑ |

```bash
cd apps/ui && npm run test -- \
  src/lib/ek7PredictResultsGate.test.ts \
  src/components/SpectrogramViewer.test.tsx \
  src/components/SpectrogramOverlay.test.tsx \
  src/lib/labelColors.test.ts \
  src/lib/spectrogramDetections.test.ts \
  src/lib/layoutScaleGate.test.ts \
  src/lib/p15PortabilityGate.test.ts
```

## UI sign-off (пользователь)

**Итог:** **Pass** · 2026-09-16 · ручная проверка на `/tmp/orcAI-Desktop_0.1.13_aarch64.app`  
Баги синхронизации таблица ↔ спектрограмма не заявлены.

| ID | Критерий | Pass |
|----|----------|------|
| A-01 | Спектрограмма серая, полоса 0–16 кГц; цвет только у оверлеев | ☑ |
| A-02 | Нет переключателя цветовой шкалы на вкладке Анализ | ☑ |
| B-01 | Клик по строке таблицы выделяет сегмент на спектрограмме и прокручивает к нему | ☑ |
| B-02 | Клик по оверлею выделяет ту же строку в таблице | ☑ |
| C-01 | Легенда «Классы»: коды WHISTLE…, счётчики, чекбокс; пустые классы приглушены | ☑ |
| C-02 | Скрытие класса убирает его оверлеи; счётчик совпадает с видимыми строками сегмента/файла | ☑ |
| C-03 | Колонка «Тип» — расшифровка (whistles, buzzing, …) теми же цветами, что и легенда | ☑ |
| D-01 | Свёрнутая консоль: студия читаема, таблица 3–8 строк, спектрограмма не съезжает | ☑ |
| D-02 | Развёрнутая консоль: студия остаётся рабочей (скролл таблицы / сжатие спектра) | ☑ |
| E-01 | Окно ~1920×1080: оси времени/частоты читаемы | ☑ |
| E-02 | Full Screen: спектрограмма масштабируется, chrome не ломает layout | ☑ |
