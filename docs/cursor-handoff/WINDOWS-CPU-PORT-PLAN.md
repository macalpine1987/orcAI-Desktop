# План порта orcAI Desktop → Windows 10/11 (CPU-only)

**Для:** Cursor Agent на Windows-машине  
**База:** orcAI Desktop **v0.1.18**, orcAI **3.0.2**, TensorFlow **2.18.x**, Python **3.11**  
**Вариант GPU:** **нет** (только CPU). DirectML / CUDA / WSL — вне скоупа этого плана.  
**Отклонение от полного П-18:** в ТЗ базовая поставка = DirectML; здесь осознанно **CPU-only** (честный fallback П-18 без GPU-бэкенда).

---

## 0. Стартовый промпт для Cursor (вставить целиком)

```
Ты портируешь orcAI Desktop v0.1.18 на Windows 10/11 x86-64, вариант CPU-only.

Прочитай и следуй:
1. docs/cursor-handoff/WINDOWS-CPU-PORT-PLAN.md (этот план) — главный чеклист
2. docs/cursor-handoff/START_HERE.md
3. docs/cursor-handoff/этапы.md · ЭК-18 / П-18 (адаптировать: без DirectML)
4. docs/cursor-handoff/промты.md · П-15, П-18 (GPU-пункты → CPU-only + warning перед train)
5. .cursor/rules/orcai-desktop-project-memory.mdc
6. .cursor/rules/orcai-autonomy-gate.mdc — аналог для Windows: бандл Python без системного PATH

Жёстко:
- orcAI не форкать; версию Desktop не бампать без явной просьбы.
- Lab UI only; RU predict = «распознавание».
- Не показывать Metal / CUDA / DirectML / Apple Silicon в UI на Windows.
- Ускоритель в среде: только «CPU» (или «CPU · Intel/AMD» из capabilities).
- Перед train / hpsearch — модальное предупреждение о длительности на CPU + явное согласие.
- Пути только через Tauri path API / joinFsPath; никаких hardcoded `/Users` или `/tmp` в production UI.
- macOS hide-on-close (крестик/⌘W) на Windows заменить на поведение Windows (см. §3).
- Сборка MSI/NSIS + portable zip; встроенный Python 3.11 + orcAI 3.0.2 + TF CPU; без tensorflow-metal.

Работай по фазам A→F из WINDOWS-CPU-PORT-PLAN.md. После каждой фазы — короткий отчёт + что осталось.
```

---

## 1. Цель и Definition of Done

Готово, когда на **чистой** Windows 10/11 (без системного Python / без conda в PATH):

1. Установщик (MSI или NSIS) или portable zip ставит/распаковывает приложение.
2. Запуск `.exe` → UI Lab; «Запуск» поднимает sidecar + движок orcAI на **CPU**.
3. Главная показывает ускоритель **CPU** (не Metal/GPU).
4. Predict по WAV / recording_table проходит; спектрограмма и Результаты работают.
5. Train / Pipeline: можно запустить **после** предупреждения о CPU; ≥1 эпоха завершается (на малом датасете).
6. Пути с кириллицей и длина >260 символов (longPathAware) не ломают проекты.
7. Per-Monitor DPI 100/150/200 % и Full Screen — без клиппинга студий (NFR-17/18).
8. В GUI нет macOS-подсказок (⌘, Finder, Metal, «скрыть как на Mac»).

---

## 2. Карта разделов приложения — что проверить на Windows

Пройти **каждый** экран Lab; для каждого: пути, диалоги, i18n, ускоритель, шорткаты.

| Раздел | Код (ориентир) | Риски Windows | Действие |
|--------|----------------|---------------|----------|
| **Главная** | `HomePage`, `RuntimeControlPanel` | Тексты GPU/Metal; прогресс probe | Только CPU; `probing_gpu` → «проверка CPU» / убрать Metal |
| **Проекты** | `ProjectsPage`, studio tabs | `revealInFileManager`, `defaultProjectsRoot`, диалоги WAV | Explorer `/select`; корень `%USERPROFILE%\Documents\orcai` или выбранный |
| **Распознавание · Параметры** | `PredictPage` | Очередь путей `\`; ETA CPU | Без Metal в подсказках ETA |
| **Распознавание · Анализ** | Predict Results studio | Спектрограмма, audio, zoom | DPI / WebView2 |
| **Распознавание · Фильтрация** | Filter studio | Запись `*_predicted_filtered.txt` | long path |
| **Результаты** | `ResultsStudio` | CSV/Audacity export, диалоги | Save dialog Windows |
| **Обучение · конвейер** | `PipelinePage` | Accel readiness Metal/CUDA | `accelCpu` only; warning на train |
| **Мастер / Монитор** | кнопки входа ЭК-13/14 | Пока stub — не блокировать порт | Оставить заглушки |
| **Модели** | `ModelsPage` | Пути моделей | Bundled `orcai-isl-v1` / `nor` |
| **Записи** | `RecordingsPage` | pick directory | OK через Tauri |
| **Задачи** | `JobsPage` | Open result → Explorer | `shell_reveal_in_finder` уже есть для Windows |
| **Настройки · Среда** | `SettingsRuntimePanel` | **Главный OS-специфичный UI** | См. §3 |
| **Настройки · Интерфейс** | theme, scale, lang | DPI presets | Сохранить; шорткаты Ctrl |
| **Справка** | Help / manual | Пути к `docs/manual` в ресурсах | Bundled resources; без macOS-only |
| **Консоль (док)** | лог / инспектор | Пути в JSON | `\`, drive letters |

Сквозные слои (не экраны, но обязательны):

| Слой | Путь | Windows-работа |
|------|------|----------------|
| Shell Tauri | `src-tauri/` | target `x86_64-pc-windows-msvc`; spawn sidecar `.exe`/python; close policy |
| Sidecar | `apps/sidecar/` | win32 paths; engine CPU-only; capabilities |
| Bundled Python | scripts + resources | Windows embed/venv **без** Metal; launcher не symlink |
| i18n | `apps/ui/public/locales/{ru,en}/` | Заменить macOS-строки |
| Platform UI | `apps/ui/src/platform/` | Уже частично portable; добить |

---

## 3. GUI / настройки: убрать Mac → подставить Windows

### 3.1 Настройки · Среда выполнения (`SettingsRuntimePanel`)

| Сейчас (macOS-ориентация) | На Windows (CPU-only) |
|---------------------------|------------------------|
| Select «Скрывать при закрытии» **disabled**, value=`hide`, hint про ⌘W/⌘Q | **Рабочий** выбор: «Закрыть и остановить среду» (default) **или** «Свернуть в трей / оставить среду» (если сделаете tray). Не писать macOS/⌘ |
| Сегмент GPU с лейблом «GPU (Metal)» | **Скрыть опцию GPU** или оставить disabled с текстом «GPU на этой сборке недоступен (CPU-only)» |
| `computeMetalMissing` / `computeMetalNoGpu` | Не показывать; для win32 — только CPU-строки |
| Hint `closeWindowHint` про macOS | Windows: «Закрытие окна останавливает sidecar и движок» **или** «Свертывание в трей — среда продолжает работу» (если tray) |

Rust уже: `hide_on_close_enabled() = cfg!(macos)` → на Windows close = stop. UI сейчас **вручную** показывает `value="hide"` disabled — это баг/mac-leak: на Windows выставить фактическую политику из `window_close_policy` (`stop_and_close`).

### 3.2 Главная / Runtime

| Убрать / не показывать | Показать |
|------------------------|----------|
| «Apple GPU · Metal», probing «GPU/Metal» | «CPU», при желании модель CPU из WMI/capabilities |
| Зелёная лампа GPU «доступен» | Лампа ускорителя = CPU ready |

### 3.3 Pipeline readiness

| Сейчас | Windows |
|--------|---------|
| `accelMetal` / `accelCuda` | `accelCpu` + при train — warning modal |

### 3.4 Шорткаты и chrome

| macOS | Windows |
|-------|---------|
| ⌘ в подсказках (locales `⌘`) | Ctrl |
| ⌘W / ⌘Q | Alt+F4 / обычный Quit из меню; документ в Справке |
| Traffic-lights / hide | Стандартный Windows chrome (minimize/maximize/close) |

### 3.5 Файловый менеджер и пути

| macOS | Windows |
|-------|---------|
| Finder (`open -R`) | Explorer уже в `shell_reveal_in_finder` |
| `~/Documents/orcai` | `%USERPROFILE%\Documents\orcai` через `documentDir()` (уже в `fsPaths.ts`) |
| Case-sensitive demo | Сохранить case-sensitive **логику сравнения имён** (П-15), даже если NTFS case-insensitive |

### 3.6 Справка / manual

- Добавить краткий раздел «Windows · CPU»: установка, Defender, Controlled Folder Access, long paths.
- Не описывать Metal / `.app` / Gatekeeper как единственный путь.

### 3.7 Что **не** трогать по смыслу Lab

Порядок сайдбара, студии Predict/Filter/Results/Pipeline, i18n RU/EN (кроме OS-строк), CLI-имена orcAI, дизайн Instrument/DAW.

---

## 4. Технические фазы (порядок для Cursor)

### Фаза A — Инвентаризация и code gate (1 сеанс)

1. Прогнать / расширить `p15PortabilityGate` / `test_p15_extended` под `win32`.
2. Список всех `darwin` / `Metal` / `⌘` / `macOS` / `Finder` / `tensorflow-metal` в UI+locales+docs/manual.
3. Зафиксировать матрицу: файл → замена Windows.

**Выход:** `WINDOWS-CPU-INVENTORY.md` (таблица находок).

### Фаза B — Runtime / sidecar CPU-only

1. `engine_worker.py`: на `win32` hint = `"CPU"`; не ставить Metal; GPU-ветка не активируется в CPU-сборке (или всегда `ORCAI_COMPUTE_DEVICE=cpu`).
2. `/v1/capabilities`: `platform=win32`, `accelerator_hint=CPU`, без metal fields как «ожидаемых».
3. `sidecarCapabilities.ts` + тесты: win32 → CPU strings, никогда MetalMissing.
4. Перед job `train` / `hpsearch` / pipeline train step — API или UI gate «CPU warning».

**Выход:** sidecar tests green; capabilities JSON пример для Windows.

### Фаза C — UI OS-адаптация (§3)

1. `SettingsRuntimePanel`: политика закрытия из `windowClosePolicy()`; GPU control hidden/disabled.
2. Locales RU/EN: новые ключи Windows; удалить/не использовать macOS-only на win.
3. Home + Pipeline accel labels.
4. Опционально: system tray + «оставить среду» (если нужно близко к hide-on-close Mac).

**Выход:** скрины Настройки / Главная RU+EN на Windows (или wine/CI screenshot N/A → описание + unit gates).

### Фаза D — Shell Tauri Windows

1. `tauri build --target x86_64-pc-windows-msvc`.
2. Spawn: `python.exe` / venv Scripts (не unix stub); рабочие `CREATE_NO_WINDOW` где нужно.
3. Quit: `stopEngine` + `stopSidecar` on close (уже non-macOS).
4. WebView2 bootstrap (документировать зависимость Evergreen Runtime).
5. `longPathAware` в манифесте; тест путь >260.
6. Иконка `.ico` (уже в bundle icons).

**Выход:** запускаемый `.exe` (dev/release) на машине агента.

### Фаза E — Bundled Python Windows (аналог Autonomy Gate)

1. Встроить embeddable/venv Python 3.11 **win_amd64**.
2. pip: `orcai==3.0.2`, `tensorflow` (CPU wheel), **без** `tensorflow-metal`.
3. Launcher: не полагаться на symlink (`python.exe` / bat / cargo-side spawn).
4. Скрипт `verify-app-python-windows.ps1` (или `.sh` через Git Bash): нет утечек в чужой Python; import orcai/tf.
5. Размер бандла — ожидать >1 GB; кэш по аналогии `~/.cache/orcai-desktop`.

**Выход:** `AUTONOMY GATE WINDOWS PASSED` (свой чеклист в отчёте).

### Фаза F — Установщик и приёмка

1. MSI **или** NSIS (+ optional zip portable).
2. Документ: Defender / Controlled Folder Access → разрешить запись в папку проектов.
3. Т-18 адаптированный (CPU-only): см. §5.
4. Отчёт `EK-18-Windows-CPU-report.md`.

---

## 5. Чеклист приёмки (адаптация Т-18)

На чистой Windows 10/11:

- [ ] Установка MSI/NSIS/zip без «missing python»
- [ ] Старт: прогресс 0%, среда остановлена; «Запуск» → sidecar+engine CPU
- [ ] Главная / Настройки: ускоритель CPU; нет Metal/⌘/macOS hide
- [ ] Проект с кириллицей в пути; «Показать в проводнике»
- [ ] Predict 1 WAV + спектрограмма Анализ
- [ ] Фильтрация пишет `*_predicted_filtered.txt`
- [ ] Результаты: сводка + CSV
- [ ] Pipeline: readiness CPU; train 1 эпоха после warning
- [ ] Long path >260 в проекте
- [ ] DPI 100/150/200 + Full Screen: студия без клиппинга
- [ ] Закрытие окна останавливает среду (или трей — как задокументировано)
- [ ] Authenticode: без подписи — описать SmartScreen; с подписью — штатно

---

## 6. Инструменты на Windows-машине

- Windows 10/11 x64, 16+ GB RAM (train на i9 CPU)
- Node 22, Rust (MSVC), Visual Studio Build Tools (C++)
- WebView2 Runtime
- Git; Cursor
- (Опционально) Python 3.11 только для сборки бандла — в runtime у пользователя не требовать

Скопировать с Mac:
- этот репозиторий / `orcai-desktop-full-backup-*`
- `docs/cursor-handoff/` целиком
- при наличии: кэш wheels (иначе pip скачает TF CPU)

**Не копировать:** macOS `.app`, `Python.framework`, `tensorflow-metal`.

---

## 7. Вне скоупа (не делать в этом порте)

- DirectML / CUDA / tensorflow-directml-plugin  
- WSL2 как runtime (отдельный канал)  
- Понижение TF до 2.10  
- Форк orcAI  
- Бамп версии Desktop без запроса  
- Ломать macOS-сборку (изменения — `cfg` / platform branches / i18n ключи с выбором по capabilities.platform)

---

## 8. Критерий совместимости с macOS

Любой PR/коммит порта:

- `npm run ui:test` / sidecar tests на macOS или CI не краснеют;
- UI не ветвится `platform === 'darwin'` в production (capabilities / shell API — да);
- macOS по-прежнему Metal GPU + hide-on-close.

---

## 9. Рекомендуемый порядок сеансов Cursor

| Сеанс | Фаза | Фокус |
|-------|------|--------|
| 1 | A | Инвентарь Mac-строк + gate-тесты |
| 2 | B+C | Sidecar CPU + Settings/Home/Pipeline UI |
| 3 | D | Tauri Windows exe spawn |
| 4 | E | Bundled Python win_amd64 |
| 5 | F | Installer + T-18 CPU report |

После сеанса 5 — решение: нужен ли позже GPU (WSL/Linux) отдельным этапом.
