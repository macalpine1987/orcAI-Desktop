import {
  Callout,
  Divider,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

export default function QaRegression100() {
  return (
    <Stack gap={20}>
      <Row align="center" gap={12}>
        <H1>Регресс 1.0.0</H1>
        <Pill tone="success" active>
          Годен
        </Pill>
      </Row>
      <Text tone="secondary">
        Штамп /tmp/orcAI Desktop.app · 28 октября 2026, 12:17–12:18. Прогон
        автоматических наборов и проверка собранного приложения. Живой обход
        экранов в окне не выполнялся.
      </Text>
      <Callout tone="success" title="Блокирующих дефектов нет">
        1408 автоматических проверок прошли. В штампе orcAI 3.0.4, TensorFlow
        2.18.1 и tensorflow-metal 1.2.0. Проверка автономности пройдена.
      </Callout>
      <Grid columns={4} gap={16}>
        <Stat value="1002" label="Тесты UI" tone="success" />
        <Stat value="405" label="Тесты sidecar" tone="success" />
        <Stat value="1" label="Тест оболочки" tone="success" />
        <Stat value="0" label="Падения" tone="success" />
      </Grid>
      <H2>Наборы</H2>
      <Table
        headers={["Набор", "Результат", "Объём"]}
        columnAlign={["left", "left", "right"]}
        rowTone={["success", "success", "success", "success", "success"]}
        rows={[
          ["UI vitest", "Пройден", "158 файлов, 1002 теста"],
          ["TypeScript tsc -b", "Пройден", "код выхода 0"],
          ["ruff sidecar", "Пройден", "src и tests"],
          ["sidecar unittest", "Пройден", "405 тестов, 17.0 с"],
          ["cargo test --offline", "Пройден", "1 тест, orcai-desktop 1.0.0"],
        ]}
        striped
      />
      <H2>Штамп</H2>
      <Table
        headers={["Поле", "Ожидание", "Факт"]}
        rowTone={["success", "success", "success", "success", "success", "success"]}
        rows={[
          ["CFBundleShortVersionString", "1.0.0", "1.0.0"],
          ["CFBundleVersion", "1.0.0", "1.0.0"],
          ["orcAI", "3.0.4", "3.0.4"],
          ["TensorFlow", "2.18.1", "2.18.1"],
          ["tensorflow-metal", "1.2.0", "1.2.0"],
          ["Keras", "3.x", "3.15.1"],
        ]}
        striped
      />
      <Text tone="secondary" size="small">
        Источник: verify-app-python.sh и importlib.metadata внутри
        /tmp/orcAI Desktop.app. Модели orcai-isl-v1 и orcai-nor-v1 на месте.
        OpenSSL 3.6.2. Путей Homebrew в load commands нет.
      </Text>
      <Divider />
      <H2>Замечания без отказа</H2>
      <Table
        headers={["Сигнал", "Где", "Решение"]}
        rowTone={["neutral", "neutral", "neutral"]}
        rows={[
          [
            "React act()",
            "SpectrogramAudioPlayer, SpectrogramViewer",
            "Тесты зелёные. Предупреждение тестовой обвязки.",
          ],
          [
            "DeprecationWarning",
            "FastAPI on_event, audioread aifc/audioop/sunau",
            "Sidecar на Python 3.11. На результат не влияет.",
          ],
          [
            "Предупреждения компилятора",
            "vendor/bit-vec",
            "Чужой код. Тест оболочки прошёл.",
          ],
        ]}
      />
    </Stack>
  );
}
