import { describe, expect, it, vi } from "vitest";
import { createBackGuard } from "../src/lib/backstack";

function setup(exitWindowMs = 2000) {
  const pushed: unknown[] = [];
  let listener: (() => void) | null = null;
  let clock = 1000;
  const onExitHint = vi.fn();
  const leave = vi.fn();
  const guard = createBackGuard({
    push: (state) => pushed.push(state),
    listen: (handler) => {
      listener = handler;
      return () => {
        listener = null;
      };
    },
    now: () => clock,
    onExitHint,
    leave,
    exitWindowMs,
  });
  return {
    guard,
    pushed,
    onExitHint,
    leave,
    back: () => listener?.(),
    tick: (ms: number) => {
      clock += ms;
    },
    listening: () => Boolean(listener),
  };
}

describe("createBackGuard", () => {
  it("deja una entrada trampa en el historial al registrar el primer manejador", () => {
    const ctx = setup();
    expect(ctx.pushed).toHaveLength(0);
    ctx.guard.register(() => false);
    expect(ctx.pushed).toHaveLength(1);
  });

  it("consume el manejador y vuelve a armar la trampa sin salir de la app", () => {
    const ctx = setup();
    const close = vi.fn(() => true);
    ctx.guard.register(close);
    ctx.back();
    expect(close).toHaveBeenCalledTimes(1);
    expect(ctx.pushed).toHaveLength(2);
    expect(ctx.onExitHint).not.toHaveBeenCalled();
  });

  it("respeta la prioridad: primero modales, luego navegacion", () => {
    const ctx = setup();
    const order: string[] = [];
    ctx.guard.register(() => {
      order.push("navegacion");
      return true;
    }, 1);
    ctx.guard.register(() => {
      order.push("modal");
      return true;
    }, 3);
    ctx.back();
    expect(order).toEqual(["modal"]);
  });

  it("sigue con el siguiente manejador cuando el de arriba no consume", () => {
    const ctx = setup();
    const order: string[] = [];
    ctx.guard.register(() => {
      order.push("navegacion");
      return true;
    }, 1);
    ctx.guard.register(() => {
      order.push("modal cerrado");
      return false;
    }, 3);
    ctx.back();
    expect(order).toEqual(["modal cerrado", "navegacion"]);
  });

  it("avisa y deja salir en la segunda pulsacion seguida", () => {
    const ctx = setup();
    ctx.guard.register(() => false);
    ctx.back();
    expect(ctx.onExitHint).toHaveBeenCalledTimes(1);
    expect(ctx.pushed).toHaveLength(2);

    ctx.back();
    expect(ctx.pushed).toHaveLength(2);
    expect(ctx.onExitHint).toHaveBeenCalledTimes(1);
    expect(ctx.leave).toHaveBeenCalledTimes(1);
  });

  it("vuelve a avisar si pasa mas tiempo del permitido", () => {
    const ctx = setup(2000);
    ctx.guard.register(() => false);
    ctx.back();
    ctx.tick(3000);
    ctx.back();
    expect(ctx.onExitHint).toHaveBeenCalledTimes(2);
    expect(ctx.pushed).toHaveLength(3);
    expect(ctx.leave).not.toHaveBeenCalled();
  });

  it("deja de consumir cuando se desregistra", () => {
    const ctx = setup();
    const close = vi.fn(() => true);
    const unregister = ctx.guard.register(close);
    unregister();
    ctx.back();
    expect(close).not.toHaveBeenCalled();
    expect(ctx.onExitHint).toHaveBeenCalledTimes(1);
  });
});
