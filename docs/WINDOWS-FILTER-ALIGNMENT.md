# Выравнивание вкладки «Фильтрация» с macOS 1.0.3

Инструкция для Cursor на Windows. Перенести выравнивание вкладки **Распознавание → Фильтрация**, как оно сделано в orcAI Desktop **1.0.3** на macOS. Версию Windows-ветки не менять. Скрипты сборки macOS не копировать.

Источник истины на GitHub: https://github.com/macalpine1987/orcAI-Desktop  
Коммит: `cadbcc4f548e1d2928e17dddc9fb687b8f62c90a` (`Align the filter studio with the tab buttons and mark version 1.0.3.`).  
Родитель: `66a23cd31ae047620ea065658a800339a23b60b3` (macOS 1.0.2).

Этот файл не входит в справку приложения. Каталог `docs/manual/` не трогать.

Палитра спектрограммы и колбэк `on_test_batch_end` в этот перенос не входят. Они описаны в `docs/WINDOWS-SPECTROGRAM-COLORMAPS.md`.

## Не делать

- Не ставить версию Desktop в `1.0.3` и не менять `package.json`, `apps/ui/package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, README.
- Не копировать скрипты сборки macOS и не переносить скриншоты README.
- Не менять `apps/ui/src/styles/predict-params.css`. Отступ кнопки «Результаты» уже задан там.
- Не обнулять внутренние отступы рамок `.predict-filter-m05-limits` и `.predict-filter-m05-side`.
- Не менять пустое состояние `.predict-filter-studio-empty`.
- Не править тесты ради старого `padding: 0.85rem 1rem`. Они проверяют структуру, не эти отступы.
- Не переводить подписи монитора обучения **Loss** и **LR**. Если в русской локали уже стоят `Loss` и `LR`, оставить их.

## Как переносить

Windows-ветка может разойтись с macOS. Не делать `git checkout cadbcc4 -- .`.

1. Подтянуть коммит, не сливая всю `main`:

```bash
git fetch https://github.com/macalpine1987/orcAI-Desktop.git cadbcc4f548e1d2928e17dddc9fb687b8f62c90a
```

2. Смотреть только diff отступа:

```bash
git diff 66a23cd31ae047620ea065658a800339a23b60b3 cadbcc4f548e1d2928e17dddc9fb687b8f62c90a -- \
  apps/ui/src/styles/predict-filter.css
```

3. В `apps/ui/src/styles/predict-filter.css` заменить два правила. Остальной файл не переписывать.

Было:

```css
.predict-filter-m05 {
  padding: 0.85rem 1rem 0.75rem;
}

.predict-filter-m05-foot {
  padding: 0.65rem 1rem 0.75rem;
}
```

Стало:

```css
.predict-filter-m05 {
  /* Left edge meets the Parameters tab. Right edge meets the Results
     button, which sits 8px in from the toolbar (same pad as the queue). */
  padding: 0 var(--pp-params-scroll-pad-end, 8px) 0 0;
}

.predict-filter-m05-foot {
  padding: 0.65rem var(--pp-params-scroll-pad-end, 8px) 0.75rem 0;
}
```

`gap`, `overflow`, `border-top` и остальные свойства этих правил оставить как есть.

Если на Windows у `.predict-results-page-actions` другой `margin-right`, правый отступ фильтра должен совпасть с ним, а не с числом 8. На macOS кнопка «Результаты» имеет `margin-right: var(--pp-params-scroll-pad-end, 8px)`, а токен `--pp-params-scroll-pad-end: 8px` задан на `.predict-studio`.

## Поведение

Вкладка **Фильтрация**. Вкладки и содержимое фильтра — соседи внутри одной панели, поэтому выравнивание делается внутренним padding, а не padding самой панели.

- Левый край рамки **«Пределы длительности»** на одной линии с кнопкой вкладки **«Параметры»**. Слева лишнего отступа нет: у фильтра нет полосы пресетов, которая на вкладке запуска добавляет 6px.
- Правый край выбора записи и блока предпросмотра на одной линии с кнопкой **«Результаты»**. Оба блока лежат в колонке `.predict-filter-m05-right` и получают один и тот же правый отступ родителя.
- Строка команды внизу (`.predict-filter-m05-foot`) сдвинута вместе с рамками. Подвал стоит снаружи прокрутки `.predict-filter-m05`, поэтому ему нужен свой такой же правый отступ.

Вкладки **Параметры**, **Анализ** и **Результаты** не менять.
