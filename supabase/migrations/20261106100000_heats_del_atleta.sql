-- El atleta no tenia forma de saber en que heat le toca.
--
-- El cronograma publico (`public_event_detail.schedule`) muestra los heats por
-- dia, arena y categoria, pero sin quien corre en cada uno. Y ninguna pantalla
-- del atleta ("Compito", su tramite, la vista por dorsal) consultaba
-- heats/lanes: tampoco hubiera podido, porque esas tablas se leen con
-- `puede_leer_evento()`, que es solo para STAFF. Una atleta de Femenino
-- Principiante veia "Grace: Heat 1, 2 y 3 en Box" y no podia saber a cual ir.
--
-- Dos funciones, las dos SECURITY DEFINER por la misma razon que
-- `judge_visible_lanes()`: hacen el join adentro y devuelven el dato ya armado,
-- sin abrir `athletes`/`lanes` por RLS (RLS es por fila, no por columna: abrir
-- `athletes` expondria documento, telefono y nacimiento).
--
-- `public_event_detail` NO se toca a proposito: la usan las cuatro pestañas de
-- la ficha publica, y meterle los atletas de cada heat le sumaria cientos de
-- filas a pestañas que no las muestran. La lista de cada heat solo la pide la
-- pestaña Cronograma.

-- ---------------------------------------------------------------------------
-- Mis heats: los del equipo de UNA inscripcion, solo si quien pregunta es
-- integrante de ella.
--
-- "Lo mio" se decide por ser INTEGRANTE (`registration_members.profile_id`),
-- nunca por `created_by`: el alta manual pone al organizador como created_by
-- de cada atleta que carga (ver getMisInscripciones).
--
-- Incluye los heats SIN hora ni arena: que el atleta sepa que ya tiene heat
-- asignado, aunque el horario siga "por confirmar", tambien es informacion.
-- ---------------------------------------------------------------------------
create or replace function public.mis_heats(p_registration_id uuid)
returns table (
  workout_name text,
  workout_order int,
  heat_name text,
  lane_number int,
  scheduled_at timestamptz,
  scheduled_end_at timestamptz,
  arena_name text,
  started_at timestamptz,
  ended_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    w.name::text,
    w.order_index::int,
    h.name::text,
    l.lane_number::int,
    h.scheduled_at,
    h.scheduled_end_at,
    a.name::text,
    h.started_at,
    h.ended_at
  from public.registrations r
  join public.teams t on t.id = r.team_id and t.status <> 'withdrawn'
  join public.lanes l on l.team_id = t.id
  join public.heats h on h.id = l.heat_id
  left join public.workouts w on w.id = h.workout_id
  left join public.arenas a on a.id = h.arena_id
  where r.id = p_registration_id
    and exists (
      select 1 from public.registration_members m
      where m.registration_id = r.id and m.profile_id = auth.uid()
    )
  order by h.scheduled_at nulls last, w.order_index nulls last, h.name;
$$;

-- ---------------------------------------------------------------------------
-- Quien corre en cada heat del cronograma publico: la "hoja de heats" que se
-- pega en la pared.
--
-- Mismo filtro que `public_event_detail.schedule` (evento publicado, heat con
-- hora) y mismo orden, asi la pestaña lista exactamente los mismos heats.
--
-- Expone lo mismo que `public_participants` —nombre, dorsal, pais— mas el
-- carril. Nada de correo, telefono, documento ni estado de pago.
-- ---------------------------------------------------------------------------
create or replace function public.public_heat_lineups(p_public_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', h.name,
    'scheduledAt', h.scheduled_at,
    'scheduledEndAt', h.scheduled_end_at,
    'arena', a.name,
    'division', d.name,
    'workout', w.name,
    'lanes', h.lane_count,
    'athletes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'carril', l.lane_number,
        'dorsal', t.bib_number,
        -- En individuales el equipo no tiene nombre: la UI muestra el del
        -- integrante. En una dupla, el nombre del equipo y debajo quienes lo
        -- forman.
        'equipo', nullif(trim(t.name), ''),
        'integrantes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'nombre', a2.first_name || ' ' || a2.last_name,
            'pais', a2.country
          ) order by a2.first_name)
          from public.team_members tm
          join public.athletes a2 on a2.id = tm.athlete_id
          where tm.team_id = t.id
        ), '[]'::jsonb)
      ) order by l.lane_number)
      from public.lanes l
      join public.teams t on t.id = l.team_id
      -- Un equipo retirado no aparece, igual que en la lista de largada.
      where l.heat_id = h.id and t.status <> 'withdrawn'
    ), '[]'::jsonb)
  ) order by h.scheduled_at nulls last, a.order_index nulls last, h.name), '[]'::jsonb)
  from public.events e
  join public.heats h on h.event_id = e.id and h.scheduled_at is not null
  left join public.workouts w on w.id = h.workout_id
  left join public.arenas a on a.id = h.arena_id
  left join public.divisions d on d.id = h.division_id
  where e.public_slug = p_public_slug and e.published_at is not null;
$$;

-- mis_heats -> solo authenticated; public_heat_lineups -> anon y authenticated.
select public.apply_function_lockdown();
