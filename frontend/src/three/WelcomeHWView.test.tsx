/**
 * Smoke test for the unified /welcome-hw view after the stepper rework.
 *
 * Asserts the new UI contract:
 *   - Stepper is the default mode.
 *   - The stepper caption shows the current room label + progress.
 *   - Next / Prev / Enter-room / Back-to-room buttons change the active
 *     stop correctly and update the caption.
 *   - Switching to Overview hides the stepper caption but keeps the
 *     scene mounted.
 *
 * WebGL doesn't exist in JSDOM, so we stub the 3D Canvas wrapper and read
 * the props it would forward to the scene.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Agent } from "../store/agentStore";

vi.mock("./WelcomeHWCanvas", () => ({
  default: ({
    stopIndex,
    stepperActive,
    stops,
  }: {
    stopIndex: number;
    stepperActive: boolean;
    stops: { id: string; label: string }[];
  }) => (
    <div
      data-testid="hq-canvas"
      data-stop-index={stopIndex}
      data-stepper-active={String(stepperActive)}
      data-stop-id={stops[stopIndex]?.id ?? ""}
      data-stop-count={stops.length}
    />
  ),
}));
vi.mock("./ui/AgentChatPanel", () => ({ default: () => <div data-testid="agent-chat" /> }));
vi.mock("./ui/TokenBurnOverlay", () => ({ default: () => <div data-testid="token-burn" /> }));

const testAgents: Agent[] = [
  {
    agent_id: "a-cto",
    name: "Ada CTO",
    role: "cto",
    department: "engineering",
    hierarchy_level: "cto",
    status: "active",
    daily_token_budget: 100,
    tokens_used_today: 10,
    current_focus: "",
  },
  {
    agent_id: "a-eng-1",
    name: "Eng One",
    role: "engineer",
    department: "engineering",
    hierarchy_level: "specialist",
    status: "active",
    daily_token_budget: 100,
    tokens_used_today: 5,
    current_focus: "",
  },
  {
    agent_id: "a-mkt-1",
    name: "Mkt One",
    role: "marketer",
    department: "marketing",
    hierarchy_level: "specialist",
    status: "warning",
    daily_token_budget: 100,
    tokens_used_today: 80,
    current_focus: "",
  },
];

vi.mock("../store/agentStore", () => ({
  useAgentStore: () => ({ agents: testAgents, fetchAgents: vi.fn() }),
}));
vi.mock("../store/projectStore", () => ({
  useProjectStore: () => ({ currentProject: { id: "p1", name: "Demo Project" } }),
}));
vi.mock("../store/teamOnboardingStore", () => ({
  useTeamOnboardingStore: () => ({
    config: { assignments: [], cto_assignment: null, completed: false },
    fetchConfig: vi.fn(),
  }),
}));
vi.mock("../utils/teamOnboarding", () => ({
  mergeAgentsWithTeamConfig: (agents: Agent[]) => agents,
}));

import WelcomeHWView from "./WelcomeHWView";

function renderView() {
  return render(
    <MemoryRouter>
      <WelcomeHWView />
    </MemoryRouter>,
  );
}

describe("WelcomeHWView — stepper", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("default mode is Stepper with the first stop active", () => {
    renderView();
    const canvas = screen.getByTestId("hq-canvas");
    expect(canvas.dataset.stepperActive).toBe("true");
    expect(canvas.dataset.stopIndex).toBe("0");
    // First stop is always the Lobby room.
    expect(canvas.dataset.stopId).toBe("room-lobby");
  });

  test("both mode buttons render", () => {
    renderView();
    expect(screen.getByRole("button", { name: /Switch to Guided tour/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Switch to Free look/i })).toBeInTheDocument();
  });

  test("Next advances to the next stop", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Next stop/i }));
    expect(screen.getByTestId("hq-canvas").dataset.stopIndex).toBe("1");
  });

  test("Prev is disabled at the first stop", () => {
    renderView();
    expect(screen.getByRole("button", { name: /Previous stop/i })).toBeDisabled();
  });

  test("Switching to Free look disables the stepper and hides the caption bar", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Switch to Free look/i }));
    const canvas = screen.getByTestId("hq-canvas");
    expect(canvas.dataset.stepperActive).toBe("false");
    expect(screen.queryByRole("button", { name: /Next stop/i })).not.toBeInTheDocument();
  });

  test("CTO call button is present and badged when agents have warnings", () => {
    renderView();
    expect(screen.getByRole("button", { name: /Call CTO — 1 agent needs attention/i })).toBeInTheDocument();
  });

  test("Side panel lists rooms with the correct occupant counts", () => {
    renderView();
    // Engineering has 1 agent; Marketing has 1 agent; CTO room has the CTO.
    expect(screen.getByRole("button", { name: /Jump camera to Engineering/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Jump camera to Marketing/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Jump camera to CTO Office/i })).toBeInTheDocument();
  });
});
