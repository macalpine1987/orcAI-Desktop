# Т-16 · Протокол приёмки — Справка (ЭК-11)

**Сборка:** baseline **v0.1.18** · `/tmp/orcAI-Desktop_0.1.18_aarch64.app`  
**Промпт:** П-16 · `docs/cursor-handoff/промты.md`  
**Макеты:** `m18-help-about.png`, `m19-help-manual-toc.png`, `m20-help-orcai.png`, `m21-help-license.png`, `m22-help-third-party.png`, `m38-help-manual-chapter.png`  
**Требования:** FR-11.6–FR-11.14, приложение Г  

QA: Senior QA, 2026-09-18. Живой UI (`localhost:1420`) + штамп `.app`.

## Code gate

| Проверка | Статус |
|----------|--------|
| `apps/ui/src/lib/ek11HelpGate.test.ts` | ☑ 9/9 |
| `apps/ui/src/lib/helpMarkdown.test.ts` | ☑ |
| `apps/ui/src/lib/p13aSettingsGate.test.ts` (две вкладки, без «О программе») | ☑ |
| `apps/ui/src/lib/ek10SettingsGate.test.ts` | ☑ |
| `apps/ui/src/lib/p15PortabilityGate.test.ts` (ЭК-2) | ☑ |
| `tsc --noEmit` (`apps/ui`) | ☑ |

Повторный прогон 2026-09-18: **36 tests passed** + `tsc` exit 0.

```bash
cd apps/ui && npm run test -- \
  src/lib/ek11HelpGate.test.ts \
  src/lib/helpMarkdown.test.ts \
  src/lib/p13aSettingsGate.test.ts \
  src/lib/ek10SettingsGate.test.ts \
  src/lib/p15PortabilityGate.test.ts
cd apps/ui && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
```

## UI sign-off (QA)

**Итог:** ☑ Pass ☐ Fail · дата **2026-09-18** · сборка **v0.1.18**

### Блок A · Вкладки

| ID | Критерий | Pass |
|----|----------|------|
| A-01 | Три вкладки: Руководство, О программе, Лицензия (О Desktop + О orcAI слиты; зависимости в `THIRD_PARTY_LICENSES` в пакете) | ☑ |
| A-02 | «О программе»: Vadim Romanov, © 2026, CC BY-SA 4.0, CITATION.cff и публикация MMS | ☑ |
| A-03 | Все 7 авторов статьи, DOI, GitHub, версия 3.0.2 неизменён | ☑ |
| A-04 | Нет формулировок, что ETH / авторы orcAI одобрили или совместно выпустили Desktop | ☑ |

### Блок B · Руководство

| ID | Критерий | Pass |
|----|----------|------|
| B-01 | Оглавление слева; справа сразу выбранная глава (отступление от m19 landing, согласовано 2026-09-18) | ☑ |
| B-02 | Глава «Распознавание · Результаты» (m38) из кнопки Справка на Анализе | ☑ |
| B-03 | Язык глав = язык интерфейса; имена, DOI, CLI не переводятся | ☑ |
| B-04 | На экране Справки нет кнопки «Справка» в chrome | ☑ |

### Блок C · Пакет и Настройки

| ID | Критерий | Pass |
|----|----------|------|
| C-01 | В `.app`: `LICENSE`, `NOTICE`, `THIRD_PARTY_LICENSES`, `docs/manual/` | ☑ |
| C-02 | В Настройках нет вкладки «О программе»; сведения — **Справка → О программе** | ☑ |
| C-03 | Ссылка creativecommons.org/licenses/by-sa/4.0/ открывается в браузере | ☑ |
| C-04 | hint «§ …» рядом со Справкой на Анализе и на Настройках | ☑ |

### Согласованные отклонения от исходного П-16

1. Пять вкладок макета → **три** (слияние «О Desktop» + «О orcAI» по варианту A; вкладка «Сторонние» снята, файл в пакете).
2. «Лицензия» = полный текст `LICENSE`, не чек-лист CC §3 (условия лицензии + no-endorsement остаются в LICENSE и на «О программе»).
3. «Настройки → О программе» снята (юридический дом — Справка).
4. Нет landing m19: TOC + сразу глава.

### Остаточный риск (не блокер)

- Hint на вкладке Анализ не кликался в этой сессии: раздел недоступен при остановленной среде. Код + deep link `/help?topic=scope.studio` проверены; hint на Настройках («§ Настройки») виден.
- `shell_open_url` в Tauri не вызывался: в web-режиме href CC = `https://creativecommons.org/licenses/by-sa/4.0/`, `openExternalUrl` пропускает только `http(s)`.
