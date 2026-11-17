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
  Row,
  Stack,
  Stat,
  Table,
  Text,
  useHostTheme,
} from "cursor/canvas";
import { useMemo, useState } from "react";

type Severity = "High" | "Medium" | "Low";

type Finding = {
  id: string;
  severity: Severity;
  before: string;
  after: string;
  title: string;
  evidence: string;
  status: "open" | "closed";
};

/** Deep refactor of residual large modules · 2026-11-13. */
const FINDINGS: Finding[] = [
  {
    id: "DR-01",
    severity: "High",
    before: "749",
    after: "223",
    title: "SpectrogramAudioPlayer",
    evidence:
      "useSpectrogramAudioPlayback + TransportBar + StudioControls + StudioPortals; 8/8 vitest.",
    status: "closed",
  },
  {
    id: "DR-02",
    severity: "High",
    before: "743",
    after: "394",
    title: "useTrainWizardDraft",
    evidence:
      "ProjectLoad / Equivalences / SnippetEstimate / Navigation / BrowsePath; same return keys.",
    status: "closed",
  },
  {
    id: "DR-03",
    severity: "High",
    before: "796",
    after: "353",
    title: "SidecarContext",
    evidence:
      "sidecarTypes + PortAndCapabilities + HealthPolling + ProcessControl; BOOT 750 / tick 500.",
    status: "closed",
  },
  {
    id: "DR-04",
    severity: "High",
    before: "749",
    after: "542",
    title: "jobs.py",
    evidence:
      "job_registry_state / job_logs / job_persist / job_plan_cancel; 17 jobs tests via suite 63 pass.",
    status: "closed",
  },
  {
    id: "DR-05",
    severity: "High",
    before: "773",
    after: "546",
    title: "train_pipeline.py",
    evidence:
      "pipeline_constants / step_params / step_status / inspect_inventory; 46 pipeline tests.",
    status: "closed",
  },
  {
    id: "DR-06",
    severity: "Medium",
    before: "681",
    after: "472",
    title: "usePredictPageState",
    evidence:
      "LocalState / RunDerived / PageActions; same 118-key bag.",
    status: "closed",
  },
  {
    id: "DR-07",
    severity: "Medium",
    before: "390 chrome",
    after: "275 chrome",
    title: "Spectrogram chrome prop-bag",
    evidence:
      "PlaybackPanel + ToolsPanel + buildSpectrogramChromeProps; bags stay grouped.",
    status: "closed",
  },
];

export default function TechnicalAuditDeepRefactor() {
  const theme = useHostTheme();
  const [openOnly, setOpenOnly] = useState(false);

  const openFindings = useMemo(
    () => FINDINGS.filter((f) => f.status === "open"),
    [],
  );

  const filtered = useMemo(
    () => (openOnly ? openFindings : FINDINGS),
    [openOnly, openFindings],
  );

  return (
    <Stack gap={20} style={{ padding: 20, maxWidth: 1100 }}>
      <Stack gap={6}>
        <H1>orcAI Desktop · deep refactor · residual modules</H1>
        <Text tone="secondary">
          Behavior-preserving splits · {new Date().toISOString().slice(0, 10)} ·
          Open = {openFindings.length}
        </Text>
      </Stack>

      <Grid columns={3} gap={12}>
        <Stat value={String(openFindings.length)} label="Open" />
        <Stat value={String(FINDINGS.length)} label="Modules" />
        <Stat value="0" label="Behavior breaks" tone="success" />
      </Grid>

      <Callout tone="success" title="Вердикт">
        Полный рефакторинг перечисленных residual-модулей закрыт. Публичные
        фасады сохранены; string-gates обновлены под новые файлы. tsc · ek7/8/12–
        14 · runtime · p12 · AudioPlayer 8/8 · jobs+pipeline pytest 63.
      </Callout>

      <Card>
        <CardHeader trailing={<Pill size="sm">{filtered.length} shown</Pill>}>
          Фильтр
        </CardHeader>
        <CardBody>
          <Row gap={8}>
            <Pill active={openOnly} onClick={() => setOpenOnly(true)}>
              Open only
            </Pill>
            <Pill active={!openOnly} onClick={() => setOpenOnly(false)}>
              Include closed
            </Pill>
          </Row>
        </CardBody>
      </Card>

      <H2>Modules</H2>
      <Table
        headers={["ID", "Sev", "Before→After", "Module", "Evidence"]}
        columnAlign={["left", "left", "left", "left", "left"]}
        rows={filtered.map((f) => [
          f.id,
          f.severity,
          `${f.before} → ${f.after}`,
          f.title,
          f.evidence,
        ])}
      />

      <Divider />

      <Grid columns={2} gap={16}>
        <Stack gap={8}>
          <H2>Проверки</H2>
          <Text size="small">tsc --noEmit · exit 0</Text>
          <Text size="small">vitest gates + AudioPlayer · 64/64</Text>
          <Text size="small">pytest jobs + train_pipeline · 63 passed</Text>
        </Stack>
        <Stack gap={8}>
          <H2>Остаток</H2>
          <Text
            size="small"
            tone="secondary"
            style={{ color: theme.fg.muted }}
          >
            SpectrogramViewer shell ~642 (сбор chrome-bags через
            buildSpectrogramChromeProps). Дальнейший thin — по желанию, не
            блокер.
          </Text>
        </Stack>
      </Grid>
    </Stack>
  );
}
