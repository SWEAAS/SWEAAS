/**
 * Right-edge collapsible side panel for the HQ 3D experience.
 *
 * Lists the rooms in the stepper tour and the people in each room. The room
 * matching the current stop is expanded by default; its occupant matching
 * the current stop (when a person stop is active) gets a highlighted ring.
 *
 * Clicking a room header jumps the stepper to that room. Clicking an
 * occupant jumps to that person's drill-in stop.
 */
import { useMemo, useState } from "react";
import { ChevronRight, ChevronLeft, Users } from "lucide-react";
import { ROOMS, TOUR_ORDER, type Stop, type RoomId, type DeskAssignment } from "./tourStops";
import type { Agent } from "../store/agentStore";

interface HQSidePanelProps {
  stops: Stop[];
  currentIndex: number;
  assignments: DeskAssignment[];
  onJumpToStop: (index: number) => void;
  onAgentClick: (agent: Agent) => void;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  warning: "Warning",
  paused: "Paused",
  strike: "Strike",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  warning: "#f59e0b",
  paused: "#9ca3af",
  strike: "#ef4444",
};

export default function HQSidePanel({
  stops,
  currentIndex,
  assignments,
  onJumpToStop,
  onAgentClick,
}: HQSidePanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const currentStop = stops[currentIndex] ?? null;
  const currentRoomId: RoomId | null = currentStop?.roomId ?? null;
  const currentPersonAgentId =
    currentStop?.kind === "person" ? currentStop.agentId : null;

  const occupantsByRoom = useMemo(() => {
    const map = new Map<RoomId, DeskAssignment[]>();
    for (const a of assignments) {
      const room = a.anchor.room;
      const list = map.get(room) ?? [];
      list.push(a);
      map.set(room, list);
    }
    for (const [, list] of map) list.sort((a, b) => a.anchor.desk_index - b.anchor.desk_index);
    return map;
  }, [assignments]);

  const roomStopIndex = useMemo(() => {
    const map = new Map<RoomId, number>();
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (s.kind === "room") map.set(s.roomId, i);
    }
    return map;
  }, [stops]);

  const personStopIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (s.kind === "person") map.set(s.agentId, i);
    }
    return map;
  }, [stops]);

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="Open HQ side panel"
        onClick={() => setCollapsed(false)}
        style={{
          position: "absolute",
          top: "50%",
          right: 0,
          transform: "translateY(-50%)",
          zIndex: 40,
          width: 36,
          height: 96,
          borderTopLeftRadius: 10,
          borderBottomLeftRadius: 10,
          border: "1px solid rgba(226,232,244,0.9)",
          borderRight: "none",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "0 4px 16px rgba(12,21,38,0.09)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#1B47D6",
        }}
      >
        <ChevronLeft size={18} />
      </button>
    );
  }

  return (
    <div
      aria-label="HQ rooms and team"
      style={{
        position: "absolute",
        top: 100,
        bottom: 100,
        right: 16,
        width: 300,
        zIndex: 40,
        background: "rgba(255,255,255,0.94)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(226,232,244,0.9)",
        borderRadius: 14,
        boxShadow: "0 10px 32px rgba(12,21,38,0.12)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: "1px solid rgba(226,232,244,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={14} color="#1B47D6" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1f1638", letterSpacing: "-0.01em" }}>
            Team at HQ
          </span>
        </div>
        <button
          type="button"
          aria-label="Collapse panel"
          onClick={() => setCollapsed(true)}
          style={{
            width: 24,
            height: 24,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "#7a7390",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={{ overflow: "auto", padding: "6px 8px" }}>
        {TOUR_ORDER.map((roomId) => {
          const room = ROOMS[roomId];
          const occupants = occupantsByRoom.get(roomId) ?? [];
          const isActive = roomId === currentRoomId;
          const stopIdx = roomStopIndex.get(roomId) ?? -1;

          return (
            <div key={roomId} style={{ marginBottom: 4 }}>
              <button
                type="button"
                onClick={() => stopIdx >= 0 && onJumpToStop(stopIdx)}
                aria-label={`Jump camera to ${room.label}`}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 8,
                  border: "1px solid " + (isActive ? "rgba(27,71,214,0.4)" : "rgba(226,232,244,0.9)"),
                  background: isActive ? "#EBF0FF" : "rgba(255,255,255,0.75)",
                  color: "#1f1638",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: room.color,
                      boxShadow: isActive ? "0 0 0 3px rgba(27,71,214,0.18)" : "none",
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{room.label}</span>
                </span>
                <span style={{ fontSize: 10, color: "#7a7390", fontWeight: 600 }}>
                  {occupants.length} {occupants.length === 1 ? "seat" : "seats"}
                </span>
              </button>

              {isActive && occupants.length > 0 && (
                <ul
                  style={{
                    listStyle: "none",
                    margin: "4px 0 8px",
                    padding: "0 0 0 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  {occupants.map(({ agent }) => {
                    const isHighlighted = currentPersonAgentId === agent.agent_id;
                    const personIdx = personStopIndex.get(agent.agent_id) ?? -1;
                    const statusColor = STATUS_COLORS[agent.status] ?? "#94a3b8";
                    return (
                      <li key={agent.agent_id}>
                        <button
                          type="button"
                          onClick={() => personIdx >= 0 && onJumpToStop(personIdx)}
                          onDoubleClick={() => onAgentClick(agent)}
                          style={{
                            width: "100%",
                            padding: "7px 8px 7px 10px",
                            borderRadius: 7,
                            border: "1px solid " + (isHighlighted ? "rgba(27,71,214,0.55)" : "transparent"),
                            background: isHighlighted ? "rgba(27,71,214,0.1)" : "transparent",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            textAlign: "left",
                          }}
                          aria-label={`Focus on ${agent.name}, ${agent.role}`}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: statusColor,
                              flexShrink: 0,
                              boxShadow: "0 0 6px " + statusColor,
                            }}
                          />
                          <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#1f1638",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {agent.name}
                            </span>
                            <span
                              style={{
                                fontSize: 9,
                                color: "#7a7390",
                                textTransform: "capitalize",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {agent.role.replace(/_/g, " ")} · {STATUS_LABELS[agent.status] ?? agent.status}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid rgba(226,232,244,0.8)",
          fontSize: 10,
          color: "#7a7390",
          lineHeight: 1.5,
        }}
      >
        Click a room to fit-frame. Click a person to focus. Double-click a
        person to open their chat.
      </div>
    </div>
  );
}
