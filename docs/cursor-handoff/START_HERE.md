# START HERE — первое сообщение для Cursor

Скопируйте блок ниже в новый чат Cursor (Agent) на машине с репозиторием `orcai-desktop`.
Приложите файл этапа из `mockups/` и при необходимости PDF из этой папки.

---

Ты продолжаешь разработку **orcAI Desktop** (Tauri 2 + React Lab + Python FastAPI sidecar + bundled orcAI 3.0.2).

Контекст пакета (прочитай целиком перед кодом):
1. `docs/cursor-handoff/START_HERE.md` (этот файл)
2. `docs/cursor-handoff/этапы.md` — выбери этап **ЭК-N**
3. `docs/cursor-handoff/промты.md` — тексты **П-n** и **Т-n**
4. `docs/cursor-handoff/mockups/` — PNG макета этапа
5. `docs/cursor-handoff/orcAI-Desktop-TZ-dorozhnaya-karta.pdf` — полное ТЗ (§3 требования, §7 макеты, §11 промты, §12 этапы)
6. `docs/orcAI-Desktop-чек-лист-приёмки.md` — ручная приёмка К-1…К-14 + приложение Г + FR-11.12–14
7. `docs/manual/` — руководство пользователя RU/EN + manifest.json (deep link «Справка»)
8. Живой эталон UI 0.1.8: `docs/ui-memory/0.1.8/`
9. Project rule: `.cursor/rules/orcai-desktop-project-memory.mdc`

Жёсткие правила:
- Движок orcAI не форкать; предметная логика = вызов CLI orcAI.
- Lab UI: левый сайдбар (порядок не менять), консоль (0.1.8: Лог+Инспектор; цель П-12: +Ошибки, +Команда), тёмная тема.
- RU/EN; в RU predict = «Распознавание»; имена файлов/классов не переводить.
- Ручной старт sidecar+движка; динамический порт; hide-on-close.
- Не бампать версию; не ломать сборку `.app`.
- Спектрограмма: `display_kind=orcai` / `make_spectrogram`.
- Лицензия: CC BY-SA 4.0; автор Desktop — Vadim Romanov; attribution orcAI в Справке.
- **ЭК-1 / П-19:** Clean Code + PEP 8 sidecar с первого коммита (ruff); orcAI не рефакторить.
- **ЭК-3a / П-13a** — ✅ закрыт 2026-09-02 (i18n, DPI, persist m28).
- **ЭК-4 / П-1** — ✅ закрыт 2026-09-02 (Главная m01/m37, Т-1 code gate).
- **ЭК-5 / П-2** — ✅ code gate Pass (2026-09-08 / QA 2026-09-14).
- **ЭК-6 / П-3** — ✅ code gate Pass (2026-09-14).
- **ЭК-7 / П-4** — ✅ закрыт 2026-09-16 (code gate + UI sign-off).
- **ЭК-8 / П-5** — ✅ в v0.1.15. **ЭК-9 / П-6** — ✅ в v0.1.16 (Результаты · сводка).
- **ЭК-10 / П-13** — ✅ закрыт 2026-09-18 (code gate + UI sign-off, **в v0.1.17**).
- **ЭК-11 / П-16** — ✅ закрыт 2026-09-18 (code gate + UI sign-off, **в v0.1.18**).
- **ЭК-12 / П-7** — ✅ закрыт 2026-09-20 (code gate + UI sign-off Т-7 **Pass**, **в штампе** `/tmp/orcAI-Desktop_0.1.18_aarch64.app`).
- **ЭК-13 / П-8** — ✅ закрыт 2026-09-22 (code gate + UI sign-off Т-8 **Pass**, штамп `/tmp/orcAI-Desktop_0.1.18_aarch64.app`).
- **ЭК-14 / П-10** — ✅ закрыт 2026-09-24 (code gate + UI sign-off Т-10 **Pass**, штамп `/tmp/orcAI-Desktop_0.1.19_aarch64.app`).
- **ЭК-15 / П-11** — ✅ закрыт 2026-09-24 (code gate + UI sign-off Т-11 **Pass**, штамп `/tmp/orcAI-Desktop_0.1.19_aarch64.app` 13:54).
- **ЭК-2 / П-15:** пути через API, case-sensitive имена, абстракция ускорителя — до портов.
- **Windows:** DirectML в базовой поставке (П-18).

Сейчас этап **ЭК-16** (Дообучение · П-9 → Т-9): макет `m13` в `docs/cursor-handoff/mockups/`. Протокол предыдущего: `T-11-protocol.md` / `EK-15-T11-report.md`.

Если чего-то нет в ТЗ или orcAI 3.0.2 — спроси, не выдумывай поведение движка.

**Источник истины при расхождениях:** `orcai <command> --help` / исходник `src/orcai/cli.py` внутри
установленного пакета orcAI 3.0.2 — выше по приоритету, чем README.md репозитория orcAI. Пример
разночтения, найденный при подготовке этого пакета: верхнеуровневый README называет команду
фильтрации `orcai filter-annotations` в списке подкоманд, тогда как в разделе примеров того же
README и в фактическом коде (`cli.py`, группа команд «Predicting calls») она называется
`filter-predictions` — именно это имя используется во всей документации Desktop и должно
остаться в коде.
