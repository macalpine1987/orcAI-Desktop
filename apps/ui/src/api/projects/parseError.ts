import {
  ProjectNameTakenError,
  type ProjectNameConflict,
} from "./types";

type ApiErrorDetail =
  | string
  | {
      code?: string;
      conflicts?: ProjectNameConflict[];
      message?: string;
    };

export async function parseError(res: Response): Promise<never> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { detail?: ApiErrorDetail };
    const detail = json.detail;
    if (
      res.status === 409 &&
      detail &&
      typeof detail === "object" &&
      detail.code === "project_name_conflict" &&
      Array.isArray(detail.conflicts)
    ) {
      throw new ProjectNameTakenError(detail.conflicts);
    }
    const message =
      typeof detail === "string"
        ? detail
        : (detail?.message ?? text);
    throw new Error(message || res.statusText);
  } catch (err) {
    if (err instanceof ProjectNameTakenError || err instanceof Error) {
      throw err;
    }
    throw new Error(text || res.statusText);
  }
}
