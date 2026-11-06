import { describe, expect, it } from "vitest";
import { ordenarSegunCronograma, type CarrilOrdenable } from "./ordenDeCarriles";

function carril(
  id: string,
  heatName: string,
  heatScheduledAt: string | null,
  extra: Partial<CarrilOrdenable> = {},
): CarrilOrdenable & { id: string } {
  return {
    id,
    eventName: "RomanoFest",
    heatName,
    heatScheduledAt,
    workoutOrder: 0,
    laneNumber: 1,
    ...extra,
  };
}

const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe("ordenarSegunCronograma", () => {
  it("sigue la hora del cronograma, no el numero del heat", () => {
    // Cada prueba y cada categoria numera sus heats desde 1: por nombre, los
    // tres "Heat 1" quedaban juntos aunque corran a horas distintas.
    const lista = [
      carril("mi-h1", "Heat 1", "2026-11-07T13:30:00Z"),
      carril("fp-h2", "Heat 2", "2026-11-07T13:15:00Z"),
      carril("fp-h1", "Heat 1", "2026-11-07T13:00:00Z"),
      carril("mp-h1-tarde", "Heat 1", "2026-11-07T14:45:00Z"),
    ];
    expect(ids(ordenarSegunCronograma(lista))).toEqual(["fp-h1", "fp-h2", "mi-h1", "mp-h1-tarde"]);
  });

  it("los heats sin hora van al final, ordenados por numero (10 despues de 2)", () => {
    const lista = [
      carril("sin-10", "Heat 10", null),
      carril("con-hora", "Heat 3", "2026-11-07T13:00:00Z"),
      carril("sin-2", "Heat 2", null),
    ];
    expect(ids(ordenarSegunCronograma(lista))).toEqual(["con-hora", "sin-2", "sin-10"]);
  });

  it("a la misma hora desempata por orden de la prueba y despues por carril", () => {
    const hora = "2026-11-07T13:00:00Z";
    const lista = [
      carril("bear-c2", "Heat 1", hora, { workoutOrder: 2, laneNumber: 2 }),
      carril("grace-c5", "Heat 1", hora, { workoutOrder: 0, laneNumber: 5 }),
      carril("bear-c1", "Heat 1", hora, { workoutOrder: 2, laneNumber: 1 }),
      carril("grace-c3", "Heat 1", hora, { workoutOrder: 0, laneNumber: 3 }),
    ];
    expect(ids(ordenarSegunCronograma(lista))).toEqual(["grace-c3", "grace-c5", "bear-c1", "bear-c2"]);
  });

  it("agrupa por evento antes que por hora", () => {
    const lista = [
      carril("b-temprano", "Heat 1", "2026-11-07T12:00:00Z", { eventName: "Zeta" }),
      carril("a-tarde", "Heat 1", "2026-11-07T18:00:00Z", { eventName: "Alfa" }),
    ];
    expect(ids(ordenarSegunCronograma(lista))).toEqual(["a-tarde", "b-temprano"]);
  });
});
