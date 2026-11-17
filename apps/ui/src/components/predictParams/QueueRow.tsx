import { useTranslation } from "react-i18next";
import type { PredictQueueFile } from "../../workspace/predictQueue";
import { statusKey, statusTone } from "./predictParamsHelpers";

export function QueueRow({
  file,
  channel,
  selected,
  active,
  disabled,
  onSelectActive,
  onToggleBatchSelect,
}: {
  file: PredictQueueFile;
  channel: number;
  selected: boolean;
  active: boolean;
  disabled?: boolean;
  onSelectActive: (name: string) => void;
  onToggleBatchSelect: (name: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <tr
      className={
        active
          ? "is-active"
          : file.status === "running"
            ? "is-running"
            : undefined
      }
      onClick={() => onSelectActive(file.name)}
    >
      <td className="pp-queue-td-check" onClick={(e) => e.stopPropagation()}>
        <label className="pp-queue-check">
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled}
            onChange={() => onToggleBatchSelect(file.name)}
            aria-label={file.name}
          />
          <span className="pp-queue-check-box" aria-hidden />
        </label>
      </td>
      <td className="pp-queue-td-file" title={file.path}>
        <span className="pp-queue-file-name">{file.name}</span>
      </td>
      <td className="pp-queue-td-ch">{channel}</td>
      <td className="pp-queue-td-status">
        <span className={`pp-status ${statusTone(file.status)}`}>
          <span className="pp-status-dot" aria-hidden />
          {t(statusKey(file.status))}
        </span>
      </td>
    </tr>
  );
}
