# Главная · автопрокрутка рейки плана к running

Инструкция для Cursor на Windows. Перенести автопрокрутку рейки плана обучения на **Главной** к выполняющемуся (или упавшему) шагу, как на macOS после правки к orcAI Desktop **1.0.4**. Версию Windows-ветки не менять. Скрипты сборки macOS не копировать.

Краткая запись в журнале: `docs/WINDOWS-CHANGES-AFTER-1.0.3.md` §86.

Порядок шагов на рейке (§85) — отдельно: `docs/WINDOWS-HOME-WIZARD-PLAN-ORDER.md`.  
Локаль монитора (§84) — `docs/WINDOWS-TRAIN-MONITOR-LOCALE.md`.

Этот файл не входит в справку приложения. Каталог `docs/manual/` не трогать.

## Проблема

`.home-wizard-plan-scroll` показывает примерно **три** строки. При плане из 7–8 шагов активный `train` / `test` оказывается ниже fold — пользователь видит только ранние `done` и не замечает, что сейчас выполняется.

## Не делать

- Не менять версию Desktop и не копировать скрипты сборки macOS.
- Не вызывать `element.scrollIntoView()` на `window` / странице — только скролл внутри `.home-wizard-plan-scroll`.
- Не писать свой расчёт `scrollTop`, если на ветке уже есть `scrollElementIntoScroller` из `spectrogramDetections` (тот же хелпер, что у таблицы детекций на Анализе).
- Не автопрокручивать к `queued` / `done`.
- Не дёргать scroll, если фокус-строка уже полностью в видимой области (`scrollElementIntoScroller` сам это учитывает).
- Не менять `max-height` рейки ради «чтобы всё влезло» вместо scroll-follow.

## Поведение после фикса

1. `homeWizardPlanFocusStepId(steps)` → id шага `running`, иначе первого `error`, иначе `null`.
2. `HomeWizardPlanRail` в `useLayoutEffect` находит `<li>` фокуса и scroller → `scrollElementIntoScroller(row, scroller, 0)`; повтор на следующем animation frame (flex/`zoom`).
3. Зависимости эффекта: `focusId` и `steps` (смена running при poll / смена набора команд).
4. На фокус-строке: `data-plan-focus="true"` (для gate / отладки).

**Важно (баг первой версии):** `.home-wizard-plan-scroll` был `position: static`, поэтому не являлся `offsetParent` строк, и `scrollElementIntoScroller` (путь через `offsetTop`) молча возвращал `false`. На macOS/Windows нужно:

- `position: relative` на `.home-wizard-plan-scroll` (`home.css`);
- в `scrollElementIntoScroller` — fallback через `getBoundingClientRect`, если offset-цепочка не доходит до scroller (см. `spectrogramDetections.ts`).

## Файлы

| Файл | Действие |
|---|---|
| `apps/ui/src/lib/homeWizardPlan.ts` | добавить `homeWizardPlanFocusStepId` |
| `apps/ui/src/lib/homeWizardPlan.test.ts` | кейс running / error / null |
| `apps/ui/src/pages/home/HomeWizardPlanRail.tsx` | refs + `useLayoutEffect` (+ double rAF) + `data-plan-focus` |
| `apps/ui/src/styles/home.css` | `.home-wizard-plan-scroll { position: relative; … }` |
| `apps/ui/src/lib/spectrogramDetections.ts` | `scrollElementIntoScroller`: rect-fallback если offset-цепочка мимо scroller |
| `apps/ui/src/lib/scrollElementIntoScroller.test.tsx` | кейс «scroller is not an offsetParent» |
| `apps/ui/src/lib/ek4HomeGate.test.ts` | string-gate на focus helper, `scrollElementIntoScroller`, `data-plan-focus` |

## Как переносить

Windows-ветка может разойтись с macOS. Не делать слепой `git checkout` всего дерева.

### 1. Хелпер в `homeWizardPlan.ts`

```ts
/**
 * Step the Home plan rail should keep in view: running first, else first error.
 */
export function homeWizardPlanFocusStepId(
  steps: HomeWizardPlanStep[] | null | undefined,
): string | null {
  if (!steps?.length) return null;
  const running = steps.find((s) => s.status === "running");
  if (running) return running.id;
  const failed = steps.find((s) => s.status === "error");
  return failed?.id ?? null;
}
```

Тип `HomeWizardPlanStep` уже импортируется из `HomeWizardPlanRail` в этом файле.

### 2. `HomeWizardPlanRail.tsx`

Импорты:

```ts
import { useLayoutEffect, useRef } from "react";
import { homeWizardPlanFocusStepId } from "../../lib/homeWizardPlan";
import { scrollElementIntoScroller } from "../../lib/spectrogramDetections";
```

В компоненте:

```ts
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const focusId = homeWizardPlanFocusStepId(steps);

  useLayoutEffect(() => {
    if (!focusId) return;
    let cancelled = false;
    const reveal = () => {
      if (cancelled) return;
      const scroller = scrollRef.current;
      const row = rowRefs.current.get(focusId);
      if (!scroller || !row) return;
      scrollElementIntoScroller(row, scroller, 0);
    };
    reveal();
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(reveal);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [focusId, steps]);
```

В `home.css` у `.home-wizard-plan-scroll` добавить `position: relative`.

В `scrollElementIntoScroller` перенести rect-fallback с macOS (если offset-цепочка не доходит до scroller — не `return false` сразу).

На контейнер списка:

```tsx
      <div
        ref={scrollRef}
        className="home-wizard-plan-scroll"
        …
      >
```

На каждую строку:

```tsx
              <li
                key={step.id}
                ref={(node) => {
                  if (node) rowRefs.current.set(step.id, node);
                  else rowRefs.current.delete(step.id);
                }}
                className={clsx("home-wizard-plan-row", `is-${tone}`)}
                data-plan-focus={step.id === focusId ? "true" : undefined}
              >
```

Остальную разметку / статусы / LED не менять.

### 3. Тесты

В `homeWizardPlan.test.ts`:

```ts
describe("homeWizardPlanFocusStepId", () => {
  it("prefers running over error and earlier done steps", () => {
    expect(
      homeWizardPlanFocusStepId([
        { id: "create-spectrograms", status: "done" },
        { id: "train", status: "running" },
        { id: "test", status: "queued" },
      ]),
    ).toBe("train");
    expect(
      homeWizardPlanFocusStepId([
        { id: "create-tvt-data", status: "error" },
        { id: "train", status: "queued" },
      ]),
    ).toBe("create-tvt-data");
    expect(
      homeWizardPlanFocusStepId([
        { id: "train", status: "done" },
        { id: "test", status: "done" },
      ]),
    ).toBeNull();
  });
});
```

В `ek4HomeGate.test.ts` (блок про `HomeWizardPlanRail`):

```ts
    const planRail = read(src("pages/home/HomeWizardPlanRail.tsx"));
    expect(planRail).toContain("homeWizardPlanFocusStepId");
    expect(planRail).toContain("scrollElementIntoScroller");
    expect(planRail).toContain("data-plan-focus");
```

Проверка:

```bash
cd apps/ui && npx vitest run src/lib/homeWizardPlan.test.ts src/lib/ek4HomeGate.test.ts src/lib/scrollElementIntoScroller.test.tsx
```

## QA вручную (Windows)

1. Главная · активный план с ≥5 шагами (рейка с overflow).
2. Пока идут первые prep — в видимой зоне текущий `running`.
3. Когда дойдёт до `train` / `test` — строка сама появляется в окне рейки без ручной прокрутки.
4. При `error` на шаге — прокрутка к этой строке.
5. Если running уже в кадре — poll статуса не должен «прыгать» списком.
