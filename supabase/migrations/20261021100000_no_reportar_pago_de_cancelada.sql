-- Un pago no se puede reportar sobre una inscripcion CANCELADA.
--
-- Caso real (RomanoFest, 2026-10-20): un atleta toco "Cancelar inscripcion" sin
-- querer —el boton cancelaba con un solo click— y cuatro minutos despues pago
-- la transferencia y subio el comprobante. La pantalla le seguia mostrando el
-- bloque de pago (habia una orden creada) y `reportar_pago_manual` no miraba el
-- estado del tramite, asi que el reporte entro sin ningun aviso: el atleta
-- creyo estar inscripto y pagado, y para la organizacion era una inscripcion
-- cancelada con un comprobante colgado que "Marcar como pagada" rechaza.
--
-- La pantalla ya no ofrece pagar una inscripcion cancelada; esto es la barrera
-- de verdad, porque una server action se saltea llamando a PostgREST.
--
-- El webhook de una pasarela (`registrar_intento_de_pago`) NO se toca a
-- proposito: si una pasarela confirma plata que entro de verdad, lo correcto es
-- que el atleta quede inscripto, no rechazar un cobro ya hecho.

create or replace function public.reportar_pago_manual(
  p_order_id uuid,
  p_receipt_url text,
  p_referencia text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orden public.orders;
  v_estado public.registration_status;
begin
  select * into v_orden from public.orders where id = p_order_id;
  if not found then
    raise exception 'La orden no existe';
  end if;

  -- Solo quien es parte de la inscripcion puede reportar su propio pago. La
  -- aprobacion sigue siendo exclusiva de `confirmar_pago_manual`, que exige
  -- `can_manage_event` -- esta funcion nunca toca `orders.status`.
  if not coalesce(public.puede_ver_inscripcion(v_orden.registration_id), false) then
    raise exception 'No puedes reportar el pago de una inscripción ajena'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_estado from public.registrations where id = v_orden.registration_id;
  if v_estado = 'cancelada' then
    raise exception 'Esta inscripción fue cancelada: no se puede reportar un pago. Inscríbete de nuevo desde la página de la competencia.';
  end if;

  -- Insercion directa, no via `registrar_intento_de_pago`: esa funcion no
  -- conoce `receipt_url` y no vale la pena agregarselo -- es el camino del
  -- WEBHOOK, que nunca trae un comprobante. Sin id externo a proposito: el
  -- atleta puede volver a subir un comprobante mas claro sin que el segundo
  -- reporte choque contra el primero.
  insert into public.payment_attempts (
    order_id, event_id, provider, status, receipt_url, amount_cents, raw
  )
  values (
    p_order_id, v_orden.event_id, 'transferencia', 'pendiente', p_receipt_url,
    v_orden.total_cents,
    jsonb_build_object('reportadoPor', auth.uid(), 'referencia', p_referencia)
  );

  return v_orden;
end;
$$;

select public.apply_function_lockdown();
