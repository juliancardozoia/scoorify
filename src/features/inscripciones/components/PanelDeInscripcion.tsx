"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  enviarInscripcion,
  guardarMisDatos,
  invitarIntegrante,
  type FormState,
} from "../actions";
import { MensajeDeError } from "@/shared/components/MensajeDeError";
import type { CampoDelFormulario } from "../queries";
import {
  textoDeEstado,
  claseDePastilla,
  mensajeDeReadiness,
  type Readiness,
} from "../lib/estados";
import type {
  RegistrationMemberRow,
  RegistrationRow,
} from "@/lib/supabase/types";
import { BloqueDePago } from "@/features/pagos/components/BloqueDePago";
import type { PagoDeInscripcion } from "@/features/pagos/queries";
import { Boton, claseDeBoton } from "@/shared/components/Boton";
import { BotonCopiar } from "@/shared/components/BotonCopiar";
import { BotonDeEnvio } from "@/shared/components/BotonDeEnvio";
import { useCarga } from "@/shared/components/Carga";
import { useNotificaciones } from "@/shared/components/Notificaciones";
import { CamposDeAtleta } from "./CamposDeAtleta";
import { CancelarInscripcion } from "./CancelarInscripcion";

/**
 * El panel del trámite: quién falta, qué falta y el botón de enviar.
 *
 * El estado de una inscripción es la pregunta que la gente hace cinco veces
 * antes de una competencia ("¿ya quedamos anotados?"), así que la pantalla lo
 * contesta arriba de todo y en una sola línea.
 */

const campo =
  "w-full rounded-xl border border-neutral-700 bg-transparent px-4 py-3 outline-none focus:border-lime-400";

export function PanelDeInscripcion({
  registro,
  integrantes,
  teamSize,
  tallas,
  campos,
  documentos,
  miId,
  soyCapitan,
  posicionesSinCorreo,
  pago,
  readiness,
  slugDelEvento,
}: {
  registro: RegistrationRow;
  integrantes: RegistrationMemberRow[];
  teamSize: number;
  tallas: string[];
  campos: CampoDelFormulario[];
  documentos: Array<{ name: string; url: string; requiresAcceptance: boolean }>;
  miId: string | null;
  soyCapitan: boolean;
  /** Lugares cuyo correo la plataforma ya no puede usar: hay que avisar por fuera. */
  posicionesSinCorreo: number[];
  pago: PagoDeInscripcion;
  readiness: Readiness;
  /** Para volver a inscribirse cuando este tramite quedo cancelado. */
  slugDelEvento: string;
}) {
  const [pendiente, startTransition] = useTransition();
  const { activar, desactivar } = useCarga();
  const { exito, error: avisarError } = useNotificaciones();

  const yo = integrantes.find((m) => m.id === miId) ?? null;
  const faltan = integrantes.filter((m) => m.status !== "completo").length;
  const equipoCompleto = integrantes.length === teamSize && faltan === 0;
  const cerrada =
    registro.status === "confirmada" || registro.status === "cancelada";
  const mensajeReadiness = mensajeDeReadiness(registro.status, readiness);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${claseDePastilla(registro.status)}`}
        >
          {textoDeEstado(registro.status)}
        </span>
        {mensajeReadiness && (
          <span
            className={`text-sm font-medium ${
              readiness === "listo" ? "text-lime-400" : "text-amber-400"
            }`}
          >
            {readiness === "listo" ? "✓ " : "○ "}
            {mensajeReadiness}
          </span>
        )}
      </div>

      {/* Cancelada: NO se ofrece pagar. Habia una orden, asi que el bloque de
          pago se seguia mostrando y un atleta que cancelo sin querer pago y
          subio el comprobante sin ningun aviso. `reportar_pago_manual` tambien
          lo rechaza: esto es para que el "no" llegue antes de pagar. */}
      {registro.status === "cancelada" && (
        <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-neutral-300">
          <p className="font-medium text-red-300">Esta inscripción está cancelada.</p>
          <p className="mt-1">
            No hagas ningún pago sobre ella. Si quieres participar, inscríbete de nuevo.
          </p>
          <Link
            href={`/eventos/${slugDelEvento}/inscripcion`}
            className={`${claseDeBoton({ variante: "primary", compacto: true })} mt-3 inline-flex`}
          >
            Inscribirme de nuevo
          </Link>
        </div>
      )}

      {registro.status !== "cancelada" &&
        (registro.status === "esperando_pago" || pago.orden !== null) && (
        <BloqueDePago
          registrationId={registro.id}
          orden={pago.orden}
          medios={pago.medios}
          intentos={pago.intentos}
        />
      )}

      {/* Individual: el capitan ES el unico integrante, asi que esta lista
          repetiria exactamente lo que "Mis datos" ya muestra abajo -- se
          esconde entera y solo queda "Mis datos". En equipo sigue siendo la
          unica vista de conjunto (quien falta, quien ya completo). */}
      {teamSize > 1 && (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase">
          {`Integrantes (${integrantes.length} de ${teamSize})`}
        </h2>

        <ul className="divide-y divide-neutral-800 rounded-2xl border border-neutral-800">
          {Array.from({ length: teamSize }, (_, i) => i + 1).map((posicion) => {
            const miembro = integrantes.find((m) => m.position === posicion);

            return (
              <li key={posicion} className="flex items-center gap-3 px-4 py-3">
                <span className="font-mono text-sm text-neutral-600">
                  {posicion}
                </span>

                {miembro ? (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {[miembro.first_name, miembro.last_name]
                          .filter(Boolean)
                          .join(" ") || miembro.invited_email}
                      </span>
                      {(miembro.first_name || miembro.last_name) && (
                        <span className="block truncate text-xs text-neutral-500">
                          {miembro.invited_email}
                        </span>
                      )}
                      {/* La invitacion se guardo, pero a esta direccion ya no
                          le escribimos (rebote o queja): sin este aviso el
                          capitan esperaria para siempre a que responda. */}
                      {posicionesSinCorreo.includes(posicion) &&
                        miembro.status !== "completo" && (
                          <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-amber-400">
                            Este correo no recibe mensajes de la plataforma.
                            Compártele por otro medio el enlace de esta página.
                            <BotonCopiar
                              valor={
                                typeof window === "undefined"
                                  ? `/inscripcion/${registro.id}`
                                  : `${window.location.origin}/inscripcion/${registro.id}`
                              }
                              titulo="Copiar enlace"
                            />
                          </span>
                        )}
                    </span>
                    <span
                      className={`text-xs ${
                        miembro.status === "completo"
                          ? "text-lime-400"
                          : "text-amber-400"
                      }`}
                    >
                      {miembro.status === "completo"
                        ? "✓ listo"
                        : "faltan datos"}
                    </span>
                  </>
                ) : (
                  <span className="flex-1 text-sm text-neutral-600">
                    Lugar libre
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {soyCapitan && !cerrada && integrantes.length < teamSize && (
          <InvitarIntegrante
            registrationId={registro.id}
            position={
              Array.from({ length: teamSize }, (_, i) => i + 1).find(
                (p) => !integrantes.some((m) => m.position === p),
              ) ?? integrantes.length + 1
            }
          />
        )}
      </section>
      )}

      {yo && !cerrada && (
        <MisDatos
          registrationId={registro.id}
          miembro={yo}
          tallas={tallas}
          campos={campos}
          documentos={documentos}
          // En individual el capitan ES el unico integrante: guardar sus datos
          // y enviar la inscripcion son el mismo paso para el atleta, y
          // separarlos en dos botones es lo que confundia. En equipo siguen
          // siendo dos pasos distintos porque el capitan no puede enviar hasta
          // que TODOS completen los suyos.
          confirmarAlGuardar={teamSize === 1 && soyCapitan}
        />
      )}

      {/* Post-confirmacion: solo datos OPERACIONALES (nunca nombre/apellido/
          pais/terminos, ya materializados en `athletes` -- ver el comentario
          de `soloOperacionales` en CamposDeAtleta). Es la pantalla que hace
          real "cupo asegurado, ahora completa tu inscripcion". */}
      {yo &&
        cerrada &&
        registro.status === "confirmada" &&
        readiness !== "listo" && (
          <CompletarDatos
            registrationId={registro.id}
            miembro={yo}
            tallas={tallas}
            campos={campos}
            documentos={documentos}
          />
        )}

      {!yo && (
        <p className="rounded-2xl border border-neutral-800 p-4 text-sm text-neutral-400">
          Estás viendo esta inscripción pero no eres parte del equipo.
        </p>
      )}

      {teamSize === 1 && soyCapitan && !cerrada && (
        <CancelarInscripcion
          registrationId={registro.id}
          hayOrden={pago.orden !== null}
          className="self-start text-sm text-neutral-600 hover:text-red-400"
        />
      )}

      {teamSize > 1 && soyCapitan && !cerrada && (
        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 pt-6">
          <Boton
            disabled={!equipoCompleto}
            cargando={pendiente}
            textoCargando="Enviando…"
            onClick={() =>
              startTransition(async () => {
                activar("Enviando la inscripción…");
                try {
                  const r = await enviarInscripcion(registro.id);
                  if (r.error) avisarError(r.error);
                  else exito("Inscripción enviada.");
                } finally {
                  desactivar();
                }
              })
            }
          >
            Enviar inscripción
          </Boton>

          {!equipoCompleto && (
            <span className="text-sm text-neutral-500">
              {integrantes.length < teamSize
                ? "Falta invitar integrantes."
                : `Falta que ${faltan === 1 ? "alguien complete sus datos" : `${faltan} completen sus datos`}.`}
            </span>
          )}

          <CancelarInscripcion
            registrationId={registro.id}
            hayOrden={pago.orden !== null}
            className="ml-auto text-sm text-neutral-600 hover:text-red-400"
          />
        </div>
      )}
    </div>
  );
}

function InvitarIntegrante({
  registrationId,
  position,
}: {
  registrationId: string;
  position: number;
}) {
  const [state, formAction] = useActionState(invitarIntegrante, {
    error: null,
  } as FormState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-2xl border border-neutral-800 p-4"
    >
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="position" value={position} />

      <label className="text-sm font-medium">
        Invitar al integrante {position}
      </label>
      <p className="text-xs text-neutral-500">
        Pon su correo real: es con ese correo que va a entrar a completar sus
        datos.
      </p>

      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <input
          name="email"
          type="email"
          required
          placeholder="companero@correo.com"
          className={campo}
        />
        <BotonDeEnvio
          pendienteTexto="Guardando…"
          mensajeDeCarga="Invitando al integrante…"
          className={claseDeBoton({ variante: "primary" })}
        >
          Invitar
        </BotonDeEnvio>
      </div>

      {state.error && (
        <MensajeDeError compacto>{state.error}</MensajeDeError>
      )}
    </form>
  );
}

function MisDatos({
  registrationId,
  miembro,
  tallas,
  campos,
  documentos,
  confirmarAlGuardar,
}: {
  registrationId: string;
  miembro: RegistrationMemberRow;
  tallas: string[];
  campos: CampoDelFormulario[];
  documentos: Array<{ name: string; url: string; requiresAcceptance: boolean }>;
  confirmarAlGuardar: boolean;
}) {
  // NO usa `<form action={formAction}>`: React 19 llama a form.reset() nativo
  // apenas la accion termina -incluso si termina en error- y eso borraba todo
  // lo tipeado con solo olvidar tildar "acepto los terminos". Se invoca la
  // accion a mano, mismo patron que "Enviar inscripcion"/"Cancelar
  // inscripcion" en el panel padre.
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { activar, desactivar } = useCarga();
  const { exito, error: avisarError } = useNotificaciones();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);

    startTransition(async () => {
      activar(confirmarAlGuardar ? "Confirmando la inscripción…" : "Guardando tus datos…");
      try {
        const r = await guardarMisDatos({ error: null }, formData);
        if (r.error) {
          setError(r.error);
          avisarError(r.error);
          return;
        }

        if (confirmarAlGuardar) {
          const r2 = await enviarInscripcion(registrationId);
          if (r2.error) {
            setError(r2.error);
            avisarError(r2.error);
            return;
          }
          exito("Inscripción confirmada.");
        } else {
          exito("Datos guardados.");
        }
      } finally {
        desactivar();
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 border-t border-neutral-800 pt-6"
    >
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="memberId" value={miembro.id} />

      <h2 className="text-sm font-semibold text-neutral-400 uppercase">
        Mis datos
      </h2>

      <CamposDeAtleta
        valores={{
          firstName: miembro.first_name,
          lastName: miembro.last_name,
          birthDate: miembro.birth_date,
          gender: miembro.gender,
          phone: miembro.phone,
          shirtSize: miembro.shirt_size,
          country: miembro.country,
          documentId: miembro.document_id,
          stateProvince: miembro.state_province,
          box: miembro.box,
          answers: miembro.answers as Record<string, string> | null,
          aceptado: miembro.accepted_terms_at !== null,
        }}
        tallas={tallas}
        campos={campos}
        documentos={documentos}
      />

      {error && <MensajeDeError>{error}</MensajeDeError>}

      <div>
        <Boton
          type="submit"
          cargando={pendiente}
          textoCargando={confirmarAlGuardar ? "Confirmando…" : "Guardando…"}
          variante="primary"
        >
          {confirmarAlGuardar ? "Confirmar inscripción" : "Guardar mis datos"}
        </Boton>
      </div>
    </form>
  );
}

/**
 * "Cupo asegurado — completa tu inscripción": la pantalla que aparece
 * DESPUES de confirmarse, cuando todavia falta algo de fase completa. Mismo
 * formulario que `MisDatos`, pero con `soloOperacionales` -- nunca vuelve a
 * mostrar (ni a poder pisar) nombre/apellido/pais/terminos.
 */
function CompletarDatos({
  registrationId,
  miembro,
  tallas,
  campos,
  documentos,
}: {
  registrationId: string;
  miembro: RegistrationMemberRow;
  tallas: string[];
  campos: CampoDelFormulario[];
  documentos: Array<{ name: string; url: string; requiresAcceptance: boolean }>;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { activar, desactivar } = useCarga();
  const { exito, error: avisarError } = useNotificaciones();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);

    startTransition(async () => {
      activar("Guardando…");
      try {
        const r = await guardarMisDatos({ error: null }, formData);
        if (r.error) {
          setError(r.error);
          avisarError(r.error);
          return;
        }
        exito("Datos guardados.");
      } finally {
        desactivar();
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5"
    >
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="memberId" value={miembro.id} />

      <div>
        <h2 className="text-sm font-semibold text-amber-300 uppercase">
          Completa tu inscripción
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          Tu cupo ya está asegurado. Faltan estos datos para que quedes listo
          para competir.
        </p>
      </div>

      <CamposDeAtleta
        valores={{
          firstName: miembro.first_name,
          lastName: miembro.last_name,
          birthDate: miembro.birth_date,
          gender: miembro.gender,
          phone: miembro.phone,
          shirtSize: miembro.shirt_size,
          country: miembro.country,
          documentId: miembro.document_id,
          stateProvince: miembro.state_province,
          box: miembro.box,
          answers: miembro.answers as Record<string, string> | null,
          aceptado: miembro.accepted_terms_at !== null,
        }}
        tallas={tallas}
        campos={campos}
        documentos={documentos}
        soloOperacionales
      />

      {error && <MensajeDeError>{error}</MensajeDeError>}

      <div>
        <Boton type="submit" cargando={pendiente} textoCargando="Guardando…" variante="primary">
          Guardar
        </Boton>
      </div>
    </form>
  );
}
