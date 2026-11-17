# Windows · тексты шапочного «сохранено»

Заметка для дерева **Windows**. На Mac уже внесено (2026-11-17). В общем handoff — §68 в `WINDOWS-CHANGES-AFTER-1.0.3.md`.

Общий дефолт `common.saveSuccess` («Изменения сохранены успешно») оставляем для настоящих сохранений настроек. Ниже — случаи, где нужен другой смысл.

---

## 1. Factory reset — не «сохранено»

`resetToFactoryDefaults` в `apps/ui/src/preferences/usePreferencesControllers.ts` вызывал голый `notifySaved()` → generic.

### Куда вносить

- Локали: ключ `settings.resetDone`
  - RU: «Настройки сброшены к заводским»
  - EN: «Settings restored to factory defaults»
- Вызов: `notifySaved(t("settings.resetDone"))`
- Тип `notifySaved` в `ControllersArgs`: `(message?: string) => void`
- В хуке — `useTranslation` для `t`

Остальные голые `notifySaved()` в том же файле (тема, locale, пути…) **не трогать**.

---

## 2. Цель проекта

Ключ `projects.studio.focus.saved` (вызов уже есть в `useProjectRegistryActions.ts`):

| | Было | Стало |
|--|------|--------|
| RU | Изменения сохранены успешно | Цель проекта сохранена |
| EN | Changes saved successfully | Project focus saved |

---

## 3. Параметры проекта

Ключ `projects.studio.params.saved` (вызов в `useProjectParametersActions.ts`):

| | Было | Стало |
|--|------|--------|
| RU | Изменения сохранены успешно | Параметры проекта записаны |
| EN | Changes saved successfully | Project parameters saved |

---

## Не менять

- `common.saveSuccess` / prefs-переключатели
- Уже точные: filter limits, channelSaved, params.exported, export CSV/Audacity, pathClearCacheDone, wizard.*, импорт аннотаций
- Мёртвый `settings.saved` (в коде не вызывается) — можно не трогать
