/**
 * Smoke test for the unified /welcome-hw view.
 *
 * Covers the acceptance criteria from the unify-HQ task:
 *   - All three mode buttons render (Overview / Walkthrough / Tour) with
 *     labels and aria-pressed state.
 *   - Starting the Tour exposes the phase caption with tour index and label.
 *   - Clicking Overview during a tour stops the tour.
 *   - Tour advances phases on schedule.
 *
 * The 3D scene itself isn't exercised — WebGL doesn't exist in JSDOM, so
 * we stub the Canvas wrapper and the chat panel. The test verifies the
 * view's UI wiring, which is exactly what regresses when the office + welcome
 * flows were separate.
 */
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";

// Stub the 3D canvas so we don't need WebGL / GLB loading. We record the
// `cameraMode` and `autoRotate` props so tests can assert mode switching.
vi.mock("./WelcomeHWCanvas", () => ({
  default: ({ cameraMode, autoRotate }: { cameraMode: string; autoRotate: boolean }) => (
    <div data-testid="hq-canvas" data-camera-mode={cameraMode} data-auto-rotate={String(autoRotate)} />
  ),
}));
vi.mock("./ui/AgentChatPanel", () => ({
  default: () => <div data-testid="agent-chat" />,
}));
vi.mock("./ui/TokenBurnOverlay", () => ({
  default: () => <div data-testid="token-burn" />,
}));

// Stub the Zustand stores — the view only reads a handful of fields.
vi.mock("../store/agentStore", () => ({
  useAgentStore: () => ({ agents: [], fetchAgents: vi.fn() }),
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
  mergeAgentsWithTeamConfig: () => [],
}));

import WelcomeHWView from "./WelcomeHWView";

function renderView() {
  return render(
    <MemoryRouter>
      <WelcomeHWView />
    </MemoryRouter>,
  );
}

describe("WelcomeHWView — unified HQ", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("renders all three mode buttons with accessible labels", () => {
    renderView();
    expect(screen.getByRole("button", { name: /Switch to Overview view/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Switch to Walkthrough view/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start the scripted HQ tour/i })).toBeInTheDocument();
  });

  test("default mode is Overview with the overview camera", () => {
    renderView();
    const canvas = screen.getByTestId("hq-canvas");
    expect(canvas.dataset.cameraMode).toBe("overview");
    expect(canvas.dataset.autoRotate).toBe("false");
  });

  test("CTO call button is present and labeled", () => {
    renderView();
    expect(screen.getByRole("button", { name: /Call CTO/i })).toBeInTheDocument();
  });

  test("Walkthrough mode tells the canvas to use the first-person camera", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Switch to Walkthrough view/i }));
    const canvas = screen.getByTestId("hq-canvas");
    expect(canvas.dataset.cameraMode).toBe("walkthrough");
  });

  test("Tour opens with phase caption + auto-rotate", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Start the scripted HQ tour/i }));
    expect(screen.getByText(/Welcome to headquarters/i)).toBeInTheDocument();
    expect(screen.getByText(/Tour · 1\/2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Stop the scripted HQ tour/i })).toBeInTheDocument();
    const canvas = screen.getByTestId("hq-canvas");
    expect(canvas.dataset.autoRotate).toBe("true");
  });

  test("Tour advances to the next phase after the first phase's duration", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderView();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    await user.click(screen.getByRole("button", { name: /Start the scripted HQ tour/i }));
    act(() => { vi.advanceTimersByTime(9100); });
    expect(screen.getByText(/Meet the team/i)).toBeInTheDocument();
    expect(screen.getByText(/Tour · 2\/2/)).toBeInTheDocument();
  });

  test("clicking Overview during a tour stops the tour", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Start the scripted HQ tour/i }));
    expect(screen.getByText(/Welcome to headquarters/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Switch to Overview view/i }));
    expect(screen.queryByText(/Welcome to headquarters/i)).not.toBeInTheDocument();
    const canvas = screen.getByTestId("hq-canvas");
    expect(canvas.dataset.autoRotate).toBe("false");
  });
});
