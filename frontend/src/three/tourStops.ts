/**
 * Geometric layout for the single-building HQ interior — desk anchors, room
 * bounds, the camera-stepper stop sequence, and the stable agent→desk
 * assignment used by WelcomeHWScene and HQSidePanel.
 *
 * Coordinates are in the Blender EEVEE building's local space. The building
 * occupies roughly X ∈ [-34, 34], Z ∈ [-22, 22] on a single ground floor.
 * Rooms are conceptual subdivisions of that floor (the GLB has no interior
 * walls) — the camera stepper + side panel do the work of making them read
 * as distinct spaces.
 *
 * Desk positions are hand-authored. If you re-author the building .blend
 * with named Empty objects at each desk, you can replace DESK_ANCHORS with
 * an extraction step over the GLB scene graph (see the v2 note in the plan).
 */
import type { Agent } from "../store/agentStore";

export type RoomId = "lobby" | "support" | "engineering" | "product" | "marketing" | "cto";

export interface DeskAnchor {
  id: string;
  room: RoomId;
  desk_index: number;
  position: [number, number, number];
  rotationY: number;
}

export interface RoomDef {
  id: RoomId;
  label: string;
  description: string;
  color: string;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  /**
   * Explicit camera framing for the room overview shot. We don't trust
   * fitToBox here — the building has interior columns and a low ceiling, and
   * fitToBox would happily put the camera outside the wall or above the roof
   * to satisfy padding. `cameraOffset` is added to the room's center to get
   * the camera position; `lookAtOffset` is added to the center to get where
   * the camera looks. Both are in world coordinates, so e.g. a +X offset
   * places the camera to the east of the room.
   */
  cameraOffset: [number, number, number];
  lookAtOffset: [number, number, number];
}

const SEAT_Y = 0.45;
// Building's interior ceiling is roughly 4 units above the floor (one story).
// All overview cameras sit BELOW this, so we never see the sky through the
// roof.
const CEILING_Y = 3.6;

export const ROOMS: Record<RoomId, RoomDef> = {
  lobby: {
    id: "lobby",
    label: "Lobby",
    description: "The front door of the building — no assigned desks.",
    color: "#94a3b8",
    bounds: { min: [2, 0, 8], max: [30, CEILING_Y, 22] },
    // Lobby framing: stand near the entrance at standing height looking
    // back into the main floor of the building. Camera Y is held below
    // the ceiling (CEILING_Y = 3.6) so we never see through the roof.
    cameraOffset: [-2, 0.7, 6],
    lookAtOffset: [2, -0.4, -8],
  },
  support: {
    id: "support",
    label: "Support",
    description: "Customer support pod facing the front windows.",
    color: "#9233ea",
    bounds: { min: [-30, 0, 8], max: [-2, CEILING_Y, 22] },
    // Support is along the west side of the front zone. Stand to the east
    // (interior) of the desks looking back toward the row + windows.
    cameraOffset: [10, 2.4, 4],
    lookAtOffset: [-6, 1.4, 0],
  },
  engineering: {
    id: "engineering",
    label: "Engineering",
    description: "Engineering bullpen along the west wall.",
    color: "#1B47D6",
    bounds: { min: [-30, 0, -6], max: [-12, CEILING_Y, 8] },
    // Engineering desks line the west wall facing -X. Stand to the east and
    // slightly south of the bullpen so we see the row of monitors + workers.
    cameraOffset: [12, 2.6, 4],
    lookAtOffset: [-8, 1.3, -2],
  },
  product: {
    id: "product",
    label: "Product",
    description: "Product + design desks in the center-right.",
    color: "#2ea06b",
    bounds: { min: [12, 0, -6], max: [30, CEILING_Y, 8] },
    // Product is on the east side. Stand to the west looking east at the
    // desks + monitors lined up against the windows.
    cameraOffset: [-12, 2.6, 4],
    lookAtOffset: [8, 1.3, -2],
  },
  marketing: {
    id: "marketing",
    label: "Marketing",
    description: "Marketing pod toward the back of the building.",
    color: "#D97706",
    bounds: { min: [4, 0, -20], max: [30, CEILING_Y, -8] },
    // Marketing sits along the back wall facing -Z. Stand south of the
    // desks (toward the front of the building, +Z) looking back at them.
    cameraOffset: [0, 2.6, 14],
    lookAtOffset: [0, 1.3, -4],
  },
  cto: {
    id: "cto",
    label: "CTO Office",
    description: "The exec office at the far end of the floor.",
    color: "#0f172a",
    bounds: { min: [-26, 0, -20], max: [-10, CEILING_Y, -8] },
    // The CTO has the corner office at the far back-west. Stand toward the
    // building interior (east + south) so we see the desk and the open
    // office around them.
    cameraOffset: [10, 2.4, 8],
    lookAtOffset: [-2, 1.3, -2],
  },
};

export const TOUR_ORDER: RoomId[] = [
  "lobby",
  "support",
  "engineering",
  "product",
  "marketing",
  "cto",
];

export const DESK_ANCHORS: DeskAnchor[] = [
  // Support — 3 desks in a row along the front wall, workers face +Z
  { id: "desk-support-1", room: "support", desk_index: 1, position: [-26, SEAT_Y, 18], rotationY: Math.PI },
  { id: "desk-support-2", room: "support", desk_index: 2, position: [-18, SEAT_Y, 18], rotationY: Math.PI },
  { id: "desk-support-3", room: "support", desk_index: 3, position: [-10, SEAT_Y, 18], rotationY: Math.PI },

  // Engineering — 4 desks in a 2×2 grid facing the west wall, workers face -X
  { id: "desk-eng-1", room: "engineering", desk_index: 1, position: [-28, SEAT_Y, 4], rotationY: Math.PI / 2 },
  { id: "desk-eng-2", room: "engineering", desk_index: 2, position: [-28, SEAT_Y, -2], rotationY: Math.PI / 2 },
  { id: "desk-eng-3", room: "engineering", desk_index: 3, position: [-20, SEAT_Y, 4], rotationY: Math.PI / 2 },
  { id: "desk-eng-4", room: "engineering", desk_index: 4, position: [-20, SEAT_Y, -2], rotationY: Math.PI / 2 },

  // Product — 3 desks along the east wall, workers face +X
  { id: "desk-product-1", room: "product", desk_index: 1, position: [28, SEAT_Y, 4], rotationY: -Math.PI / 2 },
  { id: "desk-product-2", room: "product", desk_index: 2, position: [28, SEAT_Y, -2], rotationY: -Math.PI / 2 },
  { id: "desk-product-3", room: "product", desk_index: 3, position: [20, SEAT_Y, 1], rotationY: -Math.PI / 2 },

  // Marketing — 3 desks against the back wall, workers face -Z
  { id: "desk-marketing-1", room: "marketing", desk_index: 1, position: [10, SEAT_Y, -18], rotationY: 0 },
  { id: "desk-marketing-2", room: "marketing", desk_index: 2, position: [18, SEAT_Y, -18], rotationY: 0 },
  { id: "desk-marketing-3", room: "marketing", desk_index: 3, position: [26, SEAT_Y, -18], rotationY: 0 },

  // CTO — single prominent desk, faces back wall so the camera sweeps in from the room side
  { id: "desk-cto-1", room: "cto", desk_index: 1, position: [-18, SEAT_Y, -16], rotationY: 0 },
];

export const HOT_DESK_ANCHORS: DeskAnchor[] = Array.from({ length: 6 }, (_, i) => ({
  id: `desk-hot-${i + 1}`,
  room: "lobby",
  desk_index: 100 + i,
  position: [12 + (i % 3) * 6, SEAT_Y, 12 + Math.floor(i / 3) * 6],
  rotationY: Math.PI,
}));

const HIERARCHY_RANK: Record<string, number> = {
  cto: 0,
  manager: 1,
  specialist: 2,
};

function isCTO(agent: Agent): boolean {
  return agent.role === "cto" || agent.hierarchy_level === "cto";
}

function departmentToRoom(department: string): RoomId {
  const key = department?.toLowerCase() ?? "";
  if (key === "engineering" || key === "marketing" || key === "product" || key === "support") {
    return key;
  }
  return "engineering";
}

export interface DeskAssignment {
  agent: Agent;
  anchor: DeskAnchor;
  isHeroCTO: boolean;
}

/**
 * Stable agent→desk assignment.
 *
 * Adding, removing, or reordering agents in the input MUST NOT reshuffle
 * existing agents' desks — tested in tourStops.test.ts.
 *
 * Strategy: CTO is placed at the CTO desk. Remaining agents are sorted by
 * (department, hierarchy_level, agent_id) and zipped with their room's desks
 * sorted by desk_index. Overflow goes to HOT_DESK_ANCHORS in strict
 * agent_id order.
 */
export function assignAgentsToDesks(agents: Agent[]): DeskAssignment[] {
  const assignments: DeskAssignment[] = [];
  const usedAnchorIds = new Set<string>();

  const ctoAgent = agents.find(isCTO) ?? null;
  const ctoAnchor = DESK_ANCHORS.find((a) => a.room === "cto");
  if (ctoAgent && ctoAnchor) {
    assignments.push({ agent: ctoAgent, anchor: ctoAnchor, isHeroCTO: true });
    usedAnchorIds.add(ctoAnchor.id);
  }

  const staff = (ctoAgent ? agents.filter((a) => a.agent_id !== ctoAgent.agent_id) : agents).slice();
  staff.sort((a, b) => {
    const depA = departmentToRoom(a.department);
    const depB = departmentToRoom(b.department);
    if (depA !== depB) return depA.localeCompare(depB);
    const rankA = HIERARCHY_RANK[a.hierarchy_level] ?? 2;
    const rankB = HIERARCHY_RANK[b.hierarchy_level] ?? 2;
    if (rankA !== rankB) return rankA - rankB;
    return a.agent_id.localeCompare(b.agent_id);
  });

  const anchorsByRoom = new Map<RoomId, DeskAnchor[]>();
  for (const anchor of DESK_ANCHORS) {
    if (anchor.room === "cto") continue;
    const arr = anchorsByRoom.get(anchor.room) ?? [];
    arr.push(anchor);
    anchorsByRoom.set(anchor.room, arr);
  }
  for (const [, list] of anchorsByRoom) list.sort((a, b) => a.desk_index - b.desk_index);
  const cursorByRoom = new Map<RoomId, number>();

  const overflow: Agent[] = [];
  for (const agent of staff) {
    const room = departmentToRoom(agent.department);
    const anchors = anchorsByRoom.get(room) ?? [];
    const cursor = cursorByRoom.get(room) ?? 0;
    const anchor = anchors[cursor];
    if (anchor) {
      assignments.push({ agent, anchor, isHeroCTO: false });
      usedAnchorIds.add(anchor.id);
      cursorByRoom.set(room, cursor + 1);
    } else {
      overflow.push(agent);
    }
  }

  overflow.sort((a, b) => a.agent_id.localeCompare(b.agent_id));
  for (let i = 0; i < overflow.length && i < HOT_DESK_ANCHORS.length; i++) {
    assignments.push({ agent: overflow[i], anchor: HOT_DESK_ANCHORS[i], isHeroCTO: false });
  }

  return assignments;
}

export type Stop =
  | { kind: "room"; id: string; roomId: RoomId; label: string; occupantIds: string[] }
  | { kind: "person"; id: string; roomId: RoomId; label: string; agentId: string; anchorId: string };

export function buildStops(assignments: DeskAssignment[]): Stop[] {
  const byRoom = new Map<RoomId, DeskAssignment[]>();
  for (const a of assignments) {
    const arr = byRoom.get(a.anchor.room) ?? [];
    arr.push(a);
    byRoom.set(a.anchor.room, arr);
  }
  for (const [, list] of byRoom) {
    list.sort((a, b) => a.anchor.desk_index - b.anchor.desk_index);
  }

  const stops: Stop[] = [];
  for (const roomId of TOUR_ORDER) {
    const occupants = byRoom.get(roomId) ?? [];
    stops.push({
      kind: "room",
      id: `room-${roomId}`,
      roomId,
      label: ROOMS[roomId].label,
      occupantIds: occupants.map((o) => o.agent.agent_id),
    });
    for (const occ of occupants) {
      stops.push({
        kind: "person",
        id: `person-${occ.agent.agent_id}`,
        roomId,
        label: occ.agent.name,
        agentId: occ.agent.agent_id,
        anchorId: occ.anchor.id,
      });
    }
  }
  return stops;
}

export function getRoomStopIndex(stops: Stop[], roomId: RoomId): number {
  return stops.findIndex((s) => s.kind === "room" && s.roomId === roomId);
}

export function getStopAgent(stop: Stop, assignments: DeskAssignment[]): DeskAssignment | null {
  if (stop.kind !== "person") return null;
  return assignments.find((a) => a.agent.agent_id === stop.agentId) ?? null;
}

export function getAnchorById(id: string): DeskAnchor | null {
  return (
    DESK_ANCHORS.find((a) => a.id === id) ??
    HOT_DESK_ANCHORS.find((a) => a.id === id) ??
    null
  );
}
