-- La lista de carriles del juez sigue el CRONOGRAMA, no el nombre del heat.
--
-- Hasta aca `getJudgeLanes()` ordenaba por evento y despues por el NUMERO del
-- nombre del heat. Con dos arenas en simultaneo y varias categorias, cada
-- prueba y cada categoria numeran sus heats desde 1 (ver
-- `unique (event_id, workout_id, division_id, name)`): un juez con ocho
-- carriles veia cuatro "Heat 1" seguidos, de pruebas y horas distintas, y
-- tenia que leerlos todos para saber cual le tocaba ahora.
--
-- La funcion ahora devuelve lo que hace falta para ordenar y ubicarse:
-- la hora programada del heat, la arena, el orden de la prueba y el huso del
-- evento (la hora se pinta en hora de PARED del evento, nunca en la del
-- servidor). El orden se aplica en `queries.ts`.
--
-- Cambia el tipo de retorno, asi que `create or replace` no alcanza: hay que
-- borrar la funcion y crearla de nuevo.

drop function if exists public.judge_visible_lanes();

create function public.judge_visible_lanes()
returns table (
  lane_id uuid,
  lane_number int,
  status public.lane_status,
  judge_id uuid,
  event_id uuid,
  event_name text,
  event_status public.event_status,
  event_timezone text,
  team_id uuid,
  bib_number int,
  team_name text,
  division_name text,
  athletes text,
  heat_id uuid,
  heat_name text,
  heat_started_at timestamptz,
  heat_scheduled_at timestamptz,
  arena_name text,
  workout_name text,
  workout_order int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    l.id, l.lane_number, l.status, l.judge_id, l.event_id, e.name, e.status, e.timezone,
    l.team_id, t.bib_number, t.name, d.name,
    (
      select string_agg(a.first_name || ' ' || a.last_name, ' / ' order by a.last_name)
      from public.team_members tm
      join public.athletes a on a.id = tm.athlete_id
      where tm.team_id = t.id
    ),
    h.id, h.name, h.started_at, h.scheduled_at, ar.name, w.name, w.order_index
  from public.lanes l
  join public.heats h on h.id = l.heat_id
  join public.events e on e.id = l.event_id
  left join public.arenas ar on ar.id = h.arena_id
  left join public.workouts w on w.id = l.workout_id
  left join public.teams t on t.id = l.team_id
  left join public.divisions d on d.id = t.division_id
  where (public.event_role(l.event_id) is not null or public.event_staff_role(l.event_id) is not null)
    and not coalesce(
      (select r.status in ('finished', 'dnf', 'dq') from public.results r where r.lane_id = l.id),
      false
    )
    and not (
      exists (select 1 from public.workout_scores ws where ws.lane_id = l.id)
      and not exists (
        select 1 from public.workout_scores ws
        where ws.lane_id = l.id and ws.status not in ('valido', 'capeado', 'dnf', 'dq')
      )
    )
  order by h.scheduled_at nulls last, w.order_index nulls last, l.lane_number;
$$;

select public.apply_function_lockdown();
