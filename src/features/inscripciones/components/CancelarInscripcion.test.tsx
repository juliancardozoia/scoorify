// @vitest-environment jsdom

/*
 * "Cancelar inscripción" del lado del atleta.
 *
 * Caso real: un atleta tocó el link sin querer, la inscripción quedó cancelada
 * con un solo click y cuatro minutos después pagó la transferencia. Desde su
 * lado una cancelación no se deshace, así que tocar el link NO puede cancelar:
 * tiene que abrir una confirmación, y solo esa confirmación llama a la acción.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "../../../../test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const cancelarInscripcion = vi.fn(async (_id: string) => ({ error: null }));
vi.mock("../actions", () => ({ cancelarInscripcion }));

const { CancelarInscripcion } = await import("./CancelarInscripcion");

afterEach(() => {
  cleanup();
  cancelarInscripcion.mockClear();
});

describe("CancelarInscripcion", () => {
  it("tocar el link solo abre la confirmación: no cancela nada", () => {
    render(<CancelarInscripcion registrationId="reg-1" hayOrden={false} className="" />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar inscripción" }));

    expect(screen.getByText(/esta inscripción ya no se puede recuperar/)).toBeTruthy();
    expect(cancelarInscripcion).not.toHaveBeenCalled();
  });

  it("volver cierra sin cancelar", () => {
    render(<CancelarInscripcion registrationId="reg-1" hayOrden={false} className="" />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar inscripción" }));
    fireEvent.click(screen.getByRole("button", { name: "No, volver" }));

    expect(cancelarInscripcion).not.toHaveBeenCalled();
  });

  it("confirmar sí cancela esa inscripción", async () => {
    render(<CancelarInscripcion registrationId="reg-1" hayOrden={false} className="" />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar inscripción" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));

    await waitFor(() => expect(cancelarInscripcion).toHaveBeenCalledWith("reg-1"));
  });

  it("con una orden de pago avisa que no se cancele si ya pagó", () => {
    render(<CancelarInscripcion registrationId="reg-1" hayOrden className="" />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar inscripción" }));
    expect(screen.getByText(/Si ya pagaste, no la canceles/)).toBeTruthy();
  });
});
