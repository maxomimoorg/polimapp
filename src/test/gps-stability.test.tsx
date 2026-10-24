import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import L from "leaflet";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapView from "@/components/map/MapView";

vi.mock("@/components/map/basemap", () => ({
  createOnlineController: () => ({ dispose: vi.fn(), setTheme: vi.fn() }),
}));

let deliver: PositionCallback | undefined;
let fail: PositionErrorCallback | null | undefined;
const clearWatch = vi.fn();
const setView = vi.spyOn(L.Map.prototype, "setView");
const moveMarker = vi.spyOn(L.Marker.prototype, "setLatLng");
let map: L.Map | undefined;

async function activate() {
  fireEvent.click(await screen.findByLabelText("Mostra la mia posizione"));
}

function fix(latitude: number, accuracy = 50) {
  if (!deliver) throw new Error("GPS watch not active");
  act(() => deliver?.({
    coords: { latitude, longitude: 12.5, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(),
  } as GeolocationPosition));
}

beforeEach(async () => {
  deliver = undefined;
  fail = undefined;
  clearWatch.mockClear();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success: PositionCallback, error?: PositionErrorCallback | null) => {
        deliver = success;
        fail = error;
        return 7;
      }),
      clearWatch,
    },
  });
  render(<MapView bookmarks={[]} photoUrls={{}} categoriesById={{}} colorOf={() => ""}
    onCreate={vi.fn()} onOpen={vi.fn()} onMove={vi.fn()} onReady={vi.fn()} categoryOrder={[]} />);
  await waitFor(() => expect(screen.getByLabelText("Mostra la mia posizione")).toBeInTheDocument());
map = setView.mock.contexts.at(-1) as L.Map | undefined;
  setView.mockClear();
  moveMarker.mockClear();
  await activate();
});

afterEach(() => {
  cleanup();
  map = undefined;
});

describe("GPS stable auto-centering", () => {
  it("requires two consecutive fixes with accuracy at most 50 m", () => {
    fix(42.6, 50.01);
    fix(42.6, 50);
    expect(setView).not.toHaveBeenCalled();
    fix(42.6, 50);
    expect(setView).toHaveBeenCalledExactlyOnceWith([42.6, 12.5], 16);
  });

  it("accepts distances up to 30 m but restarts stability above 30 m", () => {
    if (!map) throw new Error("Map not initialized");
    const distance = vi.spyOn(map, "distance").mockReturnValueOnce(30.01).mockReturnValueOnce(30);
    fix(42.6);
    fix(42.6003);
    expect(setView).not.toHaveBeenCalled();
    fix(42.6004);
    expect(setView).toHaveBeenCalledExactlyOnceWith([42.6004, 12.5], 16);
    distance.mockRestore();
  });

  it.each([51, NaN, Infinity])("resets the consecutive count on invalid accuracy %s", (accuracy) => {
    fix(42.6);
    fix(42.6, accuracy);
    fix(42.6);
    expect(setView).not.toHaveBeenCalled();
    fix(42.6);
    expect(setView).toHaveBeenCalledTimes(1);
  });

  it("updates the pointer on inaccurate fixes and never re-centers after the first stable pair", () => {
    fix(42.6);
    fix(42.7, 100);
    expect(moveMarker).toHaveBeenLastCalledWith([42.7, 12.5]);
    expect(setView).not.toHaveBeenCalled();
    fix(42.6);
    fix(42.6);
    fix(43, 100);
    fix(43);
    fix(43);
    expect(moveMarker).toHaveBeenLastCalledWith([43, 12.5]);
    expect(setView).toHaveBeenCalledTimes(1);
  });

  it("preserves a current zoom higher than 16", () => {
    if (!map) throw new Error("Map not initialized");
    map.setView([42.6, 12.5], 18);
    setView.mockClear();
    fix(42.6);
    fix(42.6);
    expect(setView).toHaveBeenCalledExactlyOnceWith([42.6, 12.5], 18);
  });

  it("allows one new centering after switching GPS off and back on", async () => {
    fix(42.6);
    fix(42.6);
    await activate();
    expect(clearWatch).toHaveBeenCalledWith(7);
    await activate();
    setView.mockClear();
    fix(43);
    expect(setView).not.toHaveBeenCalled();
    fix(43);
    fix(44);
    expect(setView).toHaveBeenCalledExactlyOnceWith([43, 12.5], 16);
  });

  it("resets stability after a GPS error", async () => {
    fix(42.6);
    act(() => fail?.({ code: 2, POSITION_UNAVAILABLE: 2 } as GeolocationPositionError));
    expect(clearWatch).toHaveBeenCalledWith(7);
    await activate();
    fix(42.6);
    expect(setView).not.toHaveBeenCalled();
    fix(42.6);
    expect(setView).toHaveBeenCalledTimes(1);
  });
});
