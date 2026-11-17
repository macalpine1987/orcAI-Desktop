# orcAI Desktop · пакет handoff для Windows (после 1.0.3)

Снимок документации с macOS-копии с поведением **1.0.4**. Номер версии Windows-ветки **не** менять.

## Порядок чтения

1. **`WINDOWS-CHANGES-AFTER-1.0.3.md`** — перенос поведения и UI (§1–§83), «Не делать», проверка тестами.
   - §67–§72 — Help, save notice, Lab dock progress, CSV latches, focus capsule, keep-alive focus
   - §73–§74 — сброс overwrite при смене проекта; playhead спектрограммы scoped по проекту
   - §75–§76 — Hand-pan без mid-drag STFT; статичный indeterminate в Lab dock (~30 %)
   - §77–§80 — `-ow` не из пресета при смене проекта; Анализ после predict + жёлтый пульс; итог в шапке; примечание руководства про полосы классов
   - §81 — кнопка «Зациклить»: music-style repeat (две stadium-стрелки)
   - §82 — Lab-прокрутки C/D; без `:is(...)` перед `::-webkit-scrollbar` (иначе полосы не видны)
   - §83 — Фильтрация: «Применить фильтр» не уезжает влево при «Выполняется…»
2. **`WINDOWS-CODE-OPTIMIZATION-INVENTORY.md`** — полный инвентарь façade-сплитов, perf/stability, session store (audit #3–#13).
3. **`WINDOWS-SPECTROGRAM-COLORMAPS.md`** — палитры спектрограммы (уже могло быть перенесено с 1.0.2).
4. **`WINDOWS-FILTER-ALIGNMENT.md`** — выравнивание вкладки Фильтрация (1.0.3).
5. **`WINDOWS-SAVE-NOTICE-COPY.md`** — точные тексты шапочного «сохранено» (factory reset / цель / параметры); дублируется кратко в §68.

Тексты руководства: брать из `docs/manual/{ru,en}/` рабочей macOS-копии (в §61 handoff — клавиши оболочки macOS ↔ Windows).

## Архив

Имя типичного zip: `orcai-desktop-windows-handoff-1.0.4.zip` (в `/tmp` на машине сборки macOS).
