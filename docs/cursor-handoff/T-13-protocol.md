# Т-13 · Протокол приёмки — Настройки · интеграция (ЭК-10)

**Сборка:** baseline **v0.1.17** · `/tmp/orcAI-Desktop_0.1.17_aarch64.app`  
**Промпт:** П-13 · `docs/cursor-handoff/промты.md`  
**Макеты:** `mockups/m17-settings.png`, `mockups/m31-settings-paths.png`  
**Снимок по коду:** `mockups/m17-settings-from-code.png`  
**Требования:** FR-11.2 – FR-11.5, FR-11.9  

Эталон baseline **v0.1.17** включает Настройки · интеграция (порт auto; `-v 2` для новых jobs; пути на вкладке «Среда выполнения»). UI sign-off: **Pass** 2026-09-18.

## Code gate

| Проверка | Статус |
|----------|--------|
| `apps/ui/src/lib/ek10SettingsGate.test.ts` | ☑ |
| `apps/ui/src/lib/integrationSettings.test.ts` | ☑ |
| `apps/ui/src/lib/p13aSettingsGate.test.ts` | ☑ |
| `apps/ui/src/lib/p15PortabilityGate.test.ts` (ЭК-2) | ☑ |
| `apps/ui/src/api/jobs.test.ts` | ☑ |
| `apps/ui/src/api/maintenance.test.ts` | ☑ |
| sidecar `tests/test_large_wav.py` | ☑ |
| sidecar `tests/test_maintenance.py` | ☑ |
| `tsc --noEmit` (`apps/ui`) | ☑ (повтор 2026-09-18) |

```bash
cd apps/ui && npm run test -- \
  src/lib/ek10SettingsGate.test.ts \
  src/lib/integrationSettings.test.ts \
  src/lib/p13aSettingsGate.test.ts \
  src/lib/p15PortabilityGate.test.ts \
  src/api/jobs.test.ts \
  src/api/maintenance.test.ts
cd apps/sidecar && PYTHONPATH=src python3 -m unittest discover -s tests -p 'test_large_wav.py' -v
cd apps/ui && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
```

## UI sign-off (пользователь)

**Итог:** **Pass** · 2026-09-18 · `/tmp/orcAI-Desktop_0.1.17_aarch64.app`  
Code gate повторён в тот же день: 40 UI-тестов, sidecar `test_large_wav` + `test_maintenance`, `tsc --noEmit`.

### Блок A · Среда выполнения (левая карточка)

| ID | Критерий | Pass |
|----|----------|------|
| A-01 | Вкладка «Среда выполнения» открывается первой; две колонки: «Движок и Sidecar» / «Данные» | ☑ |
| A-02 | «Запускать движок при старте» по умолчанию выкл.; включение сохраняется после перезапуска приложения | ☑ |
| A-03 | Нет полей порта sidecar, параллельных задач, `-v` и «сохранять журналы» (всегда авто-порт; `-v` по умолчанию 2; подробность лога predict — в Параметрах) | ☑ |
| A-04 | «Закрытие окна» = **скрывать**, только чтение | ☑ |
| A-05 | CPU выбран по умолчанию; смена CPU/GPU перезапускает среду, если она запущена | ☑ |
| A-06 | «Длинные записи» по умолчанию **выкл.**; подсказка без жаргона STFT/prefetch (в UI без суффикса «(окна)») | ☑ |
| A-07 | Подвал: версия Desktop, orcAI, Python 3.11; статус среды совпадает с Главной | ☑ |
| A-08 | «О программе» disabled (ЭК-11) | ☑ |

### Блок B · Данные (правая карточка, бывш. m31)

| ID | Критерий | Pass |
|----|----------|------|
| B-01 | Три пути: каталог проектов, данные приложения (`~/.orcai-desktop`), журнал sidecar | ☑ |
| B-02 | «Обзор» / «Открыть» через диалог / Finder; в UI нет склейки `'/'` руками | ☑ |
| B-03 | Непустой каталог проектов — родитель мастера создания проекта | ☑ |
| B-04 | «Очистить» кэш спектрограмм не трогает WAV/проекты | ☑ |
| B-05 | «Сбросить» после подтверждения: язык EN, CPU, тумблеры выкл., как первый запуск; папки WAV на диске на месте | ☑ |

### Блок C · Регрессия П-13a

| ID | Критерий | Pass |
|----|----------|------|
| C-01 | RU/EN на Настройках и Главной | ☑ |
| C-02 | Масштаб 150 %: вкладка Среда читаема, карточки не обрезаны | ☑ |
| C-03 | Full Screen: layout Настроек и Анализ (m04) без поломки chrome | ☑ |
| C-04 | hide-on-close не появился как пользовательская настройка | ☑ |

## Зафиксировать

- Скрин вкладки «Среда выполнения» (актуальный UI, не старый m17 с портом/`-v`).
- При желании: строка команды predict с `-v 2` в консоли «Команда» (значение по умолчанию).

## Согласованные отклонения от исходного П-13 / m17 / m31

- Порт sidecar, параллельность, `-v` и persist логов **убраны из UI** (пользователь, ЭК-10): порт всегда авто; `-v` = 2 в новые jobs без явного verbosity.
- «Пути» — не отдельная вкладка, а карточка **Данные** справа на той же вкладке.
- Строки «модели проекта» / «кэш проекта/spectrograms» / «журналы задач» заменены на данные приложения + sidecar.log + сброс/кэш.
- CPU/GPU остаётся на этой вкладке (ЭК-3a).
- Опциональный контур длинных WAV — тумблер, default off; orcAI `predict` не меняется.
