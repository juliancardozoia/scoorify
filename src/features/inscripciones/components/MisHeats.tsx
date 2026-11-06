import Link from "next/link";
import { Icono } from "@/shared/components/Icono";
import { horaEnEvento } from "@/shared/utils/fecha";
import { localeDeIntl } from "@/shared/i18n/diccionario";
import type { Idioma } from "@/shared/i18n/idiomas";
import type { MiHeat } from "../queries";

/**
 * "¿A que hora, donde y en que carril me toca?" — la pregunta del dia del
 * evento, contestada sin que el atleta tenga que buscarse en el cronograma.
 *
 * Cada fila responde las cuatro cosas en el orden en que se leen con apuro:
 * HORA (grande, a la izquierda, alineada en columna), la prueba, heat + carril,
 * y la arena (a donde caminar). Agrupado por dia porque una competencia de dos
 * dias sin el dia arriba deja dos "09:00" sin distinguir.
 *
 * EL PROXIMO HEAT SE RESALTA. Es el primero —en orden de horario— que no
 * termino: no depende del reloj del servidor, asi que un heat demorado sigue
 * siendo "el proximo" hasta que corre, que es lo correcto.
 *
 * Un heat sin hora no se esconde: tener heat asignado con horario "por
 * confirmar" tambien es informacion (y evita que el atleta crea que lo
 * dejaron afuera).
 */
export function MisHeats({
  heats,
  timezone,
  idioma,
  eventSlug,
}: {
  heats: MiHeat[];
  timezone: string;
  idioma: Idioma;
  eventSlug: string;
}) {
  const proximo = heats.find((h) => !h.endedAt && (h.startedAt || h.scheduledAt));
  const grupos = agruparPorDia(heats, timezone, idioma);

  return (
    <section className="rounded-2xl border border-neutral-800 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold tracking-widest text-neutral-500 uppercase">
          Mis heats
        </h3>
        <Link
          href={`/eventos/${eventSlug}/cronograma`}
          className="text-xs text-lime-400 hover:underline"
        >
          Cronograma completo →
        </Link>
      </div>

      {heats.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
          Todavía no tienes heat asignado. Aparece aquí apenas la organización arme los heats.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          {grupos.map((g) => (
            <div key={g.clave} className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                <Icono nombre={g.clave === SIN_HORA ? "reloj" : "calendario"} className="h-3.5 w-3.5" />
                {g.titulo}
              </p>
              <ul className="flex flex-col gap-2">
                {g.heats.map((h, i) => (
                  <FilaDeHeat
                    key={`${h.workout}-${h.heat}-${i}`}
                    heat={h}
                    timezone={timezone}
                    esProximo={h === proximo}
                  />
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-neutral-600">Horas locales de la competencia ({timezone}).</p>
        </div>
      )}
    </section>
  );
}

function FilaDeHeat({
  heat,
  timezone,
  esProximo,
}: {
  heat: MiHeat;
  timezone: string;
  esProximo: boolean;
}) {
  const inicio = heat.scheduledAt ? horaEnEvento(heat.scheduledAt, timezone).slice(0, 5) : "—";
  const fin = heat.scheduledEndAt ? horaEnEvento(heat.scheduledEndAt, timezone).slice(0, 5) : null;
  const enCurso = Boolean(heat.startedAt && !heat.endedAt);
  const terminado = Boolean(heat.endedAt);

  return (
    <li
      className={`flex gap-3.5 rounded-xl border p-3.5 sm:gap-5 ${
        esProximo
          ? "border-lime-400/40 bg-lime-400/5"
          : terminado
            ? "border-neutral-900 opacity-60"
            : "border-neutral-800"
      }`}
    >
      {/* Ancho fijo y tabular: en una columna de varias filas, las horas
          alineadas dejan leer el dia de un vistazo. */}
      <div className="w-12 shrink-0 pt-0.5 sm:w-14">
        <p
          className={`font-mono text-lg leading-none font-bold tabular-nums ${
            heat.scheduledAt ? "text-neutral-50" : "text-neutral-600"
          }`}
        >
          {inicio}
        </p>
        {fin && <p className="mt-1.5 font-mono text-xs text-neutral-500 tabular-nums">{fin}</p>}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 font-semibold break-words text-neutral-100">
            {heat.workout ?? heat.heat}
          </p>
          {enCurso ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-lime-400/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-lime-300 uppercase">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-400" />
              En curso
            </span>
          ) : terminado ? (
            <span className="shrink-0 rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-neutral-400 uppercase">
              Terminado
            </span>
          ) : esProximo ? (
            <span className="shrink-0 rounded-full border border-lime-400/40 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-lime-300 uppercase">
              Próximo
            </span>
          ) : null}
        </div>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">
          <span>{heat.heat}</span>
          <span className="rounded-md bg-neutral-800 px-1.5 py-0.5 text-xs font-semibold text-neutral-100">
            Carril {heat.carril}
          </span>
        </p>

        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-neutral-500">
          <Icono nombre="lugar" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{heat.arena ?? "Escenario por confirmar"}</span>
        </p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

const SIN_HORA = "~sin-hora";

/**
 * Por dia de calendario EN EL HUSO DEL EVENTO (agrupar por fecha UTC partiria
 * mal un heat de la noche). Los heats sin hora van al final, en su propio
 * grupo: la consulta ya los ordena `nulls last`.
 */
function agruparPorDia(
  heats: MiHeat[],
  timezone: string,
  idioma: Idioma,
): Array<{ clave: string; titulo: string; heats: MiHeat[] }> {
  const clave = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const titulo = new Intl.DateTimeFormat(localeDeIntl(idioma), {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const grupos = new Map<string, { clave: string; titulo: string; heats: MiHeat[] }>();
  for (const h of heats) {
    let k = SIN_HORA;
    let t = "Horario por confirmar";
    if (h.scheduledAt) {
      const fecha = new Date(h.scheduledAt);
      k = clave.format(fecha);
      const nombre = titulo.format(fecha);
      t = nombre[0].toUpperCase() + nombre.slice(1);
    }
    if (!grupos.has(k)) grupos.set(k, { clave: k, titulo: t, heats: [] });
    grupos.get(k)!.heats.push(h);
  }
  // Orden explicito: "sin hora" al final. Un localeCompare sobre la clave lo
  // pondria PRIMERO (la colacion ordena los signos antes que los digitos).
  return [...grupos.values()].sort((a, b) =>
    a.clave === SIN_HORA ? 1 : b.clave === SIN_HORA ? -1 : a.clave < b.clave ? -1 : 1,
  );
}
