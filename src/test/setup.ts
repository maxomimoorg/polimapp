import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom: Blob/File senza arrayBuffer()/text() → polyfill tramite FileReader
function readBlob(blob: Blob, mode: "buffer" | "text"): Promise<ArrayBuffer | string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer | string);
    r.onerror = () => reject(r.error);
    if (mode === "buffer") r.readAsArrayBuffer(blob);
    else r.readAsText(blob);
  });
}
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return readBlob(this, "buffer") as Promise<ArrayBuffer>;
  };
}
if (!Blob.prototype.text) {
  Blob.prototype.text = function () {
    return readBlob(this, "text") as Promise<string>;
  };
}
