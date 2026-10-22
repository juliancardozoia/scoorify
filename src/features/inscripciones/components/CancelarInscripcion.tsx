"use client";

import { useState } from "react";
import { cancelarInscripcion } from "../actions";
import { ModalDeConfirmacion } from "@/shared/components/ModalDeConfirmacion";

/**
 * "Cancelar inscripción", con confirmación.
 *
 * ANTES CANCELABA CON UN SOLO CLICK. Caso real (RomanoFest, 2026-10-20): un
 * atleta guardó sus datos, cuatro segundos después tocó este link —gris,
 * justo debajo del formulario— y la inscripción quedó cancelada sin que lo
 * notara. Pagó la transferencia cuatro minutos más tarde. Desde el lado del
 * atleta no hay forma de deshacer una cancelación, así que un toque desviado
 * no puede alcanzar.
 *
 * El aviso menciona el pago cuando ya hay una orden: es justo quien está por
 * pagar (o ya pagó) el que más pierde con una cancelación accidental.
 */
export function CancelarInscripcion({
  registrationId,
  hayOrden,
  className,
}: {
  registrationId: string;
  hayOrden: boolean;
  className: string;
}) {
  const [confirmar, setConfirmar] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setConfirmar(true)} className={className}>
        Cancelar inscripción
      </button>

      <ModalDeConfirmacion
        abierto={confirmar}
        alCerrar={() => setConfirmar(false)}
        titulo="Cancelar inscripción"
        descripcion={
          <>
            <p>
              ¿Seguro que quieres cancelar tu inscripción? Liberas tu cupo y esta inscripción ya
              no se puede recuperar.
            </p>
            {hayOrden && (
              <p className="mt-3 font-medium text-amber-300">
                Si ya pagaste, no la canceles: espera a que la organización confirme tu pago.
              </p>
            )}
          </>
        }
        accion={() => cancelarInscripcion(registrationId)}
        estadoInicial={{ error: null }}
        etiquetaConfirmar="Sí, cancelar"
        etiquetaCerrar="No, volver"
        etiquetaPendiente="Cancelando…"
        mensajeDeCarga="Cancelando la inscripción…"
      />
    </>
  );
}
