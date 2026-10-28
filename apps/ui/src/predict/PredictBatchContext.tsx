import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PredictBatchProgress = {
  done: number;
  total: number;
};

type PredictBatchContextValue = {
  batchRunning: boolean;
  batchProgress: PredictBatchProgress | null;
  startBatch: (total: number) => void;
  updateBatchProgress: (done: number, total?: number) => void;
  endBatch: () => void;
};

const PredictBatchContext = createContext<PredictBatchContextValue | null>(null);

export function PredictBatchProvider({ children }: { children: ReactNode }) {
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] =
    useState<PredictBatchProgress | null>(null);

  const startBatch = useCallback((total: number) => {
    setBatchRunning(true);
    setBatchProgress({ done: 0, total });
  }, []);

  const updateBatchProgress = useCallback((done: number, total?: number) => {
    setBatchProgress((prev) => ({
      done,
      total: total ?? prev?.total ?? done,
    }));
  }, []);

  const endBatch = useCallback(() => {
    setBatchRunning(false);
    setBatchProgress(null);
  }, []);

  const value = useMemo(
    () => ({
      batchRunning,
      batchProgress,
      startBatch,
      updateBatchProgress,
      endBatch,
    }),
    [batchRunning, batchProgress, startBatch, updateBatchProgress, endBatch],
  );

  return (
    <PredictBatchContext.Provider value={value}>
      {children}
    </PredictBatchContext.Provider>
  );
}

export function usePredictBatch(): PredictBatchContextValue {
  const ctx = useContext(PredictBatchContext);
  if (!ctx) {
    throw new Error("usePredictBatch requires PredictBatchProvider");
  }
  return ctx;
}

export function usePredictBatchOptional(): PredictBatchContextValue | null {
  return useContext(PredictBatchContext);
}
