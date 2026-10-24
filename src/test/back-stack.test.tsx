import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { __backStackDebug, __resetBackStack, useBackLayer } from "@/lib/back-stack";

function Layer({ name, onClose, children }: { name: string; onClose: () => void; children?: React.ReactNode }) {
  useBackLayer(true, onClose);
  return <div data-testid={name}>{children}</div>;
}

function App() {
  const opened = useRef(false);
  const [panel, setPanel] = useState(false);
  const [editor, setEditor] = useState(false);
  const [child, setChild] = useState(false);
  // apertura in sequenza, come nell'app: pannello, poi editor, poi popup figlio
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    setPanel(true);
    const a = setTimeout(() => setEditor(true), 10);
    const b = setTimeout(() => setChild(true), 40);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  return (
    <>
      {panel ? <Layer name="panel" onClose={() => setPanel(false)} /> : null}
      {editor ? (
        <Layer name="editor" onClose={() => setEditor(false)}>
          {child ? <Layer name="child" onClose={() => setChild(false)} /> : null}
          <button onClick={() => setChild(false)}>chiudi-figlio</button>
        </Layer>
      ) : null}
    </>
  );
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const openAll = async () => {
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
};
const back = () => act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });

describe("back stack", () => {
  let go: ReturnType<typeof vi.spyOn>;
  let startLen: number;
  beforeEach(() => {
    __resetBackStack();
    go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    startLen = window.history.length;
  });
  afterEach(() => go.mockRestore());

  it("each Back closes only the most recent layer, without calling history.go", async () => {
    const r = render(<App />);
    await openAll();
    expect(__backStackDebug().depth).toBe(3);
    expect(window.history.length).toBe(startLen + 3);

    back();
    await flush();
    expect(r.queryByTestId("child")).toBeNull();
    expect(r.getByTestId("editor")).toBeTruthy();
    expect(r.getByTestId("panel")).toBeTruthy();
    back();
    await flush();
    expect(r.queryByTestId("editor")).toBeNull();
    expect(r.getByTestId("panel")).toBeTruthy();
    back();
    await flush();
    expect(r.queryByTestId("panel")).toBeNull();
    expect(go).not.toHaveBeenCalled();
    expect(__backStackDebug().depth).toBe(0);
  });

  it("Back with nothing open is left to the browser", () => {
    back();
    expect(go).not.toHaveBeenCalled();
    expect(__backStackDebug().depth).toBe(0);
  });

  it("manual close removes its history entry once and the next Back closes the editor", async () => {
    const r = render(<App />);
    await openAll();
    act(() => r.getByText("chiudi-figlio").click());
    await flush();
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(-1);
    expect(__backStackDebug().depth).toBe(2);
    // il popstate prodotto da go(-1) viene ignorato
    back();
    expect(r.getByTestId("editor")).toBeTruthy();
    back();
    await flush();
    expect(r.queryByTestId("editor")).toBeNull();
    expect(r.getByTestId("panel")).toBeTruthy();
  });

  it("Escape closes only the top layer", async () => {
    const r = render(<App />);
    await openAll();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    await flush();
    expect(r.queryByTestId("child")).toBeNull();
    expect(r.getByTestId("editor")).toBeTruthy();
    expect(r.getByTestId("panel")).toBeTruthy();
  });

  it("re-renders do not add duplicate entries", async () => {
    const r = render(<App />);
    await openAll();
    r.rerender(<App />);
    r.rerender(<App />);
    await flush();
    expect(__backStackDebug().depth).toBe(3);
    expect(window.history.length).toBe(startLen + 3);
  });
});
