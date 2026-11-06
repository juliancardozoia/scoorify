import Link from "next/link";
import { requireEventAccess } from "@/features/events/lib/access";
import { getInscripcionesDelEvento } from "@/features/inscripciones/queries";
import { ConfiguracionDeInscripciones } from "@/features/inscripciones/components/ConfiguracionDeInscripciones";
import {
  PadronDeInscripciones,
  type FilaDelPadron,
} from "@/features/inscripciones/components/PadronDeInscripciones";
import { getIntentosPendientesDelEvento, getOrdenesDelEvento } from "@/features/pagos/queries";
import { fechaHoraEnEvento } from "@/shared/utils/fecha";

export const dynamic = "force-dynamic";

type Vista = "inscritos" | "cobro";

/**
 * El monto SIN la moneda: el codigo ("COP") va aparte, mas chico, en el
 * indicador. Formateado entero —"12.750.000 COP" en text-2xl— no entraba en
 * una tarjeta de media pantalla en celular y se salia por el borde.
 */
function monto(cents: number): string {
  return new Intl.NumberFormat("es", { maximumFractionDigits: 0 }).format(cents / 100);
}

/**
 * Inscripciones: DOS trabajos distintos, en dos vistas.
 *
 * | Vista             | Cuando se usa                                          |
 * |-------------------|--------------------------------------------------------|
 * | Inscritos         | todos los dias mientras hay inscripciones abiertas     |
 * | Cobro y precios   | una vez al armar la competencia, y casi nunca despues  |
 *
 * Antes estaban apiladas en ese orden al reves: medios de cobro, precios y
 * codigos arriba —una pantalla entera de formularios— y el padron debajo. Con
 * cien inscriptos, llegar a revisar un comprobante era hacer scroll por la
 * configuracion cada vez. La vista va en la URL (`?vista=cobro`) y no en
 * estado: se comparte, el boton de atras funciona y se renderiza en el
 * servidor, mismo criterio que las pestañas de la ficha publica.
 *
 * Sin inscripciones todavia, la vista por defecto es la de cobro: es lo unico
 * que hay para hacer, y abrir en una lista vacia esconderia el siguiente paso.
 * Las "tres preguntas en orden" de la configuracion no cambian: siguen siendo
 * `ConfiguracionDeInscripciones`, la misma que usa el asistente.
 */
export default async function InscripcionesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const { id } = await params;
  const { vista: vistaPedida } = await searchParams;
  const { canManage, event } = await requireEventAccess(id);

  if (!canManage) {
    return (
      <p className="mt-6 rounded-2xl border border-neutral-800 p-6 text-sm text-neutral-400">
        Solo la organización ve las inscripciones.
      </p>
    );
  }

  const [inscripciones, ordenes, intentosPorOrden] = await Promise.all([
    getInscripcionesDelEvento(id),
    getOrdenesDelEvento(id),
    getIntentosPendientesDelEvento(id),
  ]);

  const vista: Vista =
    vistaPedida === "cobro" || vistaPedida === "inscritos"
      ? vistaPedida
      : inscripciones.length > 0
        ? "inscritos"
        : "cobro";

  const zona = event.timezone ?? "America/Bogota";
  const filas: FilaDelPadron[] = inscripciones.map((i) => {
    const orden = ordenes.get(i.id);
    return {
      ...i,
      inscritoEl: fechaHoraEnEvento(i.createdAt, zona),
      intentos: orden ? (intentosPorOrden.get(orden.id) ?? []) : [],
    };
  });

  // Las categorias salen de las mismas filas: el filtro solo ofrece las que
  // tienen al menos una inscripcion, que son las unicas que pueden filtrar algo.
  const divisiones = [
    ...new Map(filas.map((f) => [f.divisionId, { id: f.divisionId, name: f.divisionName }])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, "es"));

  const activas = filas.filter((f) => f.status !== "cancelada" && f.status !== "borrador");
  const confirmadas = filas.filter((f) => f.status === "confirmada");
  const listas = confirmadas.filter((f) => f.readiness === "listo").length;
  const porRevisar = filas.filter((f) => f.status === "esperando_pago" && f.intentos.length > 0)
    .length;
  const pendientes = filas.filter(
    (f) => f.status === "esperando_pago" || f.status === "esperando_integrantes",
  ).length;

  const pagadas = [...ordenes.values()].filter((o) => o.status === "pagada" && o.totalCents > 0);
  const moneda = pagadas[0]?.currency ?? event.currency ?? "COP";
  const recaudado = pagadas.reduce((suma, o) => suma + o.totalCents, 0);

  const base = `/panel/eventos/${id}/inscripciones`;

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Inscripciones</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Quién se anotó, qué le falta a cada uno y cómo se cobra.
        </p>
      </div>

      {filas.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador titulo="Inscritas" valor={activas.length} nota={`${filas.length} trámites en total`} />
          <Indicador
            titulo="Listas para competir"
            valor={listas}
            nota={`de ${confirmadas.length} confirmadas`}
            tono="lima"
          />
          <Indicador
            titulo="Pagos por revisar"
            valor={porRevisar}
            nota={porRevisar > 0 ? "Comprobantes esperando confirmación" : "Nada pendiente"}
            tono={porRevisar > 0 ? "ambar" : undefined}
          />
          {recaudado > 0 ? (
            <Indicador
              titulo="Recaudado"
              valor={monto(recaudado)}
              unidad={moneda}
              nota={`${pagadas.length} pagos confirmados`}
            />
          ) : (
            <Indicador titulo="Pendientes" valor={pendientes} nota="Falta pagar o completar equipo" />
          )}
        </dl>
      )}

      <nav className="flex gap-1 border-b border-neutral-800">
        <Pestana href={`${base}?vista=inscritos`} activa={vista === "inscritos"}>
          Inscritos <span className="text-neutral-500 tabular-nums">{filas.length}</span>
        </Pestana>
        <Pestana href={`${base}?vista=cobro`} activa={vista === "cobro"}>
          Cobro y precios
        </Pestana>
      </nav>

      {vista === "inscritos" ? (
        filas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-500">
            Todavía no se anotó nadie.{" "}
            <Link href={`${base}?vista=cobro`} className="text-lime-400 hover:underline">
              Revisa cómo se cobra
            </Link>{" "}
            mientras tanto.
          </div>
        ) : (
          <PadronDeInscripciones eventId={id} filas={filas} divisiones={divisiones} />
        )
      ) : (
        // La misma configuracion que el paso del asistente: una segunda copia
        // garantizaria que un dia ofrezcan cosas distintas.
        <ConfiguracionDeInscripciones eventId={id} />
      )}
    </div>
  );
}

function Indicador({
  titulo,
  valor,
  nota,
  tono,
  unidad,
}: {
  titulo: string;
  valor: number | string;
  nota: string;
  tono?: "lima" | "ambar";
  /** Moneda u otra unidad: va al lado del valor, chica, y baja de linea si no entra. */
  unidad?: string;
}) {
  const borde =
    tono === "ambar"
      ? "border-amber-400/40 bg-amber-400/5"
      : tono === "lima"
        ? "border-lime-400/25"
        : "border-neutral-800";
  const color = tono === "ambar" ? "text-amber-300" : tono === "lima" ? "text-lime-300" : "";

  return (
    // `min-w-0`: sin el, un valor largo estira la celda del grid en vez de
    // ajustarse a ella.
    <div className={`flex min-w-0 flex-col gap-1 rounded-2xl border p-4 ${borde}`}>
      <dt className="text-xs font-medium text-neutral-500 uppercase">{titulo}</dt>
      <dd
        className={`flex flex-wrap items-baseline gap-x-1.5 font-semibold tabular-nums ${color} ${
          unidad ? "text-xl sm:text-2xl" : "text-2xl"
        }`}
      >
        <span className="min-w-0 break-all">{valor}</span>
        {unidad && <span className="text-xs font-medium text-neutral-500">{unidad}</span>}
      </dd>
      <dd className="text-xs text-neutral-500">{nota}</dd>
    </div>
  );
}

function Pestana({
  href,
  activa,
  children,
}: {
  href: string;
  activa: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={activa ? "page" : undefined}
      className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors ${
        activa
          ? "border-lime-400 font-medium text-neutral-100"
          : "border-transparent text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {children}
    </Link>
  );
}
