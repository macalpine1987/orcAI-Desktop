# Баг-репорт · ЭК-15 / Т-11 · Модели (повторный прогон QA)

**Роль:** Senior QA  
**Дата:** 2026-09-24 (retest после фиксов M-01…M-10 + UX)  
**Объект:** `ModelsPage` / `ModelsStudio` / sidecar `model_studio` + `/v1/fs/exists`  
**База:** working tree + штамп `/tmp/orcAI-Desktop_0.1.19_aarch64.app`  
**Метод:** code review текущего дерева + сверка с m15 / П-11 / `T-11-protocol.md`  
**Живой прогон UI на штампе:** не выполнялся в этом сеансе (отмечено)

---

## Вердикт

| | |
|--|--|
| Рекомендация | **Conditional Pass** к UI sign-off — блокеров P0 нет; остались Medium/Minor и расхождения протокола с макетом |
| Code gate | **Pass** (`ek15ModelsGate` 9/9) |
| Предыдущий Conditional Fail (M-01/M-02) | **Закрыт** |
| Живой прогон Т-11 | Pending |

Раздел готов к приёмке по макету и основному UC; «Дообучить» сознательно отложено на ЭК-16 (disabled).

---

## Матрица кнопок (факт после фиксов)

| UI | Действие | Ок? | Заметки |
|----|----------|-----|---------|
| **Импорт** | Капсула `predict-tab` → диалог → `POST /v1/models/import` | ✓ | Нужен проект + Tauri; ошибки через `detail` |
| **Экспорт** | Капсула → копия trained | ✓ | Builtin disabled + tooltip |
| **Выбрать** | Фокус строки / карточки | ✓ | Как в макете |
| **Использовать** | Compat → predict settings → `/predict` | ✓ | Блок при mismatch; warn без parameter |
| **Дообучить** | Disabled + `finetuneSoon` | ✓* | *Отклонение от П-11 «открывает мастер» — согласовано до ЭК-16 |
| **Тест** | Preflight TVT/parameter → job → `/jobs` | ✓ | Parameter resolve = folder/glob (`/v1/fs/orcai-parameter`); TVT OK |
| **Открыть папку** | Reveal только trained | ✓ | Builtin disabled |
| **Справка** | `PageHelpButton` | ✓ | |

---

## Закрытые дефекты прошлого отчёта

| ID | Статус |
|----|--------|
| M-01 Дообучить → тупик wizard | **Fixed** — disabled + soon |
| M-02 nor без «30 эпох» | **Fixed** — RU/EN |
| M-03 спектрограмма/shape в карточке | **Superseded** — по макету убраны (см. R-03) |
| M-04 PR/RE в строках классов | **Superseded** — по макету только F1 (+ KPI PR/RE) |
| M-05 Тест без TVT / false negative dir | **Fixed** — `fs_exists` → `exists()`; train\|test_dataset |
| M-06 сырой JSON ошибок | **Fixed** — `throwHttpError` |
| M-07 нет фидбека после Теста | **Fixed** — navigate `/jobs` |
| M-08 Open folder builtin | **Fixed** |
| M-09 silent ok без parameter | **Fixed** — warn banner |
| M-10 «Карточка» vs «Выбрать» | **Fixed** — снова «Выбрать» |
| M-11 Экспорт вне протокола | **Fixed** — A-08 |

---

## Открытые / новые замечания

### R-01 · Medium — Preflight «Тест» строит путь parameter из `display_name` — **Fixed**

**Было:** `paramPath` из `workspace.projectName` (display_name).  
**Исправление:** `GET /v1/fs/orcai-parameter` → `project_parameter_path` (folder → glob); UI `resolveOrcaiParameterPath` в `ModelsPage.onTest`.

---

### R-02 · Minor — Карточка не обновляется, пока не вернуться в «Модели»

**Факт:** после Теста → `/jobs`; метрики на диск пишутся; `fetchModelDetail` без кэша.  
**Но:** пока пользователь на Задачах / не переоткроет Модели (или не сменит selection), KPI в карточке старые.  
**Ожидание (nice-to-have):** refresh detail при `focus`/возврате на `/models` или по событию job completed.  
Не блокер UC.

---

### R-03 · Doc / протокол — A-03 и чеклист D устарели относительно макета

**Факт (код + решение продукта):** карточка = файлы + действия + тест (MBA/PR/RE KPI, F1-бары). Спектрограмма / shape / PR·RE·N в строках **убраны** по m15.  
**Протокол** всё ещё требует спектрограмму/shape и PR/RE по классам в D.2.  
**Действие:** поправить `T-11-protocol.md` A-03 / D под макет (не код).

---

### R-04 · Accepted deviation — «Дообучить» ≠ критерий «Готово» П-11

П-11: «Дообучить открывает мастер в режиме этой модели».  
Факт: disabled до ЭК-16.  
В протоколе A-05 уже отражено. Для Т-11 UC это **не Fail**, если явно принять scope.

---

### R-05 · Observation — ключи параграфов Описания

`key={para.slice(0, 48)}` — теоретический коллизионный риск при похожих первых 48 символах. На практике с isl/nor/trained маловероятно.

---

### R-06 · Observation — размер trained ≈ builtin

Сумма файлов каталога; доминирует `.keras` той же архитектуры → ~11.7 MB. Не дефект.

---

## Взаимодействие с другими разделами

| Связь | Оценка |
|-------|--------|
| **Predict** | «Использовать» + compat — OK |
| **Pipeline / Wizard** | Finetune deep-link снят; кнопка soon — OK для ЭК-15 |
| **Jobs** | Тест ставит job и уводит в Задачи — OK |
| **Диск / TVT** | После фикса `exists()` каталоги видны — OK |
| **Повторный тест → Модели** | Файлы `test_data_*` перезаписываются; UI читает их при возврате — OK (с оговоркой R-02) |

---

## Макет m15 vs код

| Элемент | Макет | Код |
|---------|-------|-----|
| Toolbar | Импорт + Обучить | Импорт + **Экспорт** (капсулы как Pipeline) — OK продукт |
| Таблица | Jobs chrome | ✓ |
| Описание + карточка | тёмные панели | ✓ `#191a1b` как `.pp-col` |
| Строки классов | бар + F1 | ✓ |
| KPI | MBA / точность / полнота | ✓ |
| Дообучить | активна | disabled soon — scope ЭК-16 |

---

## Чеклист приёмки (живой прогон)

1. [ ] isl/nor в таблице; nor — isl + **30 эпох**.  
2. [ ] Карточка: файлы + MBA/PR/RE + F1-бары (без спектрограммы/shape).  
3. [ ] «Дообучить» disabled + tooltip.  
4. [ ] Несовместимая → блок «Использовать»; без parameter → предупреждение.  
5. [ ] Импорт / Экспорт round-trip.  
6. [ ] Тест: с TVT → job; без TVT → отказ; **display_name ≠ folder** → проверить R-01.  
7. [ ] Повторный тест → вернуться в Модели → цифры обновились.  
8. [ ] AUTONOMY GATE на актуальном штампе.

---

## Приоритеты

| P | ID | Действие |
|---|----|----------|
| ~~P1~~ | ~~R-01~~ | **Fixed** — `/v1/fs/orcai-parameter` + `resolveOrcaiParameterPath` |
| P2 | R-02 | Refresh detail при входе на `/models` (не блокер приёмки) |
| ~~P2~~ | ~~R-03~~ | **Fixed** — `T-11-protocol.md` A-03 / D синхронизированы с m15 |
| — | R-04 | Оставить до ЭК-16 |

---

*Сеанс приёмки 2026-09-24: code gate + штамп Pass; overall ждёт UI sign-off блока D.*
