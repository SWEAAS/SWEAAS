import { useEffect, useMemo } from "react";
import CtoReport from "../components/ui/cto-report";
import { useAgentStore } from "../store/agentStore";
import { useProjectStore } from "../store/projectStore";
import { useTeamOnboardingStore } from "../store/teamOnboardingStore";
import { mergeAgentsWithTeamConfig } from "../utils/teamOnboarding";

export default function ReportsView() {
  const { agents, fetchAgents } = useAgentStore();
  const { currentProject, fetchProjects } = useProjectStore();
  const { config, fetchConfig } = useTeamOnboardingStore();

  useEffect(() => {
    fetchAgents();
    fetchProjects();
    fetchConfig();
  }, [fetchAgents, fetchProjects, fetchConfig]);

  const displayAgents = useMemo(() => mergeAgentsWithTeamConfig(agents, config), [agents, config]);
  const contributors = useMemo(() => displayAgents, [displayAgents]);

  const reportTitle = currentProject
    ? `${currentProject.name} delivery debrief`
    : "Project Galaxy delivery debrief";
  const reportSubtitle = currentProject
    ? `A mock Slack-style report summarizing what the team learned, what moved, and what the Cto wants everyone to focus on next for ${currentProject.name}.`
    : "A mock Slack-style report summarizing what the team learned, what moved, and what the Cto wants everyone to focus on next.";

  return (
    <div>
      <CtoReport
        title={reportTitle}
        subtitle={reportSubtitle}
        contributors={contributors}
      />
    </div>
  );
}
