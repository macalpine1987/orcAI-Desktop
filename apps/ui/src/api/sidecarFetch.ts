import { isTauri } from "../platform/tauri";
import { SIDECAR_FETCH_TIMEOUT_MS } from "../lib/timeouts";

export { SIDECAR_FETCH_TIMEOUT_MS };

const INSTALLED = Symbol.for("orcai.sidecarFetch");

export type SidecarExchangeRequest = {
  method: string;
  url: string;
  contentType: string | null;
  body: string | null;
  timeoutMs: number;
};

export type SidecarExchangeJson = {
  status: number;
  contentType?: string;
  bodyBase64: string;
};

type FetchDeps = {
  native: typeof fetch;
  tauri: boolean;
  exchange: (request: SidecarExchangeRequest) => Promise<SidecarExchangeJson | ArrayBuffer | ArrayBufferView>;
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function isSidecarLoopbackUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:") return false;
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

function headerValue(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null;
  return new Headers(headers).get(name);
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function withAbort<T>(signal: AbortSignal | null | undefined, work: Promise<T>): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

function bytesFromBase64(bodyBase64: string): Uint8Array {
  const bin = atob(bodyBase64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function asArrayBuffer(payload: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (payload instanceof ArrayBuffer) return payload;
  return payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
}

/** ORH1 frame or `{ status, contentType, bodyBase64 }`. The body is copied. */
export function responseFromSidecarExchange(
  payload: SidecarExchangeJson | ArrayBuffer | ArrayBufferView,
): Response {
  if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
    const buffer = asArrayBuffer(payload);
    if (buffer.byteLength < 8) throw new Error("short ORH1 frame");
    const magic = new Uint8Array(buffer, 0, 4);
    if (magic[0] !== 0x4f || magic[1] !== 0x52 || magic[2] !== 0x48 || magic[3] !== 0x31) {
      throw new Error("not an ORH1 frame");
    }
    const view = new DataView(buffer);
    const status = view.getUint16(4, true);
    const typeLen = view.getUint16(6, true);
    const bodyStart = 8 + typeLen;
    if (bodyStart > buffer.byteLength) throw new Error("truncated ORH1 frame");
    const contentType = new TextDecoder().decode(new Uint8Array(buffer, 8, typeLen));
    const body = new Uint8Array(buffer.slice(bodyStart));
    return responseFromParts(status, contentType, body);
  }
  const contentType = payload.contentType ?? "application/octet-stream";
  return responseFromParts(payload.status, contentType, bytesFromBase64(payload.bodyBase64));
}

function responseFromParts(status: number, contentType: string, body: Uint8Array): Response {
  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  return new Response(body, { status, headers });
}

export async function sidecarFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  deps: FetchDeps,
): Promise<Response> {
  const url = requestUrl(input);
  const body = init?.body;
  const stringBody = body == null || typeof body === "string";
  if (!deps.tauri || !isSidecarLoopbackUrl(url) || !stringBody) {
    return deps.native(input, init);
  }
  if (init?.signal?.aborted) throw abortError();
  const method = (init?.method ?? "GET").toUpperCase();
  const work = deps.exchange({
    method,
    url,
    contentType: headerValue(init?.headers, "content-type"),
    body: typeof body === "string" ? body : null,
    timeoutMs: SIDECAR_FETCH_TIMEOUT_MS,
  });
  const payload = await withAbort(init?.signal, work);
  return responseFromSidecarExchange(payload);
}

async function invokeExchange(request: SidecarExchangeRequest): Promise<SidecarExchangeJson> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SidecarExchangeJson>("sidecar_http_exchange", {
    method: request.method,
    url: request.url,
    contentType: request.contentType,
    body: request.body,
    timeoutMs: request.timeoutMs,
  });
}

/** Route loopback sidecar fetches through the Rust keep-alive pool. */
export function installSidecarFetchProxy(): void {
  if (typeof window === "undefined") return;
  const current = window.fetch as typeof fetch & { [INSTALLED]?: boolean };
  if (current[INSTALLED]) return;
  const native = current.bind(window);
  const wrapped = ((input: RequestInfo | URL, init?: RequestInit) =>
    sidecarFetch(input, init, {
      native,
      tauri: isTauri(),
      exchange: invokeExchange,
    })) as typeof fetch & { [INSTALLED]?: boolean };
  wrapped[INSTALLED] = true;
  window.fetch = wrapped;
}
