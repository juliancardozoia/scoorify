import { MarcoDelEvento, Vacio } from "@/features/catalogo/components/MarcoDelEvento";
import { PanelDeCronograma } from "@/features/catalogo/components/PanelDeCronograma";
import { getEventoPublico, getHeatsConAtletas } from "@/features/catalogo/queries";
import { traduccion } from "@/shared/i18n/servidor";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const evento = await getEventoPublico(slug);
  return { title: evento ? `Cronograma — ${evento.name}` : "Cronograma — Scoorify" };
}

export default async function CronogramaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [{ idioma }, conAtletas] = await Promise.all([traduccion(), getHeatsConAtletas(slug)]);

  return (
    <MarcoDelEvento slug={slug} activa="cronograma">
      {(evento) => {
        if (evento.schedule.length === 0) {
          return (
            <Vacio
              titulo="Todavía no hay cronograma"
              detalle="La organización publica los horarios cuando cierra las inscripciones y arma los heats."
            />
          );
        }

        // Si la lista de atletas no llego (la funcion fallo, o el deploy de la
        // app llego antes que la migracion), el cronograma se sigue mostrando
        // igual, sin desplegables: perder los horarios por no tener los
        // nombres seria cambiar lo esencial por un extra.
        const heats =
          conAtletas.length > 0
            ? conAtletas
            : evento.schedule.map((h) => ({ ...h, athletes: [] }));

        return (
          <PanelDeCronograma
            heats={heats}
            arenas={evento.arenas}
            timezone={evento.timezone}
            idioma={idioma}
          />
        );
      }}
    </MarcoDelEvento>
  );
}
