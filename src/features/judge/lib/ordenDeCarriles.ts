import type { JudgeLane } from "../queries";

/** Lo minimo que hace falta para ordenar. Puro: sin Supabase, se prueba solo. */
export type CarrilOrdenable = Pick<
  JudgeLane,
  "eventName" | "heatScheduledAt" | "workoutOrder" | "heatName" | "laneNumber"
>;

/**
 * El numero de heat, para ordenar numericamente y no alfabeticamente.
 *
 * `heats.name` es texto libre ("Heat 1", "Heat 2", ..., "Heat 10"): ordenado
 * como string, "Heat 10" cae entre "Heat 1" y "Heat 2". Sin numero se manda al
 * final, no al principio -- un heat sin numero en el nombre no es "el
 * primero".
 */
function numeroDeHeat(nombre: string): number {
  const m = nombre.match(/(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

/** Un valor ausente va al FINAL, no al principio: sin hora no es "el primero". */
function ascNulosAlFinal(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * En el orden del CRONOGRAMA: por evento, hora programada, orden de la prueba,
 * numero de heat y carril. Es lo que hace que un juez que se sale de la app y
 * vuelve se ubique de un vistazo.
 *
 * Antes se ordenaba solo por el numero del nombre del heat, y eso dejaba de
 * servir apenas una competencia tiene mas de una prueba o mas de una
 * categoria: cada una numera sus heats desde 1, asi que un juez con ocho
 * carriles veia cuatro "Heat 1" seguidos, de horas y arenas distintas. La hora
 * programada es lo unico que pone a todos en el orden en que corren; el
 * numero del heat queda para los heats que todavia no tienen hora.
 */
export function ordenarSegunCronograma<T extends CarrilOrdenable>(lanes: T[]): T[] {
  const hora = (l: T) => (l.heatScheduledAt ? Date.parse(l.heatScheduledAt) : null);
  return [...lanes].sort(
    (a, b) =>
      a.eventName.localeCompare(b.eventName) ||
      ascNulosAlFinal(hora(a), hora(b)) ||
      ascNulosAlFinal(a.workoutOrder, b.workoutOrder) ||
      numeroDeHeat(a.heatName) - numeroDeHeat(b.heatName) ||
      a.laneNumber - b.laneNumber,
  );
}
