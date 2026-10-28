import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  Pill,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

/**
 * EK-11 follow-up: merge Help About Desktop + About orcAI,
 * and decide where Settings → About lives. Three variants for sign-off.
 */

export default function HelpAboutMergeVariants() {
  return (
    <Stack gap={24} style={{ maxWidth: 960 }}>
      <Stack gap={8}>
        <H1>О программе · варианты объединения</H1>
        <Text tone="secondary">
          Отступление от ТЗ / m18–m20. Сейчас три места говорят одно и то же:
          Справка → О Desktop, Справка → О orcAI, Настройки → О программе
          (строка + «Подробнее»). Нужно одно место.
        </Text>
      </Stack>

      <Callout tone="info" title="Рекомендация — вариант A">
        Справка: Руководство · О программе · Лицензия. В «О
        программе» — Desktop и orcAI на одном экране (7 авторов, CC §3, no
        endorsement). Настройки: только Среда выполнения и Интерфейс; в
        подвале Среды — строка © и ссылка «Подробнее». Зависимости — файл
        THIRD_PARTY_LICENSES в пакете.
      </Callout>

      <Grid columns={3} gap={12}>
        <Stat value="A" label="Справка как дом" />
        <Stat value="B" label="Настройки как дом" />
        <Stat value="C" label="Внутренние капсулы" />
      </Grid>

      <Grid columns={3} gap={12}>
        <Card>
          <CardHeader trailing={<Pill tone="success" size="sm">рекомендую</Pill>}>
            A · Справка
          </CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text weight="semibold">4 вкладки Справки</Text>
              <Text tone="secondary">
                Одна карточка Desktop + orcAI: авторы ПО (CITATION.cff, 4
                человека) отдельно от авторов статьи (7); сайт группы
                Theoretical Biology ETH Zurich (tb.ethz.ch). Вкладка Настроек
                «О программе» снимается.
              </Text>
              <Text tone="secondary">
                Совпадает с запросом: перенести сюда «О программе» и сделать
                всё в Справке.
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>B · Настройки</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text weight="semibold">Полный About в Настройках</Text>
              <Text tone="secondary">
                Справка теряет О Desktop / О orcAI, остаются Руководство и
                Лицензия. Юридический текст живёт рядом со средой
                выполнения.
              </Text>
              <Text tone="secondary">
                Минус: лицензия и About оказываются в разных разделах.
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>C · Внутренняя пара</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text weight="semibold">О программе = Desktop | Движок</Text>
              <Text tone="secondary">
                Те же 4 вкладки Справки, что в A, но сверху страницы капсулы
                Desktop / Движок. Уведомление CC всегда внизу. Настройки без
                вкладки About.
              </Text>
              <Text tone="secondary">
                Ближе к двум старым вкладкам, меньше «всё сразу».
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Divider />
      <H2>Что куда девается</H2>
      <Table
        headers={["Элемент", "A Справка", "B Настройки", "C Внутренние"]}
        rows={[
          [
            "Справка · вкладки",
            "Руководство, О программе, Лицензия",
            "Руководство, Лицензия",
            "как A",
          ],
          [
            "Настройки · вкладки",
            "Среда, Интерфейс",
            "Среда, Интерфейс, О программе",
            "как A",
          ],
          [
            "7 авторов orcAI",
            "статья (MMS); отдельно 4 автора ПО",
            "статья (MMS); отдельно 4 автора ПО",
            "капсула «Движок»: оба списка",
          ],
          [
            "CC §3 + no endorsement",
            "одна полоса внизу",
            "сжатая карточка + отсылка в Справку",
            "всегда под внутренней парой",
          ],
          [
            "Deep link chrome «Справка»",
            "/help?tab=about",
            "/settings (вкладка about)",
            "/help?tab=about",
          ],
        ]}
      />

      <Text tone="secondary" size="small">
        Макеты PNG: docs/cursor-handoff/mockups/m-about-va-help.png,
        m-about-vb-settings.png, m-about-vc-inner.png. Исходник HTML:
        m-about-merge-variants.html?v=a|b|c
      </Text>
      <Text tone="tertiary" size="small">
        Вариант A внедрён: Справка — три вкладки; Настройки — Среда и
        Интерфейс, без «О программе».
      </Text>
    </Stack>
  );
}
