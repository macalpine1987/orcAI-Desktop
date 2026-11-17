# Перенос палитры спектрограммы с macOS 1.0.2

Инструкция для Cursor на Windows. Перенести выбор палитры спектрограммы, как он сделан в orcAI Desktop **1.0.2** на macOS, и поправку колбэка обучения из **1.0.1**. Версию Windows-ветки не менять. Скрипты сборки macOS не копировать.

Источник истины на GitHub: https://github.com/macalpine1987/orcAI-Desktop  
Коммит: `66a23cd31ae047620ea065658a800339a23b60b3` (`Add spectrogram colormap choices and mark version 1.0.2.`).

Этот файл не входит в справку приложения. Каталог `docs/manual/` не трогать.

## Не делать

- Не ставить версию Desktop в `1.0.2` и не менять `package.json`, `apps/ui/package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, README.
- Не копировать `scripts/build-macos-release.sh`, `scripts/embed-python-in-built-app.sh`, `scripts/resume-macos-release.sh`, `scripts/verify-app-python.sh`, `scripts/strip-host-search-paths.sh`.
- Не форкать orcAI и не добавлять matplotlib в поставку Python. В собранном приложении matplotlib нет, и он не нужен.
- Не красить тайлы на сервере. Sidecar по-прежнему отдаёт серый uint8. Цвет рисует интерфейс.
- Не добавлять цветовую шкалу (colorbar).
- Не показывать тост «изменения сохранены» при выборе палитры. Не вызывать `notifySaved` из этого обработчика.
- Не писать в меню `Grays`. Имя matplotlib — **Greys**. В проекте хранится значение `gray`.
- Не менять `job_cancel.py`, ось эпох монитора обучения и прочие правки вне списка файлов ниже. Исключение — метод `on_test_batch_end` в `train_live.py`, он описан отдельно.

## Как переносить

Windows-ветка может разойтись с macOS. Не делать `git checkout 66a23cd -- .`.

1. Подтянуть коммит, не сливая всю `main`:

```bash
git fetch https://github.com/macalpine1987/orcAI-Desktop.git 66a23cd31ae047620ea065658a800339a23b60b3
```

2. Смотреть только diff палитры:

```bash
git diff 66a23cd31ae047620ea065658a800339a23b60b3^ 66a23cd31ae047620ea065658a800339a23b60b3 -- \
  apps/ui/src/lib/spectrogramView.ts \
  apps/ui/src/lib/spectrogramColormapLut.ts \
  apps/ui/src/lib/spectrogramColormapLut.test.ts \
  apps/ui/src/lib/ek7PredictResultsGate.test.ts \
  apps/ui/src/components/SpectrogramViewer.tsx \
  apps/ui/src/components/SpectrogramFileSegmentRail.tsx \
  apps/ui/src/components/SpectrogramFileSegmentRail.test.tsx \
  apps/ui/src/styles/analysis-lab.css \
  apps/ui/src/api/projects.ts \
  apps/sidecar/src/orcai_desktop_sidecar/project_registry.py \
  apps/sidecar/src/orcai_desktop_sidecar/main.py \
  apps/sidecar/tests/test_projects.py
```

3. Если файл на Windows совпадает с родителем этого коммита, перенести хунк палитры. Если файл уже другой, сохранить местные правки и добиться поведения из раздела «Поведение».
4. Файл `apps/ui/src/lib/spectrogramColormapLut.ts` скопировать из коммита целиком. Кривые не генерировать заново и не заменять линейным инвертированием.

## Поведение

Меню стоит на рейке сегментов вкладки **Анализ** (`layout="scientific"`). Оно первый ребёнок `.analysis-segment-rail-studio-right`, сразу после центрального разделителя `.analysis-segment-rail-studio-sep`. Счётчик сегмента, диапазон, длительность и кнопки prev/next остаются у правого края.

Меню видно только когда спектрограмма показана (`showSpectrogram`) и рейка не в режиме `fileNavOnly`. Это свой список, не нативный `<select>`. Клик снаружи закрывает его. Подпись кнопки берётся из уже существующего ключа `spectrogram.toolbar.colormapLabel`. Новые строки перевода не нужны.

Порядок пунктов:

| Подпись | Значение в коде и в проекте |
|---|---|
| inferno | `inferno` |
| viridis | `viridis` |
| plasma | `plasma` |
| magma | `magma` |
| cividis | `cividis` |
| Greys | `gray` |

Пока в проекте нет сохранённого выбора, выбран **Greys**. Пустое, отсутствующее или неизвестное значение читается как `gray`.

Выбор пишется в `.orcai-desktop/desktop_settings.json` проекта, ключ `spectrogram_colormap`. Запись идёт через `updateProject` / `PATCH /v1/projects/{id}`. Другие поля настроек (`auto_sync_recording_table`, `predict_model`, `predict_model_dir`) при этом не затираются. Если проекта нет, пункт на экране меняется, а запрос не отправляется. Если запись не удалась, пункт на экране остаётся новым, файл проекта не меняется, сообщение об ошибке не показывается.

Поздний ответ `fetchProject` не затирает пункт, который пользователь уже нажал. При смене проекта выбор сбрасывается и читается заново. Без `activeProjectId` на экране снова Greys.

Тайлы по-прежнему запрашиваются с `colormap: "gray"` и `display_kind: orcai`. Числа orcAI: тишина ближе к 0, громкий сигнал ближе к 255. `SpectrogramColormapCanvas` красит их таблицей matplotlib. На обоих холстах `invert={false}`. Повторно переворачивать Greys нельзя: у matplotlib Greys 0 — белый, 255 — чёрный. Линейная карта `binary` (середина 127) — неверная реализация.

Для Greys фон холста светлый (`#ececec`), класс `is-cmap-dark` выключен. Для остальных пяти фон чёрный, класс `is-cmap-dark` включён, направляющие осей чуть светлее.

Панель инструментов Анализа палитру не показывает: `hideColormap={isScientific}` остаётся. Старый режим pro-lab по-прежнему хранит выбор в `localStorage` (`orcai.spectrogram.colormap`) и оставляет три прежние кнопки. Если там записаны `plasma`, `magma` или `cividis`, pro-lab открывается как `inferno`. Анализ этот ключ не читает.

`make_spectrogram` в orcAI возвращает массив `[0, 1]` без палитры. Раскраска только отображение. Обучение и распознавание от неё не зависят.

## Файлы

### `apps/ui/src/lib/spectrogramView.ts`

Добавить список, подписи и разбор значения проекта:

```ts
export const SPECTROGRAM_COLORMAPS = [
  "inferno",
  "viridis",
  "plasma",
  "magma",
  "cividis",
  "gray",
] as const;

export type SpectrogramColormap = (typeof SPECTROGRAM_COLORMAPS)[number];

export const SPECTROGRAM_COLORMAP_LABEL: Record<SpectrogramColormap, string> = {
  inferno: "inferno",
  viridis: "viridis",
  plasma: "plasma",
  magma: "magma",
  cividis: "cividis",
  gray: "Greys",
};

export function isSpectrogramColormap(
  value: string | null | undefined,
): value is SpectrogramColormap {
  return (SPECTROGRAM_COLORMAPS as readonly string[]).includes(value ?? "");
}

export function spectrogramColormapFromProject(
  value: string | null | undefined,
): SpectrogramColormap {
  return isSpectrogramColormap(value) ? value : "gray";
}
```

### `apps/ui/src/lib/spectrogramColormapLut.ts`

Скопировать файл из коммита `66a23cd`. В нём шесть таблиц matplotlib, 256×3 RGB, base64, разбор через `atob`.

Проверка, что скопирован нужный файл:

- каждая строка base64 длиной 1024 символа, после `atob` длина 768;
- строка magma содержит `BkSuBkyuAlCyAliy`;
- строка gray начинается с `/////////v7+` и заканчивается на `AQEBAAAA`;
- `grayToRgbaPixels` по умолчанию не инвертирует отсчёт: индекс LUT равен значению серого пикселя.

Концы кривых, которые проверяют тесты:

| Карта | индекс 0 | индекс 255 |
|---|---|---|
| inferno | 0, 0, 4 | — |
| viridis | 68, 1, 84 | — |
| plasma | 13, 8, 135 | — |
| cividis | 0, 34, 78 | — |
| Greys (`gray`) | 255, 255, 255 | 0, 0, 0 |

Greys дополнительно: индекс 64 → 217, 217, 217; индекс 128 → 149, 149, 149.

### `apps/ui/src/components/SpectrogramViewer.tsx`

- Научный режим начинает с `"gray"`, не с `localStorage`.
- `setColormap` в научном режиме увеличивает `colormapChoiceRev` и вызывает `updateProject(activeProjectId, { spectrogram_colormap: map })`. Успех не объявляется. Ошибка запроса глотается.
- Эффект на `[layout, activeProjectId]` для `layout === "scientific"` обнуляет rev, читает проект и применяет `spectrogramColormapFromProject`, только если rev всё ещё 0.
- Pro-lab по-прежнему использует `loadColormap()` и `localStorage`. `plasma` / `magma` / `cividis` в этом хранилище сбрасываются в `inferno`.
- Рейке передаются `colormap` и `onColormapChange={setColormap}` только при `showSpectrogram`.
- `hideColormap={isScientific}` не снимать.
- Оба `SpectrogramColormapCanvas` получают `invert={false}`.
- `lightGrayCanvas = isScientific && colormap === "gray"` задаёт фон `#ececec`. Иначе фон чёрный и на сборку графика вешается `is-cmap-dark`.
- Запросы тайлов остаются `colormap: "gray"`.

Если во viewer на Windows уже есть `notifySaved` для других действий, эти вызовы не удалять. Для палитры `notifySaved` не вызывать. Проверку `not.toContain("notifySaved")` на весь файл тогда заменить проверкой самого обработчика палитры.

### `apps/ui/src/components/SpectrogramFileSegmentRail.tsx`

Необязательные props: `colormap` (по умолчанию `"gray"`) и `onColormapChange`. Без `onColormapChange` меню нет.

Меню — первый ребёнок правого блока, после разделителя, только при `!fileNavOnly`. Клик по пункту вызывает `onColormapChange` и закрывает список. Подписи из `SPECTROGRAM_COLORMAP_LABEL`. Образцы с классами `is-inferno` … `is-gray`.

В тесте открывать меню через `act(() => button.click())` из `react`. `@testing-library/react` в проекте нет. Без `onColormapChange` у рейки нет `.analysis-segment-rail-studio-cmap`. С обработчиком: 6 пунктов, кнопка — первый ребёнок правого блока, подпись `Greys`, третий пункт вызывает `plasma`.

### `apps/ui/src/styles/analysis-lab.css`

- `.predict-results-segment-panel { overflow: visible }`, иначе список обрезается.
- Блок меню после стилей разделителя. У `.analysis-segment-rail-studio-cmap` есть `margin-right: auto`.
- Если в правом блоке есть меню, у блока `padding-left: 0.55rem`. Правый блок остаётся `justify-content: flex-end`.
- Меню: `position: absolute`, `z-index: 30`, открывается вниз.
- Образцы — градиенты концов matplotlib. Greys: `#ffffff` → `#000000`.
- `.analysis-spectrogram-scientific.is-cmap-dark .analysis-spectrogram-canvas { background: #000 }`. Направляющие: `rgb(255 255 255 / 0.16)` и для мелких `rgb(255 255 255 / 0.08)`.

### `apps/ui/src/api/projects.ts`

В `ProjectRecord` добавить `spectrogram_colormap?: string | null`. В patch `updateProject` добавить `spectrogram_colormap?: string`. Сам `updateProject` тост не показывает.

### Sidecar

`apps/sidecar/src/orcai_desktop_sidecar/project_registry.py`:

- множество имён: `inferno`, `viridis`, `plasma`, `magma`, `cividis`, `gray`;
- `get_spectrogram_colormap`: нет строки или имя неизвестно → `None` (интерфейс тогда показывает Greys);
- в словарь проекта, рядом с `predict_model`, поле `spectrogram_colormap` (`null`, пока не задано);
- `update_project(..., spectrogram_colormap=None)`: не `None` → обрезать, привести к нижнему регистру, неизвестное имя → `ValueError`. Запись только этого ключа в `desktop_settings.json`.

`apps/sidecar/src/orcai_desktop_sidecar/main.py`:

- у `UpdateProjectRequest` поле `spectrogram_colormap: str | None = None`;
- один этот ключ не даёт ответ `Nothing to update`;
- передать его в `update_project`. Уже существующий `except ValueError` отвечает HTTP 400.

`spectrogram_render.py` не расширять. Серверный `apply_colormap` для `gray` остаётся тождественным RGB. Интерфейс цветные карты у сервера не запрашивает.

Тест `test_spectrogram_colormap_defaults_to_none_and_persists`: новый проект отдаёт `null` и не создаёт файл настроек; `plasma` сохраняется в `.orcai-desktop/desktop_settings.json` и читается обратно; `Grays` вызывает `ValueError`.

### `apps/ui/src/lib/ek7PredictResultsGate.test.ts`

Сохранить прежние проверки научного режима. Дополнительно исходник viewer содержит `spectrogram_colormap`, `updateProject`, `onColormapChange={setColormap}`, `hideColormap={isScientific}` и не содержит `const colormap = isScientific ? "gray"`. Тайлы остаются `display_kind=orcai`.

## Колбэк проверки выборки

Ошибка `on_test_batch_end() got an unexpected keyword argument 'logs'` на Windows та же, что на macOS. Keras вызывает метод как `on_test_batch_end(batch, logs=...)`. Второй параметр обязан называться `logs`. Другое имя, в том числе `_logs`, обучение на проверочной выборке обрывает.

Метод нужен только чтобы остановить обучение, если задачу отменили. Метрики из `logs` он не читает. Остальной колбэк не переписывать.

Если в Windows-ветке сигнатура уже `on_test_batch_end(self, batch: int, logs: Any = None)`, этот раздел пропустить. Исправление вошло в macOS **1.0.1** (коммит `71f9c33`) и есть в `66a23cd`.

В `apps/sidecar/src/orcai_desktop_sidecar/train_live.py` метод должен быть таким:

```python
def on_test_batch_end(self, batch: int, logs: Any = None) -> None:
    # Keras calls this as on_test_batch_end(batch, logs=logs). The names
    # must stay `batch` and `logs`; a rename breaks validation.
    del batch, logs
    self._abort_if_cancelled()
```

Тест `test_fit_callback_stops_when_the_job_is_cancelled` в `apps/sidecar/tests/test_train_monitor.py` проверяет, что в исходнике есть строка `def on_test_batch_end(self, batch: int, logs: Any = None)`.

## Проверка

Из `apps/ui`:

```bash
./node_modules/.bin/vitest run --configLoader native --config vitest.config.mjs src/lib/spectrogramColormapLut.test.ts src/components/SpectrogramFileSegmentRail.test.tsx src/lib/ek7PredictResultsGate.test.ts
./node_modules/.bin/tsc -b
```

Затем полный набор UI-тестов и тесты sidecar, которыми Windows-ветка уже пользуется. Минимум по sidecar: `test_spectrogram_colormap_defaults_to_none_and_persists`, `test_fit_callback_stops_when_the_job_is_cancelled` и `ruff check` затронутых файлов.

На экране Анализа: меню сразу справа от центрального разделителя; по умолчанию Greys (белый фон, чёрный сигнал); plasma — тёмно-синий фон и жёлтый сигнал; после перезахода в тот же проект выбор на месте; тост о сохранении не появляется.
