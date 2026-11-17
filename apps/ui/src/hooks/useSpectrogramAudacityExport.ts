import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { exportAudacityLabels } from "../api/labels";
import { isTauri } from "../platform/tauri";
import { downloadTextFile } from "../lib/downloadBlob";
import { formatUserFacingErrorRequired } from "../lib/userFacingError";

type Args = {
  labelPath: string | null | undefined;
  wavPath: string;
  channel: number;
  orcaiParameter: string | null | undefined;
};

export function useSpectrogramAudacityExport({
  labelPath,
  wavPath,
  channel,
  orcaiParameter,
}: Args) {
  const { t } = useTranslation();
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const onExportAudacity = useCallback(async () => {
    if (!labelPath) return;
    setExporting(true);
    setExportMsg(null);
    try {
      let outputPath: string | undefined;
      if (isTauri()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const dest = await save({
          defaultPath: `${labelPath.replace(/\.txt$/i, "")}_audacity.txt`,
          filters: [{ name: "Audacity labels", extensions: ["txt"] }],
        });
        if (!dest) {
          setExporting(false);
          return;
        }
        outputPath = dest;
      }
      const result = await exportAudacityLabels({
        labelPath,
        wavPath,
        channel,
        orcaiParameter: orcaiParameter ?? undefined,
        outputPath,
      });
      if (result.output_path) {
        setExportMsg(result.output_path);
      } else if (result.content) {
        downloadTextFile(
          result.content,
          result.suggested_name ?? "labels_audacity.txt",
        );
        setExportMsg(t("spectrogram.exportDownloaded"));
      }
    } catch (err) {
      setExportMsg(formatUserFacingErrorRequired(err, t));
    } finally {
      setExporting(false);
    }
  }, [labelPath, wavPath, channel, orcaiParameter, t]);

  return { exportMsg, setExportMsg, exporting, onExportAudacity };
}
