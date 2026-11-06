import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import type { LaneStatus } from "@/lib/supabase/types";
import { ordenarSegunCronograma } from "./lib/ordenDeCarriles";

/**
 * Si el boton "Juzgar" debe verse.
 *
 * `puede_juzgar()` replica el mismo gate que ya aplica `claim_lane`: staff
 * APROBADO de al menos un evento, y para el rol llano de juez, que esa
 * competencia no haya apagado la autoasignacion
 * (`events.allow_judge_self_claim`). Sin esto el boton aparecia en el menu de
 * cualquier cuenta logueada, la hubieran invitado a algo o no.
 */
export async function puedeJuzgar(): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.rpc("puede_juzgar");
  return data ?? false;
}

export interface JudgeLane {
  laneId: string;
  laneNumber: number;
  status: LaneStatus;
  bib: number | null;
  athletes: string;
  divisionName: string;
  heatId: string;
  heatName: string;
  /** La prueba que corre este carril. Con una sola en el evento no se muestra. */
  workoutName: string;
  /** `workouts.order_index`: desempata dos heats a la misma hora. */
  workoutOrder: number | null;
  heatStartedAt: string | null;
  /** Hora programada en el cronograma. Null si el heat todavia no tiene hora. */
  heatScheduledAt: string | null;
  /** El escenario donde corre el heat. Vacio si el evento no usa arenas. */
  arenaName: string;
  /** Huso del evento: la hora se muestra en hora de pared de la competencia. */
  eventTimezone: string;
  eventId: string;
  eventName: string;
  judgeId: string | null;
  /** true si lo tomo otro juez. */
  tomadoPorOtro: boolean;
}

/**
 * `judge_visible_lanes()` reemplaza el `.from("lanes").select("... teams
 * (... athletes (...))")` que habia aca. No es solo por el PGRST200 de
 * siempre (`lanes` no tiene FK directa a `events`): es que ese embed abria
 * `athletes` por RLS de TABLA para poder mostrar el nombre, y RLS es por
 * fila, no por columna -- un juez de UN evento con `select=*` por la API
 * hubiera podido leer la fecha de nacimiento y el documento de cualquier
 * atleta de la competencia, no solo el nombre que la pantalla necesita. La
 * funcion arma el nombre ADENTRO (donde si puede leer esas tablas) y
 * devuelve el string ya armado.
 */
interface Row {
  lane_id: string;
  lane_number: number;
  status: LaneStatus;
  judge_id: string | null;
  event_id: string;
  event_name: string | null;
  event_status: string | null;
  event_timezone: string | null;
  team_id: string | null;
  bib_number: number | null;
  team_name: string | null;
  division_name: string | null;
  athletes: string | null;
  heat_id: string;
  heat_name: string;
  heat_started_at: string | null;
  heat_scheduled_at: string | null;
  arena_name: string | null;
  workout_name: string | null;
  workout_order: number | null;
}

function mapear(row: Row, userId: string): JudgeLane {
  return {
    laneId: row.lane_id,
    laneNumber: row.lane_number,
    status: row.status,
    bib: row.bib_number,
    athletes: row.athletes || row.team_name || "Sin atleta",
    divisionName: row.division_name ?? "",
    heatId: row.heat_id,
    heatName: row.heat_name,
    workoutName: row.workout_name ?? "",
    workoutOrder: row.workout_order,
    heatStartedAt: row.heat_started_at,
    heatScheduledAt: row.heat_scheduled_at,
    arenaName: row.arena_name ?? "",
    eventTimezone: row.event_timezone ?? "America/Bogota",
    eventId: row.event_id,
    eventName: row.event_name ?? "",
    judgeId: row.judge_id,
    tomadoPorOtro: row.judge_id !== null && row.judge_id !== userId,
  };
}

/**
 * Carriles visibles para el juez: los suyos primero, despues los libres.
 *
 * RLS ya limita a los eventos de sus organizaciones, asi que no hace falta
 * filtrar por evento aca.
 */
export interface LanesResult {
  mios: JudgeLane[];
  libres: JudgeLane[];
  /**
   * Por que no hay nada para mostrar. Sin esto la pantalla decia "no hay
   * carriles disponibles" y el organizador no tenia forma de saber que le
   * faltaba poner la competencia en vivo.
   */
  motivo:
    | null
    | "sin-organizacion"
    | "sin-eventos"
    | "eventos-en-borrador"
    | "sin-carriles"
    | "carriles-sin-atleta"
    | "todos-tomados";
}

export async function getJudgeLanes(): Promise<LanesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { mios: [], libres: [], motivo: "sin-organizacion" };

  // Se traen TODOS los carriles, incluso los que no tienen equipo, para poder
  // distinguir "no armaste los heats" de "los armaste pero sin atletas".
  const [{ data }, { count: eventosTotales }] = await Promise.all([
    supabase.rpc("judge_visible_lanes"),
    supabase.from("events").select("id", { count: "exact", head: true }),
  ]);

  if (!data) {
    return {
      mios: [],
      libres: [],
      motivo: (eventosTotales ?? 0) === 0 ? "sin-eventos" : "sin-carriles",
    };
  }

  const filas = data as Row[];

  // Un evento en borrador todavia se esta configurando: mostrarlo solo
  // confundiria al juez con carriles que pueden cambiar.
  const enJuego = filas.filter((r) => r.event_status === "ready" || r.event_status === "live");
  const conAtleta = enJuego.filter((r) => r.team_id !== null);
  const todos = conAtleta.map((r) => mapear(r, user.id));

  const mios = ordenarSegunCronograma(todos.filter((l) => l.judgeId === user.id));
  const libres = ordenarSegunCronograma(todos.filter((l) => l.judgeId === null));

  let motivo: LanesResult["motivo"] = null;
  if (mios.length === 0 && libres.length === 0) {
    if ((eventosTotales ?? 0) === 0) motivo = "sin-eventos";
    else if (enJuego.length === 0 && filas.length === 0) motivo = "sin-carriles";
    else if (enJuego.length === 0) motivo = "eventos-en-borrador";
    else if (conAtleta.length === 0) motivo = "carriles-sin-atleta";
    else motivo = "todos-tomados";
  }

  return { mios, libres, motivo };
}
