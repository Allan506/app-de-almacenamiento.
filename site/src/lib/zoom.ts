import { useCallback, useState } from "react";

const KEY = "nube-lite.zoom-lock";
const VIEWPORT_FREE = "width=device-width, initial-scale=1.0, viewport-fit=cover";
const VIEWPORT_LOCKED =
  "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";

let locked = true;
let listening = false;

export function readZoomLock(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Fija el zoom del navegador. iOS ignora `user-scalable=no`, asi que ademas se
 * cancelan sus gestos de pellizco y se limita `touch-action` por CSS.
 */
export function applyZoomLock(enabled: boolean): void {
  locked = enabled;
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    /* Sin almacenamiento: se aplica solo en esta sesion. */
  }
  if (typeof document === "undefined") return;

  document
    .querySelector<HTMLMetaElement>('meta[name="viewport"]')
    ?.setAttribute("content", enabled ? VIEWPORT_LOCKED : VIEWPORT_FREE);
  document.documentElement.classList.toggle("zoom-locked", enabled);

  if (listening) return;
  listening = true;
  const block = (event: Event) => {
    if (locked) event.preventDefault();
  };
  for (const type of ["gesturestart", "gesturechange"]) {
    document.addEventListener(type, block, { passive: false });
  }
}

export function useZoomLock(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(readZoomLock);
  const toggle = useCallback((next: boolean) => {
    applyZoomLock(next);
    setEnabled(next);
  }, []);
  return [enabled, toggle];
}
