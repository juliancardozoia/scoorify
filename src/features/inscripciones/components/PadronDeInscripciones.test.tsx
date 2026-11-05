// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ProveedorDeCarga } from "@/shared/components/Carga";
import { PadronDeInscripciones, type FilaDelPadron } from "./PadronDeInscripciones";

vi.mock("@/features/pagos/actions", () => ({
  confirmarPagoDeInscripcion: vi.fn(async () => ({ error: null })),
}));

function fila(over: Partial<FilaDelPadron> & { id: string }): FilaDelPadron {
  return {
    status: "confirmada",
    teamName: null,
    divisionId: "rx",
    divisionName: "RX Masculino",
    bib: null,
    createdAt: "2026-10-01T12:00:00Z",
    priceCents: 18000000,
    currency: "COP",
    readiness: "listo",
    integrantes: [
      { nombre: `Atleta ${over.id}`, email: `${over.id}@mail.com`, completo: true, aceptoTerminos: true },
    ],
    inscritoEl: "01/10/2026, 07:00",
    intentos: [],
    ...over,
  };
}

const FILAS: FilaDelPadron[] = [
  fila({ id: "a", bib: 1 }),
  fila({ id: "b", divisionId: "sc", divisionName: "Scaled Femenino", bib: 2 }),
  fila({
    id: "c",
    status: "esperando_pago",
    intentos: [
      { id: "i1", status: "pendiente", referencia: "TX1", receiptUrl: null, createdAt: "2026-10-02T12:00:00Z" },
    ],
  }),
  fila({ id: "d", status: "esperando_pago" }),
];

const DIVISIONES = [
  { id: "rx", name: "RX Masculino" },
  { id: "sc", name: "Scaled Femenino" },
];

function nombresVisibles(): string[] {
  return screen
    .getAllByRole("listitem")
    .map((li) => within(li).queryByText(/^Atleta /)?.textContent ?? "")
    .filter(Boolean);
}

afterEach(cleanup);

describe("PadronDeInscripciones", () => {
  it("filtra por categoría", () => {
    render(<PadronDeInscripciones eventId="e" filas={FILAS} divisiones={DIVISIONES} />);
    expect(nombresVisibles()).toHaveLength(4);

    fireEvent.change(screen.getByLabelText("Filtrar por categoría"), { target: { value: "sc" } });
    expect(nombresVisibles()).toEqual(["Atleta b"]);
  });

  it("separa el pago con comprobante del pago sin reportar", () => {
    render(<PadronDeInscripciones eventId="e" filas={FILAS} divisiones={DIVISIONES} />);

    fireEvent.click(screen.getByRole("button", { name: /^Pago por revisar/ }));
    expect(nombresVisibles()).toEqual(["Atleta c"]);

    fireEvent.click(screen.getByRole("button", { name: /^Falta pagar/ }));
    expect(nombresVisibles()).toEqual(["Atleta d"]);
  });

  it("busca por dorsal y por correo", () => {
    render(<PadronDeInscripciones eventId="e" filas={FILAS} divisiones={DIVISIONES} />);
    const buscador = screen.getByLabelText("Buscar inscripción");

    fireEvent.change(buscador, { target: { value: "2" } });
    expect(nombresVisibles()).toEqual(["Atleta b"]);

    fireEvent.change(buscador, { target: { value: "d@mail" } });
    expect(nombresVisibles()).toEqual(["Atleta d"]);
  });

  it("el detalle con el formulario de pago solo aparece al desplegar la fila", () => {
    render(
      <ProveedorDeCarga>
        <PadronDeInscripciones eventId="e" filas={FILAS} divisiones={DIVISIONES} />
      </ProveedorDeCarga>,
    );
    expect(screen.queryByText("Marcar como pagada")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Atleta c/ }));
    expect(screen.getByText("El atleta reportó un pago")).toBeTruthy();
    expect(screen.getByText("Marcar como pagada")).toBeTruthy();
  });
});
