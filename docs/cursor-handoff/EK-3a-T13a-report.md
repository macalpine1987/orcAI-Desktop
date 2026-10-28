# ЭК-3a / П-13a → Т-13a — отчёт (Настройки · фундамент)

**Дата закрытия:** 2026-09-02  
**Этап:** ЭК-3a · **П-13a → Т-13a**  
**Макет:** `m28-settings-interface.png` · реализация: `assets/orcai-settings-m28-implementation-v8.png`  
**Сборка:** `/tmp/orcAI-Desktop_0.1.8_aarch64.app` · **AUTONOMY GATE PASSED**

**Итог приёмки:** **Pass** (пользователь, 2026-09-02)

## Сделано

### Settings · m28 studio
- Вкладки: **Среда выполнения**, **Интерфейс** (активны); **Пути**, **О программе** (disabled → ЭК-10)
- Единая `studio-panel` (как «Задачи»): заголовок + вкладки + контент в одной рамке
- **Интерфейс:** язык RU/EN, тема, масштаб 100/125/150%, Full Screen (persist), консоль по умолчанию
- **Среда:** CPU/GPU + restart runtime
- Переключатели m28: белые сегменты, голубой toggle, pill-select
- **Предпросмотр масштаба A+:** wireframe «Задачи», метрики (canvas, effective viewport, sidebar, консоль, тема)

### Persist · v8
- Tauri Store + Rust `apply_shell_prefs_from_store`: `locale`, `theme`, `uiScale`, `launchFullscreen`, `defaultDockCollapsed`, `computeDevice`
- macOS hide-on-close — фиксированное поведение (без пользовательской настройки)

### i18n
- RU/EN на настройках и sidebar; `languageChoiceHint`; fullscreen hint без F11

### Тесты
- UI: **459 passed** (incl. `scalePreviewMetrics.test.ts`, `p13aSettingsGate.test.ts`, `defaultDockPreferences.test.ts`)

## Отклонения от исходного П-13a (согласованы)

| Пункт | Решение |
|-------|---------|
| hide-on-close в настройках | Убрано; macOS hide фиксирован в Rust |
| «Системный» масштаб | Нет (TZ/manual: 100/125/150) |
| Вкладка «Среда выполнения» | Включена раньше ЭК-10 (CPU/GPU) |
| Предпросмотр | A+ wireframe + метрики (сверх m28) |

## Следующий этап

**ЭК-4 / П-1 → Т-1** — Главная (m01, m37)

## Напоминание (не блокирует ЭК-3a)

На **ЭК-6/7** повторить регрессию i18n/DPI на **Распознавание → Результаты** (см. `T-13a-protocol.md`).
