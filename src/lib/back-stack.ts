import { useEffect, useId, useRef } from "react";

/**
 * Gestore centrale del tasto Indietro (Android/PWA) e di Esc.
 * Ogni popup/pannello aperto è un "livello" con una voce di cronologia propria
 * (pushState senza cambiare URL, preservando history.state). Indietro o Esc
 * chiudono solo il livello più recente; senza livelli il browser agisce normalmente.
 */
type Layer = { id: string; close: () => void };

const MARK = "__polimappLayer";
const stack: Layer[] = [];
let pendingBack = 0; // voci da togliere dopo chiusure manuali
let ignorePops = 0; // popstate generati da noi stessi
let scheduled = false;
let installed = false;

function withMark(id: string) {
  const prev = window.history.state;
  const base = prev && typeof prev === "object" ? prev : {};
  return { ...base, [MARK]: id };
}

function onPopState() {
  if (ignorePops > 0) {
    ignorePops--;
    return;
  }
  const top = stack.pop();
  // la voce è già stata consumata dal browser: niente history.back()
  top?.close();
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || stack.length === 0) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  stack[stack.length - 1]?.close();
}

export function installBackStack() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("popstate", onPopState);
  window.addEventListener("keydown", onKeyDown, true);
}

function flush() {
  scheduled = false;
  const n = pendingBack;
  pendingBack = 0;
  if (n > 0) {
    ignorePops++;
    window.history.go(-n);
  }
}

export function registerLayer(id: string, close: () => void) {
  installBackStack();
  const existing = stack.find((l) => l.id === id);
  if (existing) {
    existing.close = close;
    return;
  }
  stack.push({ id, close });
  if (pendingBack > 0) {
    // riusa la voce lasciata libera da una chiusura nello stesso ciclo
    pendingBack--;
    window.history.replaceState(withMark(id), "", window.location.href);
  } else {
    window.history.pushState(withMark(id), "", window.location.href);
  }
}

export function unregisterLayer(id: string) {
  const i = stack.findIndex((l) => l.id === id);
  if (i === -1) return; // già chiuso da popstate
  stack.splice(i, 1);
  pendingBack++;
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(flush);
  }
}

/** Registra un livello finché `active` è vero; si rimuove alla chiusura o allo smontaggio. */
export function useBackLayer(active: boolean, onClose: () => void) {
  const id = useId();
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    registerLayer(id, () => ref.current());
    return () => unregisterLayer(id);
  }, [active, id]);
}

/** Solo per i test. */
export function __backStackDebug() {
  return { depth: stack.length, pendingBack, ignorePops };
}
export function __resetBackStack() {
  stack.length = 0;
  pendingBack = 0;
  ignorePops = 0;
  scheduled = false;
}
