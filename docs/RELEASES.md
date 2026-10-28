# orcAI Desktop — releases

## v1.0.0 (2026-10-28) — baseline

**Текущая эталонная сборка.** Используйте в промптах: «откатись на v1.0.0» или «как в v1.0.0».

Имя файла `.app` — `orcAI Desktop.app`. Версия **1.0.0** записана в свойствах пакета (`CFBundleShortVersionString` и `CFBundleVersion`).

| Артефакт | Путь |
|----------|------|
| Приложение | `/tmp/orcAI Desktop.app` |
| Архив baseline | `/tmp/orcai-desktop-baseline-v1.0.0-app` |
| Снимок исходников | `/tmp/orcai-desktop-baseline-v1.0.0-src` |

Предыдущий эталон: **v0.1.32**.

### Что входит относительно v0.1.32

- Подписи разделов и пояснения внутри экранов. Описания конвейера и результатов не менялись
- Руководство: строка длительности по умолчанию, суффикс и пресеты, фильтр в неполадках, глоссарий пределов, пустые сниппеты, нефильтрованный тест
- Рамка результатов и моделей совпадает с консолью
- У настроек шестерёнка с шестью зубьями
- Пустой суффикс метки остаётся пустым и уходит в команду как `-ls ''`. Одинокая `*` по-прежнему не добавляет суффикс
- Пресет распознавания не наследует чужой каталог модели. Сохранение общего пресета не привязывает его к проекту
- Остановка обучения: Keras выходит из `fit`, прогресс не возвращает задачу в «идёт», монитор сразу показывает «Остановлено» и закрывается, не дожидаясь процесса
- В текстах пин движка orcAI **3.0.4**. Уже собранный Python в комплекте по-прежнему содержит пакет **3.0.2**: `bundle-python.sh` при этой сборке не запускался
- Штамп с AUTONOMY GATE

## v0.1.32 (2026-10-24) — baseline

Предыдущая эталонная сборка. «Откатись на v0.1.32» — этот раздел. Живой штамп `/tmp/orcAI Desktop.app` с v1.0.0 перезаписан; эта версия остаётся в архиве baseline.

Имя файла `.app` — `orcAI Desktop.app`. Под иконкой в Finder это имя, а не штамп с версией. Версия **0.1.32** записана в свойствах пакета (`CFBundleShortVersionString` и `CFBundleVersion`).

| Артефакт | Путь |
|----------|------|
| Приложение | `/tmp/orcAI Desktop.app` |
| Архив baseline | `/tmp/orcai-desktop-baseline-v0.1.32-app` |
| Снимок исходников | `/tmp/orcai-desktop-baseline-v0.1.32-src` |

Предыдущий эталон: **v0.1.31**.

### Что входит относительно v0.1.31

- Очистка кэша спектрограмм показывает в шапке «Кэш спектрограмм успешно удалён» и сбрасывает тайлы, которые окно ещё держит в памяти. Записи и проекты не затрагиваются
- Из исходников убраны пометки этапов. Поведение программы то же
- В правиле раскладки и ТЗ масштаб 150% больше не описан как текущий пресет. Сохранённые 150% по-прежнему читаются как 125%
- Шапка подтверждает постановку задач мастера в очередь, запись файла параметров, синонимов, пределов длительности фильтра и экспорт параметров конвейера
- «Пресет проекта» остаётся одной строкой и совпадает по краям с колонкой «Очередь запуска», включая ширину полосы прокрутки
- Подпись графика монитора: серая линия — обучение, зелёная — проверочная выборка. Если зелёная несколько эпох не растёт, обучение останавливается и сохраняется лучшая модель. MBA не считает классы, которые в записи не размечали
- По окончании обучения полоса батча заполняется зелёным до 100% и показывает «Готово»
- Штамп с AUTONOMY GATE. Снимок для отката обновлён 2026-10-24

## v0.1.31 (2026-10-23) — baseline

Предыдущая эталонная сборка. «Откатись на v0.1.31» — этот раздел. Живой штамп `/tmp/orcAI Desktop.app` с v0.1.32 перезаписан; эта версия остаётся в архиве baseline.

| Артефакт | Путь |
|----------|------|
| Приложение | `/tmp/orcAI Desktop.app` |
| Архив baseline | `/tmp/orcai-desktop-baseline-v0.1.31-app` |
| Снимок исходников | `/tmp/orcai-desktop-baseline-v0.1.31-src` |

Предыдущий эталон: **v0.1.30**.

## v0.1.30 (2026-10-23) — baseline

Предыдущая эталонная сборка. «Откатись на v0.1.30» — этот раздел.

### Собранное приложение (macOS aarch64)

| Артефакт | Путь |
|----------|------|
| Текущая копия | `/tmp/orcAI-Desktop_0.1.30_aarch64.app` |
| Архив baseline | `/tmp/orcai-desktop-baseline-v0.1.30-app` |

### Исходники baseline

| Артефакт | Путь |
|----------|------|
| Снимок исходников | `/tmp/orcai-desktop-baseline-v0.1.30-src` |
| Рабочая копия | `orcai-desktop/` (версия в манифестах: `0.1.30`) |

### Откат на v0.1.30

```bash
# Восстановить исходники из baseline
rsync -a --delete \
  --exclude 'src-tauri/target' \
  --exclude 'apps/ui/node_modules' \
  --exclude 'node_modules' \
  --exclude 'src-tauri/resources/python' \
  /tmp/orcai-desktop-baseline-v0.1.30-src/ \
  /path/to/orcai-desktop/

# Правила Cursor для этого эталона (этап, baseline mdc)
rsync -a --delete \
  /tmp/orcai-desktop-baseline-v0.1.30-src/.cursor/rules/ \
  /path/to/orcai-desktop/.cursor/rules/

# Пересобрать .app
bash /path/to/orcai-desktop/scripts/build-macos-release.sh

# Или сразу запустить сохранённый .app
open /tmp/orcai-desktop-baseline-v0.1.30-app
```

### Что входит относительно v0.1.29

- Новый процесс sidecar снимает оставшиеся задачи «в очереди» и «выполняется», даже если прошлый выход не оставил метку аварии. Завершённые и упавшие строки остаются. Задача, созданная уже после старта, остаётся в очереди. Скрытие окна sidecar не перезапускает, живая очередь продолжается. Воркер задачи очередь сам не отменяет
- Масштаб 150% заполняет окно. В Chrome размер задаётся кеглем, в WebKit остаётся CSS zoom. На коротком окне панель параметров прокручивается до кнопки запуска
- Настройки и справка складываются по ширине своей панели
- Если сохранённый каталог проектов исчез, мастер берёт домашнюю папку. Папка, выбранная вручную и отсутствующая на диске, по-прежнему ошибка: каталог не создаётся
- Монитор обучения считает оставшиеся эпохи ReduceLR по колбэку Keras, а если его нет в живом логе — по эпохам с лучшего результата
- CSV матрицы ошибок хранит числа своей строки
- Штамп с AUTONOMY GATE

## v0.1.29 (2026-10-23)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.29_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.29-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.29-src/` или `open /tmp/orcai-desktop-baseline-v0.1.29-app`.

### Что входило относительно v0.1.28

- Каталог проектов по умолчанию — домашняя папка (`/Users/<имя>/`). Пустой `projectsRoot` больше не указывает на `Documents/orcai`. Сохранённый в настройках каталог по-прежнему важнее
- Мастер создания берёт сохранённый каталог, иначе папку открытого проекта, иначе домашнюю. «Далее» дожидается пути и не отправляет пустого родителя
- Отмена пакетного распознавания по CSV снимает предсказания записей не старше старта задачи. Сама таблица и файл с её именем остаются
- Интерфейс не менялся
- Штамп с AUTONOMY GATE

## v0.1.28 (2026-10-18)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.28_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.28-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.28-src/` или `open /tmp/orcai-desktop-baseline-v0.1.28-app`.

### Что входило относительно v0.1.27

- Отмена задачи в очереди не удаляет файлы прошлого прогона. Отмена уже идущей снимает только артефакты не старше её старта
- Сбой обновления `recording_table.csv` возвращает прежнюю таблицу. После удаления записей таблица дополняется, а не пересобирается с нуля
- Повторное распознавание не оставляет старый filtered. Кастомный путь фильтра спрашивает перезапись того файла, который будет записан
- Пакетный `-o` именует предсказания по имени модели. Классы вроде `SS_A` и `WH_2` не сливаются с `SS` и `WH`
- Тест без unfiltered-датасета его не запускает. Падение шага плана отменяет остальные ожидающие шаги. Перезапись TVT и hpsearch не оставляет старые шарды и логи поиска
- Перезапуск sidecar не даёт старому потоку остановить новый процесс. Незавершённые задачи снимаются после реального выхода sidecar
- Штамп с AUTONOMY GATE

## v0.1.27 (2026-10-10)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.27_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.27-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.27-src/` или `open /tmp/orcai-desktop-baseline-v0.1.27-app`.

### Что входило относительно v0.1.26

- Импорт парных аннотаций дописывает недостающие имена в `calls`. Нетронутая стартовая семёрка заменяется словарём файлов, если ни одного из этих имён в аннотациях нет. Непарные `.txt` не учитываются
- В дообучении модель без общего класса с аннотациями остаётся в списке и не выбирается. Частичное совпадение по-прежнему доступно
- Сохранение параметров: новое имя в `calls` при автосинке добавляет колонку в `recording_table.csv`. Без автосинка подсвечивается «Обновить таблицу», распознавание из-за отсутствующей колонки не блокируется
- Колонка «Тип», экспорт CSV и подсказка спектрограммы показывают синоним из `call_equivalences.json`. Без синонима встроенный класс сохраняет публикационное имя, обученный — код без суффикса `*`
- В фильтре «Классы» белый квадрат остаётся у снятого класса, если по нему были детекции. Класс без детекций остаётся тёмным
- Штамп с AUTONOMY GATE

## v0.1.26 (2026-09-29)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.26_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.26-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.26-src/` или `open /tmp/orcai-desktop-baseline-v0.1.26-app`.

### Что входило относительно v0.1.25

- При выходе и по «Остановить» Sidecar снимает задачи «в очереди» и «выполняется» и останавливает их воркеры. Скрытие окна очередь не трогает. Чтение базы при старте процесса задачи не отменяет
- Штамп с AUTONOMY GATE

## v0.1.25 (2026-09-29)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.25_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.25-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.25-src/` или `open /tmp/orcai-desktop-baseline-v0.1.25-app`.

### Что входило относительно v0.1.24

- Повторный тест в «Моделях», а также `train` и `hpsearch`, берут `compression_type` с заголовка `data_*.tfrecord`. Датасет без сжатия не читается как GZIP
- Описание обученной модели называет число классов и не упоминает порог
- Штамп с AUTONOMY GATE

## v0.1.24 (2026-09-29)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.24_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.24-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.24-src/` или `open /tmp/orcai-desktop-baseline-v0.1.24-app`.

### Что входило относительно v0.1.23

- Обучение в меню доступно для фокуса «Обучение модели» и «Полный цикл»; при «Распознавание» пункт виден и не нажимается
- Лампа «Аннотации» считает парные `.txt` («0 из N» загруженных WAV). Путь в CSV без файла меткой не является
- «Записи без аннотаций» зелёная только когда txt есть у каждого WAV; иначе жёлтая и показывает, сколько файлов будет пропущено
- Без парного `.txt` мастер и шаги от label arrays не стартуют; спектрограммы остаются доступны. Сервер отклоняет эти команды с `409`
- Счётчики файлов не обнуляются, если проект лежит в каталоге с точкой в имени
- Штамп с AUTONOMY GATE

## v0.1.23 (2026-09-28)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.23_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.23-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.23-src/` или `open /tmp/orcai-desktop-baseline-v0.1.23-app`.

### Что входило относительно v0.1.22

- Калькулятор сниппетов в мастере обучения: отсев пустых окон как в orcAI, точные counts только при совпавшем `-p` и колонках классов
- Главная · «Текущий проект»: рамки четырёх индикаторов как у KPI монитора обучения
- Штамп с AUTONOMY GATE

## v0.1.22 (2026-09-28)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.22_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.22-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.22-src/` или `open /tmp/orcai-desktop-baseline-v0.1.22-app`.

### Что входило относительно v0.1.21

- Runtime: старт движка через host HTTP (`sidecar_engine_start`) — без гонок WKWebView `fetch` на ephemeral-порт
- Cold-start: синхронный сброс refs + live-check sidecar; guards вокруг `startAll` / autostart
- E2E: `scripts/e2e-runtime-autostart.sh` (autostart → engine ready)
- Штамп с AUTONOMY GATE

## v0.1.21 (2026-09-24)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.21_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.21-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.21-src/` или `open /tmp/orcai-desktop-baseline-v0.1.21-app`.

### Что входило относительно v0.1.20

- ЭК-16 / Дообучение (m13): мастер finetune; вход с Моделей («Дообучить») и конвейера
- Training QA TRN-01…08 (hpsearch HPS, активный план, Stop pending, finetune race, disk estimate, orphan cancel, console subtitle)
- hpsearch: не отдельный сценарий мастера; opt-in + шаг конвейера
- Консоль: выравнивание имени команды с вкладкой «Команда»
- Штамп с AUTONOMY GATE

## v0.1.20 (2026-09-24)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.20_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.20-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.20-src/` или `open /tmp/orcai-desktop-baseline-v0.1.20-app`.

### Что входило относительно v0.1.19

- ЭК-15 / Модели (m15): студия, Импорт/Экспорт, Использовать+compat, Тест preflight, Описание = selected
- «Дообучить» disabled до ЭК-16 (accepted); R-01 parameter resolve folder/glob
- Т-11 Pass (2026-09-24); штамп с AUTONOMY GATE

## v0.1.19 (2026-09-22)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.19_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.19-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.19-src/` или `open /tmp/orcai-desktop-baseline-v0.1.19-app`.

### Что входило относительно v0.1.18

- ЭК-12 / конвейер обучения (m07) + ЭК-13 мастер (m08–m12); Т-7/Т-8 Pass
- ЭК-14 / монитор обучения (m14 modal): KPI, батчи, график, Stop / папка
- Классификация ошибок конвейера + RU/EN remediation (TVT/GZIP и др.)
- WKWebView: линии графика (backdrop-filter вынесен с оверлея)

## v0.1.18 (2026-09-18)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.18_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.18-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.18-src/` или `open /tmp/orcai-desktop-baseline-v0.1.18-app`.

ЭК-11 / m18–m22, m38 **Справка**; иконка squircle; Т-16 Pass.

## v0.1.17 (2026-09-17)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.17_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.17-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.17-src/` или `open /tmp/orcai-desktop-baseline-v0.1.17-app`.

ЭК-10 / m17 Настройки · интеграция; `-cdl` opt-in; Фильтрация: кнопка «Результаты»; Проекты: вкладки-капсулы; спектрограмма: оконный STFT.

## v0.1.16 (2026-09-17)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.16_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.16-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.16-src/` или `open /tmp/orcai-desktop-baseline-v0.1.16-app`.

ЭК-9 / m06 Результаты: сводка predicted / filtered / annotations, 5 KPI, таблица, CSV / Audacity, переход в Анализ; minProb не режет аннотации.

## v0.1.15 (2026-09-16)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.15_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.15-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.15-src/` или `open /tmp/orcai-desktop-baseline-v0.1.15-app`.

Распознавание · QA: ввод пределов `0.06`; без «Только предпросмотр»; `default` не затеняется `[0, null]`; футер команды на Фильтрации; Анализ: бейдж пола `> N`; черта `-th` = 50.

## v0.1.14 (2026-09-16)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.14_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.14-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.14-src/` или `open /tmp/orcai-desktop-baseline-v0.1.14-app`.

ЭК-8 / m05 Фильтрация: пределы длительности, гистограмма, предпросмотр `filter-predictions`; исходный `*_predicted.txt` не переписывается; пустые min/max → JSON `null`.

## v0.1.13 (2026-09-16)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.13_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.13-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.13-src/` или `open /tmp/orcai-desktop-baseline-v0.1.13-app`.

ЭК-7 / m04 Результаты: studio (transport, сегменты, спектрограмма, таблица детекций); prev/next записей; таблица 3–8 видимых строк; спектрограмма с потолком (`cqh`); ТЗ масштабирования Lab UI.

## v0.1.12 (2026-09-15)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.12_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.12-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.12-src/` или `open /tmp/orcai-desktop-baseline-v0.1.12-app`.

ЭК-6 polish: колонки «Параметры запуска» / «Очередь запуска» вровень снизу; общая прокрутка сетки; скролл только у таблицы WAV; Advanced рядом с каналом; пресеты только на Параметрах.

## v0.1.11 (2026-09-15)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.11_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.11-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.11-src/` или `open /tmp/orcai-desktop-baseline-v0.1.11-app`.

ЭК-6 «Распознавание · Параметры» (m03): studio «Параметры запуска» + «Очередь запуска»; CLI Copy + ETA; пресеты; Advanced (`-o`/`-v`); overwrite → повторный прогон; отчёт `EK-6-P3-report.md`.

## v0.1.10 (2026-09-08)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.10_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.10-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.10-src/` или `open /tmp/orcai-desktop-baseline-v0.1.10-app`.

ЭК-5 «Проекты» (m02, m23–m25, m32–m36); studio-рамка; soft `project_focus`; AUTONOMY GATE с nested Python.app.

## v0.1.9 (2026-09-04)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.9_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.9-{app,src}`.

**Откат:** `rsync` из `/tmp/orcai-desktop-baseline-v0.1.9-src/` или `open /tmp/orcai-desktop-baseline-v0.1.9-app`.

ЭК-4 Home (m01) + фикс «Перезапустить»; Jobs/Home chrome; outlined «Справка»; AUTONOMY GATE с nested Python.app.

## v0.1.8 (2026-07-22)

Предыдущий baseline. Артефакты: `/tmp/orcAI-Desktop_0.1.8_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.8-{app,src}`.

## v0.1.7 (2026-07-22)

Артефакты: `/tmp/orcAI-Desktop_0.1.7_aarch64.app`, `/tmp/orcai-desktop-baseline-v0.1.7-{app,src}`.

## Older baselines

v0.1.6 … v0.1.1 — см. `.cursor/rules/orcai-baseline-v0.1.x.mdc` и архивы `/tmp/orcAI-Desktop_0.1.x_aarch64.app`.
