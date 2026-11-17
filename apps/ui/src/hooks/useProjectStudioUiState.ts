import { useState } from "react";
import { type ProjectsTabId } from "../lib/projectsStudio";

/**
 * Studio chrome: tab, next-steps panel, table column/row selection.
 */
export function useProjectStudioUiState() {
  const [tab, setTab] = useState<ProjectsTabId>("recordings");
  const [showNextSteps, setShowNextSteps] = useState(true);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  return {
    tab,
    setTab,
    showNextSteps,
    setShowNextSteps,
    showAllColumns,
    setShowAllColumns,
    selectedRows,
    setSelectedRows,
  };
}
