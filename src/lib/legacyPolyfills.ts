/**
 * Polyfills for legacy browsers (e.g. DJI RC Plus / RC Pro running Chromium 70).
 * No-op on modern browsers. Must be imported before pdf.js, React, etc.
 */

// Promise.withResolvers (ES2024) – used internally by pdfjs-dist v4+
type PromiseWithResolvers<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

type PromiseConstructorWithResolvers = PromiseConstructor & {
  withResolvers?: <T>() => PromiseWithResolvers<T>;
};

const PromiseCtor = Promise as PromiseConstructorWithResolvers;

if (typeof PromiseCtor.withResolvers !== "function") {
  PromiseCtor.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Array.prototype.at (ES2022) – safety net for older Chromium
if (typeof Array.prototype.at !== "function") {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, "at", {
    value: function (n: number) {
      const len = this.length;
      const idx = n < 0 ? len + n : n;
      return idx >= 0 && idx < len ? this[idx] : undefined;
    },
    writable: true,
    configurable: true,
  });
}

// String.prototype.at – same era as Array.prototype.at
if (typeof String.prototype.at !== "function") {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(String.prototype, "at", {
    value: function (n: number) {
      const len = this.length;
      const idx = n < 0 ? len + n : n;
      return idx >= 0 && idx < len ? this.charAt(idx) : undefined;
    },
    writable: true,
    configurable: true,
  });
}

// URL.parse (newer URL API) – used by recent pdf.js builds, missing in Chromium 70
type URLConstructorWithParse = typeof URL & {
  parse?: (url: string | URL, base?: string | URL) => URL | null;
};

if (typeof URL !== "undefined") {
  const URLCtor = URL as URLConstructorWithParse;
  if (typeof URLCtor.parse !== "function") {
    URLCtor.parse = function (url: string | URL, base?: string | URL) {
      try {
        return new URL(url, base);
      } catch {
        return null;
      }
    };
  }
}
    try {
      return new URL(url as string, base as string | undefined);
    } catch {
      return null;
    }
  };
}
