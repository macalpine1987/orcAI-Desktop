import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  isSidecarLoopbackUrl,
  responseFromSidecarExchange,
  sidecarFetch,
  type SidecarExchangeRequest,
} from "./sidecarFetch";

function orh1(status: number, type: string, body: Uint8Array): ArrayBuffer {
  const typeBytes = new TextEncoder().encode(type);
  const buf = new ArrayBuffer(8 + typeBytes.length + body.length);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  bytes.set([0x4f, 0x52, 0x48, 0x31], 0);
  view.setUint16(4, status, true);
  view.setUint16(6, typeBytes.length, true);
  bytes.set(typeBytes, 8);
  bytes.set(body, 8 + typeBytes.length);
  return buf;
}

describe("responseFromSidecarExchange", () => {
  it("decodes an ORH1 frame and copies the body", async () => {
    const frame = orh1(404, "text/plain", new TextEncoder().encode("ab"));
    const res = responseFromSidecarExchange(frame);
    new Uint8Array(frame)[8 + "text/plain".length] = 0x58;
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(await res.text()).toBe("ab");
  });

  it("decodes a base64 JSON body including a zero byte", async () => {
    const res = responseFromSidecarExchange({
      status: 200,
      contentType: "application/octet-stream",
      bodyBase64: btoa(String.fromCharCode(0, 255)),
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes]).toEqual([0, 255]);
  });
});

describe("sidecarFetch", () => {
  it("sends loopback JSON through the exchange and leaves other URLs on fetch", async () => {
    const native = vi.fn(async () => new Response("native"));
    const exchange = vi.fn(async (_request: SidecarExchangeRequest) => ({
      status: 201,
      contentType: "application/json",
      bodyBase64: btoa('{"ok":true}'),
    }));
    const deps = { native, tauri: true, exchange };

    const sidecar = await sidecarFetch(
      "http://127.0.0.1:8742/v1/jobs",
      {
        method: "post",
        headers: { "Content-Type": "application/json" },
        body: '{"a":1}',
      },
      deps,
    );
    expect(sidecar.status).toBe(201);
    expect(await sidecar.json()).toEqual({ ok: true });
    expect(exchange).toHaveBeenCalledWith({
      method: "POST",
      url: "http://127.0.0.1:8742/v1/jobs",
      contentType: "application/json",
      body: '{"a":1}',
      timeoutMs: 300_000,
    });

    await sidecarFetch("https://example.com/tile", undefined, deps);
    expect(native).toHaveBeenCalledTimes(1);
    expect(isSidecarLoopbackUrl("http://localhost:1/health")).toBe(true);
    expect(isSidecarLoopbackUrl("https://127.0.0.1/health")).toBe(false);
  });

  it("uses window fetch when the shell is not Tauri", async () => {
    const native = vi.fn(async () => new Response("dev"));
    const exchange = vi.fn();
    const res = await sidecarFetch("http://127.0.0.1:8742/health", undefined, {
      native,
      tauri: false,
      exchange,
    });
    expect(await res.text()).toBe("dev");
    expect(exchange).not.toHaveBeenCalled();
  });

  it("rejects an aborted call before the exchange", async () => {
    const exchange = vi.fn();
    await expect(
      sidecarFetch("http://127.0.0.1:8742/health", { signal: AbortSignal.abort() }, {
        native: vi.fn(),
        tauri: true,
        exchange,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(exchange).not.toHaveBeenCalled();
  });

  it("rejects when the signal aborts while the exchange is still running", async () => {
    const controller = new AbortController();
    let release: (value: { status: number; bodyBase64: string }) => void = () => {};
    const exchange = vi.fn(
      () =>
        new Promise<{ status: number; bodyBase64: string }>((resolve) => {
          release = resolve;
        }),
    );
    const pending = sidecarFetch("http://127.0.0.1:8742/health", { signal: controller.signal }, {
      native: vi.fn(),
      tauri: true,
      exchange,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    release({ status: 200, bodyBase64: "" });
  });
});

describe("job events", () => {
  it("stays on EventSource", () => {
    const src = readFileSync(new URL("../lib/jobEventStream.ts", import.meta.url), "utf8");
    expect(src).toContain("new EventSource");
    expect(src).not.toContain("sidecar_http_exchange");
    expect(src).not.toContain("sidecarFetch");
  });
});
