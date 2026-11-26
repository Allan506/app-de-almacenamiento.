import { useEffect, useRef } from "react";

/** Devuelve true si la accion de "atras" se ha consumido dentro de la app. */
export type BackHandler = () => boolean;

export type BackGuardDeps = {
  push: (state: unknown) => void;
  listen: (handler: () => void) => () => void;
  now: () => number;
  onExitHint: () => void;
  /** Se llama cuando el usuario confirma la salida con la segunda pulsacion. */
  leave?: () => void;
  exitWindowMs?: number;
};

type Entry = { handler: BackHandler; priority: number };

const TRAP_STATE = { nube: "back-guard" };

/**
 * Tapon de historial: deja siempre una entrada extra delante de la app, de modo que
 * el boton "atras" del telefono no cierre la app; primero deshace lo que haya abierto.
 */
export function createBackGuard(deps: BackGuardDeps) {
  const entries: Entry[] = [];
  const exitWindowMs = deps.exitWindowMs ?? 2000;
  let armed = false;
  let lastExitHintAt = Number.NEGATIVE_INFINITY;

  const arm = () => {
    if (armed) return;
    deps.push({ ...TRAP_STATE });
    armed = true;
  };

  const register = (handler: BackHandler, priority = 0) => {
    const entry: Entry = { handler, priority };
    entries.push(entry);
    arm();
    return () => {
      const index = entries.indexOf(entry);
      if (index >= 0) entries.splice(index, 1);
    };
  };

  const handleBack = () => {
    armed = false;
    const ordered = entries.map((entry, index) => ({ entry, index }));
    ordered.sort((a, b) => a.entry.priority - b.entry.priority || a.index - b.index);

    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      if (ordered[index].entry.handler()) {
        arm();
        return;
      }
    }

    const now = deps.now();
    if (now - lastExitHintAt <= exitWindowMs) {
      deps.leave?.();
      return;
    }
    lastExitHintAt = now;
    arm();
    deps.onExitHint();
  };

  return { arm, register, handleBack, dispose: deps.listen(handleBack) };
}

type Guard = ReturnType<typeof createBackGuard>;

let guard: Guard | null = null;
let exitHint: (() => void) | null = null;

/** Solo tiene sentido en el telefono o en la app instalada; en escritorio el atras navega. */
export function shouldGuardHistory(): boolean {
  if (typeof window === "undefined") return false;
  const touch = navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)").matches;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(touch || standalone);
}

function getGuard(): Guard | null {
  if (typeof window === "undefined" || !shouldGuardHistory()) return null;
  if (!guard) {
    guard = createBackGuard({
      push: (state) => window.history.pushState(state, ""),
      listen: (handler) => {
        window.addEventListener("popstate", handler);
        return () => window.removeEventListener("popstate", handler);
      },
      now: () => Date.now(),
      onExitHint: () => exitHint?.(),
      leave: () => window.history.back(),
    });
  }
  return guard;
}

/** Texto que se muestra al pulsar atras cuando ya no hay nada que cerrar. */
export function setBackExitHint(hint: (() => void) | null): void {
  exitHint = hint;
}

/** Prioridad alta = se consume antes (modales, cajones) frente a la navegacion. */
export function useBackHandler(handler: BackHandler, priority = 0): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const unregister = getGuard()?.register(() => latest.current(), priority);
    return () => unregister?.();
  }, [priority]);
}
