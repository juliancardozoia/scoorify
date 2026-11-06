"use client";

import { useMemo, useState } from "react";
import type { AtletaDeHeat, HeatConAtletas } from "../queries";
import { Icono } from "@/shared/components/Icono";
import { Bandera } from "@/shared/components/Bandera";
import { horaEnEvento } from "@/shared/utils/fecha";
import { localeDeIntl } from "@/shared/i18n/diccionario";
import type { Idioma } from "@/shared/i18n/idiomas";

/**
 * El cronograma, agrupado por DIA y despues por ARENA, y cada heat se
 * despliega para ver quien corre en cada carril.
 *
 * Una lista plana de horas no sirve el dia del evento. Lo que el atleta
 * necesita es "sábado, Pista principal, 9:40, Elite Masculino": dia para
 * ubicarse, arena para saber a donde caminar, hora para saber cuando, categoria
 * para saber si es suyo. Con tres escenarios en paralelo —el caso normal de un
 * CrossFit— una lista sin lugar es directamente inutil.
 *
 * Cuando hay UNA sola arena el agrupamiento por lugar desaparece: repetir
 * "Pista principal" veinte veces es ruido, no informacion.
 *
 * EL BUSCADOR es lo que hace usable la lista de atletas. Con cincuenta heats,
 * encontrarse abriendolos de a uno es imposible: escribir el nombre o el dorsal
 * deja solo los heats donde aparece, ya abiertos y con la fila resaltada.
 *
 * CADA HEAT ES UN `<details>` NATIVO, no un acordeon con estado: abre con
 * teclado y lector de pantalla sin codigo extra, y funciona aunque el
 * JavaScript todavia no haya cargado (que en el celular de un atleta con mala
 * señal en el box, pasa).
 *
 * TODAS LAS HORAS SON DEL HUSO DEL EVENTO. Un atleta argentino que mira una
 * competencia en Bogota tiene que ver la hora de Bogota: es la hora a la que
 * tiene que estar ahi. `horaEnEvento` es la unica forma de escribirlas; un
 * `toLocaleTimeString` suelto usa el huso del servidor, que en Vercel es UTC.
 */
export function PanelDeCronograma({
  heats,
  arenas,
  timezone,
  idioma,
}: {
  heats: HeatConAtletas[];
  arenas: string[];
  timezone: string;
  idioma: Idioma;
}) {
  const [consulta, setConsulta] = useState("");
  const termino = normalizar(consulta.trim());
  const buscando = termino.length > 0;
  const hayAtletas = heats.some((h) => h.athletes.length > 0);

  const visibles = useMemo(
    () => (buscando ? heats.filter((h) => h.athletes.some((a) => coincide(a, termino))) : heats),
    [heats, termino, buscando],
  );

  const dias = useMemo(() => agruparPorDia(visibles, timezone, idioma), [visibles, timezone, idioma]);
  const variasArenas = arenas.length > 1;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">Cronograma</h2>
          <p className="text-xs text-neutral-500">Horas locales de la competencia ({timezone})</p>
        </div>

        {hayAtletas && (
          <div className="flex flex-col gap-2">
            <label className="relative block">
              <span className="sr-only">Busca tu nombre o dorsal</span>
              <Icono
                nombre="buscar"
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-neutral-500"
              />
              <input
                type="search"
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Nombre o dorsal"
                autoComplete="off"
                enterKeyHint="search"
                // 16px en celular: con menos, iOS hace zoom al enfocar el campo.
                // La X nativa de type=search se esconde: la propia es mas grande
                // (un dedo, no un cursor) y tener dos botones de limpiar confunde.
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900 py-3 pr-11 pl-10 text-base text-neutral-100 placeholder:text-neutral-500 focus:border-lime-400/60 focus:outline-none sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
              />
              {buscando && (
                <button
                  type="button"
                  onClick={() => setConsulta("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute top-1/2 right-1.5 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                >
                  ✕
                </button>
              )}
            </label>
            {buscando ? (
              <p className="text-xs text-neutral-500" aria-live="polite">
                {visibles.length === 0
                  ? "Nadie coincide con esa búsqueda."
                  : `${visibles.length} heat${visibles.length === 1 ? "" : "s"} para «${consulta.trim()}»`}
              </p>
            ) : (
              <p className="text-xs text-neutral-500">Toca un heat para ver quién corre en cada carril.</p>
            )}
          </div>
        )}
      </div>

      {dias.map((dia) => (
        <section key={dia.clave} className="flex flex-col gap-4">
          <h3 className="flex items-center gap-2.5 text-sm font-semibold tracking-wide text-lime-300 uppercase">
            <Icono nombre="calendario" className="h-4 w-4" />
            {dia.titulo}
          </h3>

          {variasArenas ? (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {agruparPorArena(dia.heats).map((grupo) => (
                <div
                  key={grupo.arena}
                  className="overflow-hidden rounded-2xl border border-neutral-800"
                >
                  <p className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900/60 px-4 py-2.5 text-sm font-semibold">
                    <Icono nombre="lugar" className="h-4 w-4 text-neutral-500" />
                    {grupo.arena}
                  </p>
                  <ul className="divide-y divide-neutral-800">
                    {grupo.heats.map((h, i) => (
                      <Fila
                        key={`${buscando ? "b" : "n"}-${i}-${h.name}-${h.division}`}
                        heat={h}
                        timezone={timezone}
                        abierto={buscando}
                        termino={termino}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-neutral-800 overflow-hidden rounded-2xl border border-neutral-800">
              {dia.heats.map((h, i) => (
                <Fila
                  key={`${buscando ? "b" : "n"}-${i}-${h.name}-${h.division}`}
                  heat={h}
                  timezone={timezone}
                  abierto={buscando}
                  termino={termino}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function Fila({
  heat,
  timezone,
  abierto,
  termino,
}: {
  heat: HeatConAtletas;
  timezone: string;
  /** Buscando: todos los heats que quedan vienen abiertos. */
  abierto: boolean;
  termino: string;
}) {
  const inicio = heat.scheduledAt ? horaEnEvento(heat.scheduledAt, timezone).slice(0, 5) : "—";
  const fin = heat.scheduledEndAt ? horaEnEvento(heat.scheduledEndAt, timezone).slice(0, 5) : null;
  const cantidad = heat.athletes.length;

  const cabecera = (
    <>
      {/* La hora en ancho fijo y tabular: en una columna de veinte filas, los
          dígitos alineados dejan leer el ritmo del día de un vistazo. */}
      <div className="w-12 shrink-0 text-right sm:w-14">
        <p className="font-mono font-semibold text-neutral-100 tabular-nums">{inicio}</p>
        {fin && <p className="font-mono text-xs text-neutral-600 tabular-nums">{fin}</p>}
      </div>

      {/* El heat va AL LADO de la prueba y la categoria en su propia linea.
          Con "Heat 1 · Femenino Principiante" en una sola, en un celular la
          categoria baja de renglon y el punto queda colgado al final. */}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium break-words">{heat.workout ?? heat.name}</span>
          {heat.workout && <span className="text-sm text-neutral-500">{heat.name}</span>}
        </p>
        {heat.division && <p className="mt-0.5 text-sm text-neutral-400">{heat.division}</p>}
      </div>
    </>
  );

  // Un heat sin nadie asignado no se despliega: abrirlo para no encontrar nada
  // es un toque perdido.
  if (cantidad === 0) {
    return (
      <li className="flex items-start gap-4 px-4 py-3.5">
        {cabecera}
        <span className="shrink-0 pt-0.5 text-xs text-neutral-600">Sin atletas</span>
      </li>
    );
  }

  return (
    <li>
      <details className="group" open={abierto || undefined}>
        <summary className="flex cursor-pointer list-none items-start gap-4 px-4 py-3.5 transition-colors select-none hover:bg-neutral-900/50 focus-visible:bg-neutral-900/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          {cabecera}
          <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs text-neutral-400">
            <Icono nombre="personas" className="h-3.5 w-3.5" />
            <span className="tabular-nums">{cantidad}</span>
            <span className="sr-only">atletas, ver lista</span>
            <Icono
              nombre="flecha"
              className="ml-0.5 h-4 w-4 text-neutral-500 transition-transform group-open:rotate-90"
            />
          </span>
        </summary>

        <div className="border-t border-neutral-800/70 bg-neutral-950/50 px-4 pt-2 pb-3">
          <div className="flex items-center gap-3 py-1 text-[10px] font-semibold tracking-wider text-neutral-600 uppercase">
            <span className="w-11 shrink-0 text-center">Carril</span>
            <span className="flex-1">Atleta</span>
            <span className="shrink-0">Dorsal</span>
          </div>
          <ol className="flex flex-col">
            {heat.athletes.map((a) => (
              <FilaDeAtleta key={a.carril} atleta={a} resaltado={termino !== "" && coincide(a, termino)} />
            ))}
          </ol>
        </div>
      </details>
    </li>
  );
}

function FilaDeAtleta({ atleta, resaltado }: { atleta: AtletaDeHeat; resaltado: boolean }) {
  const nombres = atleta.integrantes.map((i) => i.nombre).join(" / ");
  const titulo = atleta.equipo ?? (nombres || (atleta.dorsal !== null ? `Dorsal ${atleta.dorsal}` : "—"));

  return (
    <li
      className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 ${
        resaltado ? "bg-lime-400/10 ring-1 ring-lime-400/30" : ""
      }`}
    >
      <span className="w-11 shrink-0 rounded-md bg-neutral-800 py-0.5 text-center font-mono text-xs font-semibold text-neutral-200 tabular-nums">
        {atleta.carril}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2">
          {!atleta.equipo &&
            atleta.integrantes.map((i, idx) => (
              <Bandera key={idx} codigo={i.pais} className="h-3 w-4 shrink-0" />
            ))}
          <span className={`truncate text-sm ${resaltado ? "font-semibold text-lime-100" : "text-neutral-200"}`}>
            {titulo}
          </span>
        </p>
        {/* En equipo: el nombre del equipo arriba y quienes lo forman debajo,
            cada uno con su bandera (una sola por equipo mentiria sobre la otra
            mitad de una dupla mixta). */}
        {atleta.equipo && atleta.integrantes.length > 0 && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500">
            {atleta.integrantes.map((i, idx) => (
              <span key={idx} className="flex items-center gap-1.5">
                <Bandera codigo={i.pais} className="h-2.5 w-3.5 shrink-0" />
                {i.nombre}
              </span>
            ))}
          </p>
        )}
      </div>

      <span className="shrink-0 font-mono text-xs text-neutral-500 tabular-nums">
        {atleta.dorsal !== null ? `#${atleta.dorsal}` : ""}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------

/** Sin mayusculas ni tildes: "jose" tiene que encontrar a "José". */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Un numero busca el DORSAL exacto (escribir "12" no tiene que traer al 112 ni
 * al 120); texto busca en el nombre del equipo y de cada integrante.
 */
function coincide(a: AtletaDeHeat, termino: string): boolean {
  if (/^#?\d+$/.test(termino)) {
    return a.dorsal !== null && String(a.dorsal) === termino.replace("#", "");
  }
  if (a.equipo && normalizar(a.equipo).includes(termino)) return true;
  return a.integrantes.some((i) => normalizar(i.nombre).includes(termino));
}

interface Dia {
  clave: string;
  titulo: string;
  heats: HeatConAtletas[];
}

/**
 * Agrupa por dia de calendario EN EL HUSO DEL EVENTO.
 *
 * Agrupar por la fecha UTC del timestamp parte mal el ultimo heat de la noche:
 * un heat a las 20:00 en Bogota es la 1:00 del dia siguiente en UTC y
 * apareceria bajo el domingo cuando corre el sabado.
 */
function agruparPorDia(heats: HeatConAtletas[], timezone: string, idioma: Idioma): Dia[] {
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

  const porDia = new Map<string, Dia>();

  for (const h of heats) {
    if (!h.scheduledAt) continue;
    const fecha = new Date(h.scheduledAt);
    const k = clave.format(fecha);

    if (!porDia.has(k)) {
      const nombre = titulo.format(fecha);
      porDia.set(k, {
        clave: k,
        titulo: nombre[0].toUpperCase() + nombre.slice(1),
        heats: [],
      });
    }
    porDia.get(k)!.heats.push(h);
  }

  return [...porDia.values()].sort((a, b) => a.clave.localeCompare(b.clave));
}

function agruparPorArena(
  heats: HeatConAtletas[],
): Array<{ arena: string; heats: HeatConAtletas[] }> {
  const porArena = new Map<string, HeatConAtletas[]>();
  for (const h of heats) {
    // Un heat sin arena asignada no se esconde: el organizador todavia no la
    // cargo y el atleta tiene que saber que ese heat existe.
    const nombre = h.arena ?? "Sin escenario asignado";
    if (!porArena.has(nombre)) porArena.set(nombre, []);
    porArena.get(nombre)!.push(h);
  }
  return [...porArena.entries()].map(([arena, heats]) => ({ arena, heats }));
}
