/** Route helpers for Lab keep-alive host (Predict / Results). */

export function isPredictPath(pathname: string): boolean {
  return pathname === "/predict" || pathname.startsWith("/predict/");
}

export function isResultsPath(pathname: string): boolean {
  return pathname === "/results" || pathname.startsWith("/results/");
}
