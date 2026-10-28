import {
  Callout,
  Divider,
  Grid,
  H1,
  H2,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

export default function QaStages111() {
  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H1>Прогон после этапов 1–11</H1>
        <Text tone="secondary">
          orcAI Desktop 0.1.32, исходники. 28 октября 2026. Сборка .app не
          запускалась. Интерфейс: vitest и tsc. Sidecar: unittest на bundled
          Python 3.11. Оболочка: cargo test --offline. Ruff: src и tests
          sidecar.
        </Text>
      </Stack>

      <Grid columns={4} gap={16}>
        <Stat value="1002" label="Тесты интерфейса, все прошли" tone="success" />
        <Stat value="0" label="Ошибки TypeScript" tone="success" />
        <Stat value="405" label="Тесты sidecar, все прошли" tone="success" />
        <Stat value="1" label="Тест оболочки, прошёл" tone="success" />
      </Grid>

      <Callout tone="success" title="Создание задачи больше не падает на чужом каталоге">
        Проверка «уже отменена» открывает базу проекта только если файл уже
        есть, и сама запись по-прежнему не роняет задачу в памяти. Повторный
        прогон sidecar: 405 тестов, OK.
      </Callout>

      <Callout tone="warning" title="В текстах движок 3.0.4, в комплекте всё ещё 3.0.2">
        Справка, LICENSE и README Python говорят 3.0.4. importlib.metadata в
        bundled venv возвращает 3.0.2. Скрипт bundle-python.sh не запускался,
        TensorFlow не трогался. Штамп /tmp/orcAI Desktop.app эти одиннадцать
        этапов не содержит.
      </Callout>

      <Stack gap={8}>
        <H2>Прогоны</H2>
        <Table
          headers={["Прогон", "Объём", "Итог"]}
          columnAlign={["left", "right", "left"]}
          rows={[
            ["vitest", "158 файлов, 1002 теста, 12 с", "Все прошли"],
            ["tsc -b", "apps/ui", "Код 0"],
            ["ruff", "apps/sidecar src и tests", "Замечаний нет"],
            ["unittest sidecar", "405 тестов, повторный прогон", "Все прошли"],
            ["cargo test --offline", "1 тест оболочки", "Прошёл"],
          ]}
          rowTone={["success", "success", "success", "success", "success"]}
        />
        <Text tone="tertiary" size="small">
          Предупреждения, не падения: React act() у плеера и спектрограммы,
          FastAPI on_event deprecated, предупреждения компилятора в vendor/bit-vec.
        </Text>
      </Stack>

      <Divider />

      <Stack gap={8}>
        <H2>Этапы 1–11</H2>
        <Table
          headers={["Этап", "Чем закрыт", "Итог"]}
          rows={[
            ["1–2 Подписи и подсказки", "sectionSubtitlesGate, 4", "Прошёл"],
            ["3 Руководство", "manualCopyGate, 4", "Прошёл"],
            ["4 Рамка результатов и моделей", "studioFrameGutterGate, 2", "Прошёл"],
            ["5 Шестерёнка", "NavIcon, 3", "Прошёл"],
            ["6 Пустой суффикс", "filterCliLine и матрица параметров", "Прошёл"],
            ["7 Пресеты", "predictModelProfiles, 13", "Прошёл"],
            ["8–10 Остановка обучения", "задачи sidecar и гейт монитора, 8", "Прошёл"],
            ["11 Пин 3.0.4", "гейты Главной и Справки", "Тексты сошлись, пакет старый"],
          ]}
          rowTone={[
            "success",
            "success",
            "success",
            "success",
            "success",
            "success",
            "success",
            "warning",
          ]}
        />
        <Text tone="tertiary" size="small">
          Этап 11 — предупреждение: подпись 3.0.4, установленный пакет 3.0.2.
          Пересборку Python не запускали.
        </Text>
      </Stack>

      <Stack gap={8}>
        <H2>Что не запускалось</H2>
        <Text>
          Живой Keras fit и кнопка Стоп в мониторе. Щелчки по интерфейсу в
          окне приложения. Пересборка .app и AUTONOMY GATE. Установка orcAI
          3.0.4 в bundled Python.
        </Text>
      </Stack>
    </Stack>
  );
}
