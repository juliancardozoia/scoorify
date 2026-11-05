"use client";

import { useMemo, useState, type ReactNode } from "react";
import { BotonCopiar } from "@/shared/components/BotonCopiar";
import { Icono } from "@/shared/components/Icono";
import { Selector } from "@/shared/components/Selector";
import { ConfirmarPago } from "@/features/pagos/components/ConfirmarPago";
import type { IntentoDePago } from "@/features/pagos/queries";
import type { FilaDeInscripcion } from "../queries";

/**
 * El padron de inscripciones del organizador: buscador, filtro de categoria,
 * filtro de estado y una fila compacta por inscripcion que se despliega.
 *
 * ANTES ERA UNA LISTA PLANA CON TODO ABIERTO. Cada fila pintaba los
 * integrantes, el precio y —si faltaba pagar— el formulario entero de
 * "Marcar como pagada". Con veinte inscriptos se leia; con cien era una
 * pared, y lo unico que el organizador viene a hacer casi siempre —revisar
 * los comprobantes que llegaron— quedaba mezclado entre noventa filas que no
 * piden nada.
 *
 * EL ESTADO ES UNO SOLO POR FILA (`estadoOperativo`). Antes una confirmada
 * mostraba DOS señales a la vez ("Listo para competir" + "Confirmada") y una
 * con pago pendiente no decia si el atleta ya habia mandado comprobante. Las
 * fichas del filtro y la pastilla de la fila salen del MISMO mapa, asi que lo
 * que se filtra es exactamente lo que se ve.
 *
 * "PAGO POR REVISAR" VA PRIMERO. Es la cola de trabajo real: alguien pago,
 * subio el comprobante y espera que la organizacion lo confirme. Es el unico
 * estado que depende del organizador y no del atleta.
 *
 * Filtrado del lado del cliente, igual que `GrillaDeAtletas`: el padron
 * completo de un evento (cientos de filas, no miles) ya viaja en la carga.
 */

export interface FilaDelPadron extends FilaDeInscripcion {
  /** Ya formateada en el huso del evento: en el cliente daria otra hora que
   *  en el servidor y React se quejaria de la hidratacion. */
  inscritoEl: string;
  /** Pagos reportados por el atleta y todavia sin confirmar. */
  intentos: IntentoDePago[];
}

type EstadoOperativo =
  | "por_revisar"
  | "falta_pagar"
  | "faltan_integrantes"
  | "datos_pendientes"
  | "lista"
  | "borrador"
  | "lista_espera"
  | "cancelada";

/** En el orden en que aparecen las fichas: primero lo que pide accion. */
const ESTADOS: Record<EstadoOperativo, { texto: string; pastilla: string; ficha: string }> = {
  por_revisar: {
    texto: "Pago por revisar",
    pastilla: "bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/40",
    ficha: "border-amber-400/60 text-amber-200",
  },
  falta_pagar: {
    texto: "Falta pagar",
    pastilla: "bg-amber-400/10 text-amber-300",
    ficha: "border-amber-400/40 text-amber-300",
  },
  faltan_integrantes: {
    texto: "Faltan integrantes",
    pastilla: "bg-amber-400/10 text-amber-300",
    ficha: "border-amber-400/40 text-amber-300",
  },
  datos_pendientes: {
    texto: "Confirmada · faltan datos",
    pastilla: "bg-sky-400/10 text-sky-300",
    ficha: "border-sky-400/40 text-sky-300",
  },
  lista: {
    texto: "Lista para competir",
    pastilla: "bg-lime-400/15 text-lime-300",
    ficha: "border-lime-400/50 text-lime-300",
  },
  borrador: {
    texto: "Sin enviar",
    pastilla: "bg-neutral-800 text-neutral-400",
    ficha: "border-neutral-700 text-neutral-400",
  },
  lista_espera: {
    texto: "En lista de espera",
    pastilla: "bg-neutral-800 text-neutral-300",
    ficha: "border-neutral-700 text-neutral-300",
  },
  cancelada: {
    texto: "Cancelada",
    pastilla: "bg-red-500/10 text-red-300",
    ficha: "border-red-500/40 text-red-300",
  },
};

const ORDEN_DE_ESTADOS = Object.keys(ESTADOS) as EstadoOperativo[];

function estadoOperativo(f: FilaDelPadron): EstadoOperativo {
  switch (f.status) {
    case "esperando_pago":
      return f.intentos.length > 0 ? "por_revisar" : "falta_pagar";
    case "esperando_integrantes":
      return "faltan_integrantes";
    case "confirmada":
      return f.readiness === "listo" ? "lista" : "datos_pendientes";
    case "borrador":
      return "borrador";
    case "lista_espera":
      return "lista_espera";
    default:
      return "cancelada";
  }
}

type Orden = "recientes" | "antiguas" | "nombre" | "dorsal";

const POR_PAGINA = 25;

function nombreDe(f: FilaDeInscripcion): string {
  return f.teamName ?? (f.integrantes[0]?.nombre || f.integrantes[0]?.email) ?? "Sin nombre";
}

function precio(cents: number | null, moneda: string | null): string {
  if (!cents) return "Sin costo";
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency: moneda ?? "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Las columnas de la grilla, compartidas por el encabezado y cada fila. */
const COLUMNAS =
  "md:grid md:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,11rem)_6.5rem_11.5rem_1rem] md:items-center md:gap-4";

export function PadronDeInscripciones({
  eventId,
  filas,
  divisiones,
}: {
  eventId: string;
  filas: FilaDelPadron[];
  divisiones: Array<{ id: string; name: string }>;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [estado, setEstado] = useState<EstadoOperativo | "">("");
  const [orden, setOrden] = useState<Orden>("recientes");
  const [pagina, setPagina] = useState(1);
  // Acordeon de a uno, como en el padron de atletas: diez detalles abiertos a
  // la vez son la misma pared de antes.
  const [expandida, setExpandida] = useState<string | null>(null);

  const conEstado = useMemo(
    () => filas.map((f) => ({ fila: f, estado: estadoOperativo(f) })),
    [filas],
  );

  // Los conteos de las fichas respetan la categoria y la busqueda, pero NO el
  // filtro de estado: si no, elegir una ficha dejaria a todas las demas en
  // cero y no se podria ver cuanto hay en cada una.
  const previos = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return conEstado.filter(({ fila }) => {
      if (divisionId && fila.divisionId !== divisionId) return false;
      if (!texto) return true;
      const campos = [
        fila.teamName ?? "",
        fila.bib !== null ? String(fila.bib) : "",
        ...fila.integrantes.flatMap((m) => [m.nombre, m.email]),
      ];
      return campos.some((c) => c.toLowerCase().includes(texto));
    });
  }, [conEstado, busqueda, divisionId]);

  const conteoPorEstado = useMemo(() => {
    const conteo = new Map<EstadoOperativo, number>();
    for (const { estado: e } of previos) conteo.set(e, (conteo.get(e) ?? 0) + 1);
    return conteo;
  }, [previos]);

  const conteoPorDivision = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const f of filas) conteo.set(f.divisionId, (conteo.get(f.divisionId) ?? 0) + 1);
    return conteo;
  }, [filas]);

  const filtradas = useMemo(() => {
    const lista = estado ? previos.filter((p) => p.estado === estado) : [...previos];
    lista.sort((a, b) => {
      switch (orden) {
        case "antiguas":
          return a.fila.createdAt.localeCompare(b.fila.createdAt);
        case "nombre":
          return nombreDe(a.fila).localeCompare(nombreDe(b.fila), "es", { sensitivity: "base" });
        case "dorsal":
          // Sin dorsal (todavia no confirmada) al final, no al principio.
          return (a.fila.bib ?? Number.MAX_SAFE_INTEGER) - (b.fila.bib ?? Number.MAX_SAFE_INTEGER);
        default:
          return b.fila.createdAt.localeCompare(a.fila.createdAt);
      }
    });
    return lista;
  }, [previos, estado, orden]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaValida = Math.min(pagina, totalPaginas);
  const desde = (paginaValida - 1) * POR_PAGINA;
  const visibles = filtradas.slice(desde, desde + POR_PAGINA);

  // Cambiar un filtro vuelve a la pagina 1: quedarse en la 3 de un resultado
  // nuevo muestra filas sin relacion con las que se estaban mirando.
  function filtrar(accion: () => void) {
    accion();
    setPagina(1);
  }

  const hayFiltros = busqueda !== "" || divisionId !== "" || estado !== "";

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de herramientas */}
      <div className="flex flex-col gap-2 md:flex-row">
        <div className="relative min-w-0 flex-1">
          <Icono
            nombre="buscar"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-500"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => filtrar(() => setBusqueda(e.target.value))}
            placeholder="Buscar por nombre, equipo, correo o dorsal…"
            aria-label="Buscar inscripción"
            className="h-10 w-full rounded-xl border border-neutral-700 bg-transparent pr-3 pl-9 text-sm outline-none focus:border-lime-400"
          />
        </div>
        {divisiones.length > 1 && (
          <Selector
            value={divisionId}
            onChange={(e) => filtrar(() => setDivisionId(e.target.value))}
            aria-label="Filtrar por categoría"
            className="h-10 text-sm md:w-64"
          >
            <option value="">Todas las categorías ({filas.length})</option>
            {divisiones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({conteoPorDivision.get(d.id) ?? 0})
              </option>
            ))}
          </Selector>
        )}
        <Selector
          value={orden}
          onChange={(e) => setOrden(e.target.value as Orden)}
          aria-label="Ordenar"
          className="h-10 text-sm md:w-44"
        >
          <option value="recientes">Más recientes</option>
          <option value="antiguas">Más antiguas</option>
          <option value="nombre">Nombre (A–Z)</option>
          <option value="dorsal">Dorsal</option>
        </Selector>
      </div>

      {/* Fichas de estado: filtro y resumen a la vez */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
        <FichaDeEstado
          activa={estado === ""}
          onClick={() => filtrar(() => setEstado(""))}
          clase="border-neutral-600 text-neutral-200"
        >
          Todas <span className="tabular-nums opacity-70">{previos.length}</span>
        </FichaDeEstado>
        {ORDEN_DE_ESTADOS.filter((e) => (conteoPorEstado.get(e) ?? 0) > 0 || estado === e).map(
          (e) => (
            <FichaDeEstado
              key={e}
              activa={estado === e}
              onClick={() => filtrar(() => setEstado(estado === e ? "" : e))}
              clase={ESTADOS[e].ficha}
            >
              {ESTADOS[e].texto}{" "}
              <span className="tabular-nums opacity-70">{conteoPorEstado.get(e) ?? 0}</span>
            </FichaDeEstado>
          ),
        )}
      </div>

      {filtradas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-500">
          Ninguna inscripción coincide con estos filtros.
          {hayFiltros && (
            <button
              type="button"
              onClick={() =>
                filtrar(() => {
                  setBusqueda("");
                  setDivisionId("");
                  setEstado("");
                })
              }
              className="text-lime-400 hover:underline"
            >
              Quitar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-800">
          <div
            className={`hidden border-b border-neutral-800 bg-neutral-900/60 px-4 py-2.5 text-xs font-medium text-neutral-500 uppercase ${COLUMNAS}`}
          >
            <span>Dorsal</span>
            <span>Atleta / equipo</span>
            <span>Categoría</span>
            <span className="text-right">Monto</span>
            <span>Estado</span>
            <span />
          </div>

          <ul className="divide-y divide-neutral-800/80">
            {visibles.map(({ fila, estado: e }) => (
              <FilaDeInscripcionDelPadron
                key={fila.id}
                fila={fila}
                estado={e}
                eventId={eventId}
                abierta={expandida === fila.id}
                alternar={() => setExpandida((a) => (a === fila.id ? null : fila.id))}
              />
            ))}
          </ul>
        </div>
      )}

      {filtradas.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 text-sm sm:flex-row">
          <span className="text-neutral-500">
            Mostrando {desde + 1}–{desde + visibles.length} de {filtradas.length}
            {filtradas.length !== filas.length && ` (${filas.length} en total)`}
          </span>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={paginaValida <= 1}
                className="rounded-xl border border-neutral-700 px-4 py-2 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Anterior
              </button>
              <span className="px-2 text-neutral-500 tabular-nums">
                {paginaValida} / {totalPaginas}
              </span>
              <button
                type="button"
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaValida >= totalPaginas}
                className="rounded-xl border border-neutral-700 px-4 py-2 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FichaDeEstado({
  activa,
  onClick,
  clase,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  clase: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        activa ? `${clase} bg-neutral-800` : "border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

function FilaDeInscripcionDelPadron({
  fila,
  estado,
  eventId,
  abierta,
  alternar,
}: {
  fila: FilaDelPadron;
  estado: EstadoOperativo;
  eventId: string;
  abierta: boolean;
  alternar: () => void;
}) {
  const esEquipo = fila.integrantes.length > 1 || fila.teamName !== null;
  const completos = fila.integrantes.filter((m) => m.completo).length;
  const sinWaiver = fila.integrantes.filter((m) => m.completo && !m.aceptoTerminos).length;
  const detalleId = `inscripcion-${fila.id}`;

  return (
    <li className={abierta ? "bg-neutral-900/40" : undefined}>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierta}
        aria-controls={detalleId}
        className={`flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-neutral-900/60 ${COLUMNAS}`}
      >
        <span className="hidden font-mono text-sm text-neutral-400 tabular-nums md:block">
          {fila.bib !== null ? `#${fila.bib}` : "—"}
        </span>

        <span className="flex min-w-0 flex-col">
          <span className="flex items-baseline gap-2">
            {fila.bib !== null && (
              <span className="font-mono text-sm text-neutral-400 tabular-nums md:hidden">
                #{fila.bib}
              </span>
            )}
            <span className="truncate font-medium">{nombreDe(fila)}</span>
          </span>
          <span className="truncate text-xs text-neutral-500">
            {esEquipo
              ? `${completos} de ${fila.integrantes.length} integrantes con datos`
              : (fila.integrantes[0]?.email ?? "")}
            {sinWaiver > 0 && <span className="text-red-400/80"> · waiver pendiente</span>}
          </span>
        </span>

        <span className="truncate text-sm text-neutral-400">{fila.divisionName}</span>

        <span className="text-sm text-neutral-400 tabular-nums md:text-right">
          {precio(fila.priceCents, fila.currency)}
        </span>

        <span>
          <span
            className={`inline-block rounded-lg px-2 py-0.5 text-xs font-medium whitespace-nowrap ${ESTADOS[estado].pastilla}`}
          >
            {ESTADOS[estado].texto}
          </span>
        </span>

        <Icono
          nombre="flecha"
          className={`hidden h-3 w-3 text-neutral-500 transition-transform md:block ${
            abierta ? "rotate-90" : ""
          }`}
        />
      </button>

      {abierta && (
        <div id={detalleId} className="flex flex-col gap-4 px-4 pt-1 pb-4 md:pl-[5.5rem]">
          <p className="text-xs text-neutral-500">Inscrita el {fila.inscritoEl}</p>

          <ul className="flex flex-col gap-2">
            {fila.integrantes.map((m) => (
              <li
                key={m.email}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-neutral-800 px-3 py-2 text-sm"
              >
                <span className="font-medium">{m.nombre || "Sin datos todavía"}</span>
                <span className="flex items-center gap-1 text-neutral-500">
                  {m.email}
                  {m.email && <BotonCopiar valor={m.email} titulo="Copiar correo" />}
                </span>
                <span className="ml-auto flex gap-2 text-xs">
                  {m.completo ? (
                    <span className="text-lime-400/80">Datos completos</span>
                  ) : (
                    <span className="text-amber-400/90">Faltan datos</span>
                  )}
                  {m.completo && !m.aceptoTerminos && (
                    <span className="text-red-400/80">Waiver pendiente</span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {fila.status === "esperando_pago" && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
              <p className="mb-2 text-xs font-medium text-amber-300 uppercase">
                {fila.intentos.length > 0 ? "El atleta reportó un pago" : "Pago pendiente"}
              </p>
              <ConfirmarPago registrationId={fila.id} eventId={eventId} intentos={fila.intentos} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
