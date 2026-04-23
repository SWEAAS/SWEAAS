/**
 * Unit tests for the HQ desk assignment + stop building.
 *
 * The most important property: assignAgentsToDesks MUST be stable under
 * agent-list reordering. Shuffling the input array must not change which
 * agent sits at which desk.
 */
import { describe, expect, test } from "vitest";
import type { Agent } from "../store/agentStore";
import {
  DESK_ANCHORS,
  HOT_DESK_ANCHORS,
  ROOMS,
  TOUR_ORDER,
  assignAgentsToDesks,
  buildStops,
} from "./tourStops";

function agent(overrides: Partial<Agent> & { agent_id: string }): Agent {
  return {
    name: `Agent ${overrides.agent_id}`,
    role: "engineer",
    department: "engineering",
    hierarchy_level: "specialist",
    status: "active",
    daily_token_budget: 100,
    tokens_used_today: 10,
    current_focus: "",
    ...overrides,
  };
}

describe("tourStops — room + desk layout", () => {
  test("every DESK_ANCHOR sits inside its declared room's bounds", () => {
    for (const anchor of DESK_ANCHORS) {
      const room = ROOMS[anchor.room];
      const [x, y, z] = anchor.position;
      expect(x).toBeGreaterThanOrEqual(room.bounds.min[0]);
      expect(x).toBeLessThanOrEqual(room.bounds.max[0]);
      expect(z).toBeGreaterThanOrEqual(room.bounds.min[2]);
      expect(z).toBeLessThanOrEqual(room.bounds.max[2]);
      expect(y).toBeGreaterThanOrEqual(room.bounds.min[1]);
      expect(y).toBeLessThanOrEqual(room.bounds.max[1]);
    }
  });

  test("desk IDs are unique", () => {
    const ids = [...DESK_ANCHORS, ...HOT_DESK_ANCHORS].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("TOUR_ORDER includes every defined room exactly once", () => {
    expect(new Set(TOUR_ORDER).size).toBe(TOUR_ORDER.length);
    expect(new Set(TOUR_ORDER)).toEqual(new Set(Object.keys(ROOMS)));
  });
});

describe("assignAgentsToDesks", () => {
  test("places the CTO at the CTO desk", () => {
    const agents = [
      agent({ agent_id: "a", hierarchy_level: "specialist" }),
      agent({ agent_id: "b", hierarchy_level: "cto", role: "cto", department: "engineering" }),
    ];
    const out = assignAgentsToDesks(agents);
    const cto = out.find((a) => a.isHeroCTO);
    expect(cto?.agent.agent_id).toBe("b");
    expect(cto?.anchor.room).toBe("cto");
  });

  test("is stable under input reordering", () => {
    const agents: Agent[] = [
      agent({ agent_id: "eng-a", department: "engineering" }),
      agent({ agent_id: "eng-b", department: "engineering", hierarchy_level: "manager" }),
      agent({ agent_id: "mkt-a", department: "marketing" }),
      agent({ agent_id: "prd-a", department: "product" }),
      agent({ agent_id: "sup-a", department: "support" }),
      agent({ agent_id: "cto-x", hierarchy_level: "cto", role: "cto", department: "engineering" }),
    ];
    const first = assignAgentsToDesks(agents);
    const shuffled = [...agents].reverse();
    const second = assignAgentsToDesks(shuffled);

    const byId1 = new Map(first.map((a) => [a.agent.agent_id, a.anchor.id]));
    const byId2 = new Map(second.map((a) => [a.agent.agent_id, a.anchor.id]));
    for (const [id, anchor] of byId1) {
      expect(byId2.get(id)).toBe(anchor);
    }
  });

  test("managers land on lower desk_index than specialists within a department", () => {
    const agents = [
      agent({ agent_id: "eng-spec-z", department: "engineering", hierarchy_level: "specialist" }),
      agent({ agent_id: "eng-mgr", department: "engineering", hierarchy_level: "manager" }),
      agent({ agent_id: "eng-spec-a", department: "engineering", hierarchy_level: "specialist" }),
    ];
    const out = assignAgentsToDesks(agents);
    const mgr = out.find((a) => a.agent.agent_id === "eng-mgr")!;
    const specA = out.find((a) => a.agent.agent_id === "eng-spec-a")!;
    const specZ = out.find((a) => a.agent.agent_id === "eng-spec-z")!;
    expect(mgr.anchor.desk_index).toBeLessThan(specA.anchor.desk_index);
    expect(specA.anchor.desk_index).toBeLessThan(specZ.anchor.desk_index);
  });

  test("overflow goes to hot-desks in agent_id order", () => {
    const deptDeskCount = DESK_ANCHORS.filter((a) => a.room === "engineering").length;
    const engineers: Agent[] = Array.from({ length: deptDeskCount + 3 }, (_, i) =>
      agent({ agent_id: `eng-${String(i).padStart(3, "0")}`, department: "engineering" }),
    );
    const out = assignAgentsToDesks(engineers);
    const hotDeskIds = new Set(HOT_DESK_ANCHORS.map((a) => a.id));
    const overflow = out.filter((a) => hotDeskIds.has(a.anchor.id));
    expect(overflow).toHaveLength(3);
    const overflowAgentIds = overflow.map((a) => a.agent.agent_id);
    expect(overflowAgentIds).toEqual([...overflowAgentIds].sort());
  });
});

describe("buildStops", () => {
  test("produces one room stop per room followed by the room's person stops", () => {
    const agents = [
      agent({ agent_id: "eng-1", department: "engineering" }),
      agent({ agent_id: "cto-1", hierarchy_level: "cto", role: "cto", department: "engineering" }),
    ];
    const assignments = assignAgentsToDesks(agents);
    const stops = buildStops(assignments);

    // Room stops are in TOUR_ORDER.
    const roomStops = stops.filter((s) => s.kind === "room");
    expect(roomStops.map((s) => (s.kind === "room" ? s.roomId : ""))).toEqual(TOUR_ORDER);

    // CTO should have exactly one person stop following its room.
    const ctoRoomIx = stops.findIndex((s) => s.kind === "room" && s.roomId === "cto");
    const afterCto = stops[ctoRoomIx + 1];
    expect(afterCto.kind).toBe("person");
    if (afterCto.kind === "person") expect(afterCto.agentId).toBe("cto-1");
  });
});
