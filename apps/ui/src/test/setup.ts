import { beforeEach, vi } from "vitest";

const store = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  },
  get length() {
    return store.size;
  },
  key: (index: number) => [...store.keys()][index] ?? null,
};

vi.stubGlobal("localStorage", localStorageMock);

beforeEach(() => {
  store.clear();
});

class ResizeObserverMock {
  #cb: ResizeObserverCallback;

  constructor(cb: ResizeObserverCallback) {
    this.#cb = cb;
  }

  observe(target: Element) {
    const width = 400;
    const height = 200;
    this.#cb(
      [
        {
          contentRect: { width, height } as DOMRectReadOnly,
          target,
        } as ResizeObserverEntry,
      ],
      this,
    );
  }

  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
