import { beforeEach, vi } from "vitest";

const localStore = new Map<string, string>();
const sessionStore = new Map<string, string>();

function storageMock(store: Map<string, string>): Storage {
  return {
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
}

vi.stubGlobal("localStorage", storageMock(localStore));
vi.stubGlobal("sessionStorage", storageMock(sessionStore));

beforeEach(() => {
  localStore.clear();
  sessionStore.clear();
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
