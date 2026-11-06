/**
 * El atleta ve su heat: `mis_heats` (su propio heat, con hora y arena) y
 * `public_heat_lineups` (quien corre en cada heat del cronograma publico).
 *
 * Lo que importa probar: que cada uno vea SOLO lo suyo, y que la lista publica
 * no exponga mas de lo que ya expone la lista de largada.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { asAdmin, asAnon, asUser, createUser, expectDenied } from "./harness";
import { seedScenario, type Scenario } from "./fixtures";

let s: Scenario;
let registrationId: string;
let atletaId: string;

beforeEach(async () => {
  s = await seedScenario();
  atletaId = await createUser(s.db, "atleta1@test.com");

  await asAdmin(s.db, async () => {
    const reg = await s.db.query<{ id: string }>(
      `insert into registrations (event_id, division_id, created_by, team_id)
       values ($1, $2, $3, $4) returning id`,
      [s.eventId, s.divisionId, s.users.owner, s.teamIds[0]],
    );
    registrationId = reg.rows[0].id;
    await s.db.query(
      `insert into registration_members (registration_id, event_id, position, profile_id, invited_email)
       values ($1, $2, 1, $3, 'atleta1@test.com')`,
      [registrationId, s.eventId, atletaId],
    );

    const arena = await s.db.query<{ id: string }>(
      "insert into arenas (event_id, name) values ($1, 'Box') returning id",
      [s.eventId],
    );
    await s.db.query(
      `update heats set arena_id = $1, scheduled_at = '2026-11-07T14:00:00Z',
         scheduled_end_at = '2026-11-07T14:15:00Z' where id = $2`,
      [arena.rows[0].id, s.heatId],
    );
    await s.db.query("update teams set name = 'Los Rapidos' where id = $1", [s.teamIds[1]]);
    await s.db.query("update athletes set country = 'CO' where event_id = $1", [s.eventId]);
    await s.db.query("update events set published_at = now() where id = $1", [s.eventId]);
  });
});

interface MiHeat {
  heat_name: string;
  lane_number: number;
  arena_name: string | null;
  scheduled_at: string | null;
}

async function misHeats(usuario: string): Promise<MiHeat[]> {
  let filas: MiHeat[] = [];
  await asUser(s.db, usuario, async () => {
    const res = await s.db.query<MiHeat>("select * from mis_heats($1)", [registrationId]);
    filas = res.rows;
  });
  return filas;
}

describe("mis_heats", () => {
  it("el integrante ve su heat, su carril, la hora y la arena", async () => {
    const filas = await misHeats(atletaId);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ heat_name: "Heat 1", lane_number: 1, arena_name: "Box" });
    expect(new Date(filas[0].scheduled_at!).toISOString()).toBe("2026-11-07T14:00:00.000Z");
  });

  it("un heat sin programar igual aparece, con hora y arena vacias", async () => {
    await asAdmin(s.db, () =>
      s.db.query("update heats set scheduled_at = null, arena_id = null where id = $1", [s.heatId]),
    );
    const filas = await misHeats(atletaId);
    expect(filas).toHaveLength(1);
    expect(filas[0].scheduled_at).toBeNull();
    expect(filas[0].arena_name).toBeNull();
  });

  it("quien no es integrante no ve nada, aunque sea el created_by del tramite", async () => {
    // El alta manual deja al organizador como created_by: eso no lo hace
    // competidor de ese equipo.
    const ajeno = await createUser(s.db, "otro@test.com");
    expect(await misHeats(ajeno)).toEqual([]);
    expect(await misHeats(s.users.owner)).toEqual([]);
  });

  it("un equipo retirado no muestra heats", async () => {
    await asAdmin(s.db, () =>
      s.db.query("update teams set status = 'withdrawn' where id = $1", [s.teamIds[0]]),
    );
    expect(await misHeats(atletaId)).toEqual([]);
  });

  it("el anonimo no puede llamarla", async () => {
    await asAnon(s.db, () =>
      expectDenied(() => s.db.query("select * from mis_heats($1)", [registrationId])),
    );
  });
});

interface HeatPublico {
  name: string;
  arena: string | null;
  athletes: Array<{
    carril: number;
    dorsal: number;
    equipo: string | null;
    integrantes: Array<{ nombre: string; pais: string | null }>;
  }>;
}

async function lineups(): Promise<HeatPublico[]> {
  let doc: HeatPublico[] = [];
  await asAnon(s.db, async () => {
    const res = await s.db.query<{ public_heat_lineups: HeatPublico[] }>(
      "select public_heat_lineups($1)",
      ["copa-test"],
    );
    doc = res.rows[0].public_heat_lineups;
  });
  return doc;
}

describe("public_heat_lineups", () => {
  it("el publico ve quien corre en cada carril, por orden de carril", async () => {
    const heats = await lineups();
    expect(heats).toHaveLength(1);
    expect(heats[0]).toMatchObject({ name: "Heat 1", arena: "Box" });
    expect(heats[0].athletes.map((a) => [a.carril, a.dorsal])).toEqual([
      [1, 101],
      [2, 102],
      [3, 103],
    ]);
    expect(heats[0].athletes[0]).toMatchObject({
      equipo: null,
      integrantes: [{ nombre: "Atleta1 Perez", pais: "CO" }],
    });
    expect(heats[0].athletes[1].equipo).toBe("Los Rapidos");
  });

  it("no expone nada mas que nombre, pais, dorsal y carril", async () => {
    const [heat] = await lineups();
    expect(Object.keys(heat.athletes[0]).sort()).toEqual(["carril", "dorsal", "equipo", "integrantes"]);
    expect(Object.keys(heat.athletes[0].integrantes[0]).sort()).toEqual(["nombre", "pais"]);
  });

  it("un retirado no aparece", async () => {
    await asAdmin(s.db, () =>
      s.db.query("update teams set status = 'withdrawn' where id = $1", [s.teamIds[2]]),
    );
    const [heat] = await lineups();
    expect(heat.athletes.map((a) => a.dorsal)).toEqual([101, 102]);
  });

  it("los heats sin hora no se listan, igual que en el cronograma", async () => {
    await asAdmin(s.db, () =>
      s.db.query("update heats set scheduled_at = null where id = $1", [s.heatId]),
    );
    expect(await lineups()).toEqual([]);
  });

  it("un evento sin publicar no devuelve nada", async () => {
    await asAdmin(s.db, () =>
      s.db.query("update events set published_at = null where id = $1", [s.eventId]),
    );
    expect(await lineups()).toEqual([]);
  });
});
