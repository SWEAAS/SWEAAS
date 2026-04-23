import type { TavusReplica } from "../components/cto-page/types";
import {
  FEATURED_REPLICA_LIMIT,
  getFeaturedReplicas,
} from "../components/cto-page/replicaUtils";
import type { Agent } from "../store/agentStore";
import type {
  DepartmentSizes,
  TeamOnboardingConfig,
  TeamPersonaAssignment,
} from "../store/teamOnboardingStore";
import {
  MAX_PERSONA_NAME_VARIANTS,
  MAX_TEAM_ASSIGNMENTS,
  MAX_UNIQUE_NON_SANTA_PERSONAS,
} from "../store/teamOnboardingStore";

type DepartmentKey = keyof DepartmentSizes;

type RoleTemplate = {
  agent_id: string;
  role: string;
  role_label: string;
  hierarchy_level: "manager" | "specialist";
  department: DepartmentKey;
};

export const DEPARTMENT_ROLE_TEMPLATES: Record<DepartmentKey, RoleTemplate[]> = {
  engineering: [
    { agent_id: "eng-mgr-01", role: "engineering_manager", role_label: "Engineering Manager", hierarchy_level: "manager", department: "engineering" },
    { agent_id: "eng-fe-01", role: "frontend_dev", role_label: "Frontend Developer", hierarchy_level: "specialist", department: "engineering" },
    { agent_id: "eng-be-01", role: "backend_architect", role_label: "Backend Architect", hierarchy_level: "specialist", department: "engineering" },
    { agent_id: "eng-devops-01", role: "devops", role_label: "DevOps Automator", hierarchy_level: "specialist", department: "engineering" },
    { agent_id: "eng-qa-01", role: "qa_tester", role_label: "QA Engineer", hierarchy_level: "specialist", department: "engineering" },
  ],
  marketing: [
    { agent_id: "mkt-mgr-01", role: "marketing_manager", role_label: "Marketing Manager", hierarchy_level: "manager", department: "marketing" },
    { agent_id: "mkt-growth-01", role: "growth_analyst", role_label: "Growth Analyst", hierarchy_level: "specialist", department: "marketing" },
  ],
  product: [
    { agent_id: "prd-mgr-01", role: "product_manager", role_label: "Product Manager", hierarchy_level: "manager", department: "product" },
    { agent_id: "prd-ops-01", role: "product_ops", role_label: "Product Operations", hierarchy_level: "specialist", department: "product" },
  ],
  support: [
    { agent_id: "sup-mgr-01", role: "support_manager", role_label: "Customer Success Manager", hierarchy_level: "manager", department: "support" },
    { agent_id: "sup-cs-01", role: "customer_support", role_label: "Customer Support", hierarchy_level: "specialist", department: "support" },
  ],
} as const;

// Zero defaults: when a caller has nothing to fall back to, we surface "no
// data yet" (zeros) rather than imputing a fake 50-person org. The main
// producer of real distributions is `buildDepartmentSizesForCompanySize`,
// which derives sizes from the user's configured company size.
const DEFAULT_DEPARTMENT_SIZES: DepartmentSizes = {
  engineering: 0,
  marketing: 0,
  product: 0,
  support: 0,
};

const WORK_HINTS = ["office", "business", "professional", "v2", "bright", "warm"];
const AVOID_HINTS = ["deprecated", "selfie", "doctor", "outdoor", "casual", "home"];
const EMPLOYEE_EXCLUDED_BASE_NAMES = new Set(["santa"]);
const DEPARTMENT_WEIGHT_ORDER: Array<[DepartmentKey, number]> = [
  ["engineering", 5],
  ["marketing", 2],
  ["product", 2],
  ["support", 2],
];
const MAX_REPORTS_PER_MANAGER = 8;

type SyntheticAgentSeed = Pick<
  Agent,
  "department" | "role" | "hierarchy_level" | "status" | "daily_token_budget" | "tokens_used_today" | "current_focus" | "parent_agent_id"
>;

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeReplicaName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getBasePersonaKey(name: string) {
  return normalizeReplicaName(name)
    .replace(/\b(v1|v2|v3)\b/g, "")
    .replace(/\b\d+\b/g, "")
    .split(" ")
    .slice(0, 1)
    .join(" ")
    .trim();
}

function getDisplayBaseName(name: string) {
  const base = getBasePersonaKey(name);
  return titleCase(base || name.trim());
}

function rankReplica(replica: TavusReplica) {
  const normalized = normalizeReplicaName(replica.replica_name);
  let score = 0;

  for (const hint of WORK_HINTS) {
    if (normalized.includes(hint)) score += 20;
  }

  for (const hint of AVOID_HINTS) {
    if (normalized.includes(hint)) score -= 20;
  }

  if (replica.model_name.includes("phoenix-4")) score += 8;
  if (replica.model_name.includes("phoenix-3")) score += 4;

  return score;
}

function buildReplicaDisplayName(baseName: string, occurrenceIndex: number) {
  if (occurrenceIndex <= 0) {
    return baseName;
  }
  if (occurrenceIndex <= 26) {
    return `${baseName} ${String.fromCharCode(64 + occurrenceIndex)}`;
  }

  const pairIndex = occurrenceIndex - 27;
  const first = String.fromCharCode(65 + Math.floor(pairIndex / 26));
  const second = String.fromCharCode(65 + (pairIndex % 26));
  return `${baseName} ${first} ${second}`;
}

function getDepartmentTotal(departmentSizes: DepartmentSizes) {
  return Object.values(departmentSizes).reduce((sum, value) => sum + value, 0);
}

export function buildDepartmentSizesForCompanySize(companySize: number): DepartmentSizes {
  const target = Math.max(0, Math.min(MAX_TEAM_ASSIGNMENTS, companySize - 1));
  if (target === 0) {
    return { engineering: 0, marketing: 0, product: 0, support: 0 };
  }

  const totalWeight = DEPARTMENT_WEIGHT_ORDER.reduce((sum, [, weight]) => sum + weight, 0);
  const next: DepartmentSizes = { engineering: 0, marketing: 0, product: 0, support: 0 };
  const remainders: Array<{ department: DepartmentKey; remainder: number }> = [];
  let allocated = 0;

  for (const [department, weight] of DEPARTMENT_WEIGHT_ORDER) {
    const raw = (target * weight) / totalWeight;
    const base = Math.floor(raw);
    next[department] = base;
    allocated += base;
    remainders.push({ department, remainder: raw - base });
  }

  remainders
    .sort((a, b) => b.remainder - a.remainder)
    .slice(0, target - allocated)
    .forEach(({ department }) => {
      next[department] += 1;
    });

  return next;
}

export function normalizeDepartmentSizesForCompanySize(
  companySize: number,
  current?: Partial<DepartmentSizes> | null,
): DepartmentSizes {
  const target = Math.max(0, Math.min(MAX_TEAM_ASSIGNMENTS, companySize - 1));
  if (target === 0) {
    return { engineering: 0, marketing: 0, product: 0, support: 0 };
  }

  const existing = getDepartmentSizesWithFallback(current);
  const currentTotal = getDepartmentTotal(existing);
  if (currentTotal === target) {
    return existing;
  }
  if (currentTotal <= 0) {
    return buildDepartmentSizesForCompanySize(companySize);
  }

  const next: DepartmentSizes = { engineering: 0, marketing: 0, product: 0, support: 0 };
  const remainders: Array<{ department: DepartmentKey; remainder: number }> = [];
  let allocated = 0;

  for (const department of Object.keys(existing) as DepartmentKey[]) {
    const raw = (existing[department] / currentTotal) * target;
    const base = Math.floor(raw);
    next[department] = base;
    allocated += base;
    remainders.push({ department, remainder: raw - base });
  }

  remainders
    .sort((a, b) => b.remainder - a.remainder)
    .slice(0, target - allocated)
    .forEach(({ department }) => {
      next[department] += 1;
    });

  return next;
}

export function getDepartmentSizesWithFallback(
  departmentSizes?: Partial<DepartmentSizes> | null,
): DepartmentSizes {
  return {
    engineering: departmentSizes?.engineering ?? DEFAULT_DEPARTMENT_SIZES.engineering,
    marketing: departmentSizes?.marketing ?? DEFAULT_DEPARTMENT_SIZES.marketing,
    product: departmentSizes?.product ?? DEFAULT_DEPARTMENT_SIZES.product,
    support: departmentSizes?.support ?? DEFAULT_DEPARTMENT_SIZES.support,
  };
}

export function getRoleLabelForAssignment(assignment: Pick<TeamPersonaAssignment, "department" | "archetype_agent_id" | "agent_id" | "role">) {
  const templates = DEPARTMENT_ROLE_TEMPLATES[assignment.department] ?? [];
  const template = templates.find(
    (candidate) => candidate.agent_id === assignment.archetype_agent_id || candidate.agent_id === assignment.agent_id,
  );
  return template?.role_label ?? assignment.role.replace(/_/g, " ");
}

export function recommendTeamAssignments(
  replicas: TavusReplica[],
  departmentSizes: DepartmentSizes,
  configuredCto: TeamPersonaAssignment | null,
) {
  const featured = getFeaturedReplicas(replicas, FEATURED_REPLICA_LIMIT);
  const byId = new Map(replicas.map((replica) => [replica.replica_id, replica] as const));
  const preferredOrder = new Map(featured.map((replica, index) => [getBasePersonaKey(replica.replica_name), index]));
  const canonicalByBase = new Map<string, TavusReplica>();
  for (const replica of replicas) {
    const baseKey = getBasePersonaKey(replica.replica_name);
    if (!baseKey || EMPLOYEE_EXCLUDED_BASE_NAMES.has(baseKey)) continue;
    const existing = canonicalByBase.get(baseKey);
    if (!existing || rankReplica(replica) > rankReplica(existing)) {
      canonicalByBase.set(baseKey, replica);
    }
  }

  const canonicalPool = [...canonicalByBase.values()]
    .sort((a, b) => {
      const aPreferred = preferredOrder.get(getBasePersonaKey(a.replica_name));
      const bPreferred = preferredOrder.get(getBasePersonaKey(b.replica_name));
      if (aPreferred !== undefined || bPreferred !== undefined) {
        return (aPreferred ?? Number.MAX_SAFE_INTEGER) - (bPreferred ?? Number.MAX_SAFE_INTEGER);
      }
      return rankReplica(b) - rankReplica(a) || a.replica_name.localeCompare(b.replica_name);
    })
    .slice(0, MAX_UNIQUE_NON_SANTA_PERSONAS);

  if (canonicalPool.length === 0) {
    return {
      cto_assignment: configuredCto ?? null,
      assignments: [],
    };
  }

  if (configuredCto?.replica_id) {
    canonicalPool.sort((a, b) => Number(a.replica_id === configuredCto.replica_id) - Number(b.replica_id === configuredCto.replica_id));
  }

  const roleSlots = buildRoleSlots(departmentSizes);
  const assignments: TeamPersonaAssignment[] = [];
  const personaUsage = new Map<string, number>();

  for (let slotIndex = 0; slotIndex < roleSlots.length; slotIndex += 1) {
    const slot = roleSlots[slotIndex];
    const replica = canonicalPool[slotIndex % canonicalPool.length];
    if (!replica) break;

    const occurrenceIndex = personaUsage.get(replica.replica_id) ?? 0;
    if (occurrenceIndex >= MAX_PERSONA_NAME_VARIANTS) {
      break;
    }
    const displayName = buildReplicaDisplayName(getDisplayBaseName(replica.replica_name), occurrenceIndex);
    personaUsage.set(replica.replica_id, occurrenceIndex + 1);

    assignments.push({
      agent_id: slot.agent_id,
      archetype_agent_id: slot.archetype_agent_id,
      replica_id: replica.replica_id,
      replica_name: displayName,
      model_name: replica.model_name,
      poster_image_url: replica.poster_image_url ?? null,
      thumbnail_video_url: replica.thumbnail_video_url,
      department: slot.department,
      role: slot.role,
      hierarchy_level: slot.hierarchy_level,
      parent_agent_id: slot.parent_agent_id,
    });
  }

  const resolvedCto =
    configuredCto && byId.has(configuredCto.replica_id)
      ? {
          agent_id: "cto-01",
          archetype_agent_id: "cto-01",
          department: "engineering",
          role: "cto",
          hierarchy_level: "cto",
          parent_agent_id: null,
          ...byId.get(configuredCto.replica_id)!,
        }
      : configuredCto;

  return {
    cto_assignment: resolvedCto ?? null,
    assignments,
  };
}

export function mergeAgentsWithTeamConfig(agents: Agent[], config: TeamOnboardingConfig | null) {
  if (!config?.completed) {
    return agents;
  }

  const archetypeAgents = new Map(agents.map((agent) => [agent.agent_id, agent] as const));
  const assignments = [
    ...(config.cto_assignment ? [config.cto_assignment] : []),
    ...config.assignments,
  ];

  return assignments.map((assignment) => {
    const archetype = archetypeAgents.get(assignment.archetype_agent_id ?? assignment.agent_id);
    return synthesizeAgentFromAssignment(assignment, archetype);
  });
}

function synthesizeAgentFromAssignment(
  assignment: TeamPersonaAssignment,
  archetype?: Agent,
): Agent & { archetype_agent_id?: string | null } {
  const fallback = getFallbackSeed(assignment);

  return {
    agent_id: assignment.agent_id,
    archetype_agent_id: assignment.archetype_agent_id ?? assignment.agent_id,
    name: assignment.replica_name,
    role: assignment.role || archetype?.role || fallback.role,
    department: assignment.department || archetype?.department || fallback.department,
    hierarchy_level: assignment.hierarchy_level || archetype?.hierarchy_level || fallback.hierarchy_level,
    status: archetype?.status ?? fallback.status,
    daily_token_budget: archetype?.daily_token_budget ?? fallback.daily_token_budget,
    tokens_used_today: archetype?.tokens_used_today ?? fallback.tokens_used_today,
    current_focus: archetype?.current_focus ?? fallback.current_focus,
    parent_agent_id: assignment.parent_agent_id ?? archetype?.parent_agent_id ?? fallback.parent_agent_id,
    replica_id: assignment.replica_id,
    poster_image_url: assignment.poster_image_url ?? null,
    thumbnail_video_url: assignment.thumbnail_video_url,
    model_name: assignment.model_name,
  };
}

function getFallbackSeed(assignment: Pick<TeamPersonaAssignment, "department" | "role" | "hierarchy_level" | "parent_agent_id">): SyntheticAgentSeed {
  const baseBudgetByLevel = {
    cto: 200_000,
    manager: 100_000,
    specialist: 75_000,
  } as const;

  return {
    department: assignment.department,
    role: assignment.role,
    hierarchy_level: assignment.hierarchy_level,
    status: "active",
    daily_token_budget: baseBudgetByLevel[assignment.hierarchy_level] ?? 75_000,
    tokens_used_today: 0,
    current_focus: "Standing by for new delegation.",
    parent_agent_id: assignment.parent_agent_id ?? null,
  };
}

function buildRoleSlots(departmentSizes: DepartmentSizes) {
  const slots: Array<{
    agent_id: string;
    archetype_agent_id: string;
    department: DepartmentKey;
    role: string;
    hierarchy_level: "manager" | "specialist";
    parent_agent_id: string | null;
  }> = [];

  for (const [department, totalCount] of Object.entries(departmentSizes) as Array<[DepartmentKey, number]>) {
    if (totalCount <= 0) continue;

    const templates = DEPARTMENT_ROLE_TEMPLATES[department];
    const managerTemplate = templates.find((template) => template.hierarchy_level === "manager");
    const specialistTemplates = templates.filter((template) => template.hierarchy_level === "specialist");
    if (!managerTemplate) continue;

    const managerCounts = new Map<string, number>();
    const specialistCounts = new Map<string, number>();
    const managerQueue: Array<{ agent_id: string; remaining_slots: number }> = [];
    let totalAvailableSlots = 0;

    const createManager = (parentAgentId: string | null) => {
      const nextIndex = (managerCounts.get(managerTemplate.agent_id) ?? 0) + 1;
      managerCounts.set(managerTemplate.agent_id, nextIndex);
      const agent_id = incrementAgentId(managerTemplate.agent_id, nextIndex);
      slots.push({
        agent_id,
        archetype_agent_id: managerTemplate.agent_id,
        department,
        role: managerTemplate.role,
        hierarchy_level: "manager",
        parent_agent_id: parentAgentId,
      });
      managerQueue.push({ agent_id, remaining_slots: MAX_REPORTS_PER_MANAGER });
      totalAvailableSlots += MAX_REPORTS_PER_MANAGER;
      return agent_id;
    };

    createManager("cto-01");
    let remaining = totalCount - 1;
    let specialistIndex = 0;

    while (remaining > 0) {
      const parent = managerQueue.find((candidate) => candidate.remaining_slots > 0);
      if (!parent) break;

      if (totalAvailableSlots < remaining) {
        createManager(parent.agent_id);
        parent.remaining_slots -= 1;
        totalAvailableSlots -= 1;
      } else {
        const template = specialistTemplates[specialistIndex % specialistTemplates.length] ?? managerTemplate;
        specialistIndex += 1;
        const nextIndex = (specialistCounts.get(template.agent_id) ?? 0) + 1;
        specialistCounts.set(template.agent_id, nextIndex);
        slots.push({
          agent_id: incrementAgentId(template.agent_id, nextIndex),
          archetype_agent_id: template.agent_id,
          department,
          role: template.role,
          hierarchy_level: "specialist",
          parent_agent_id: parent.agent_id,
        });
        parent.remaining_slots -= 1;
        totalAvailableSlots -= 1;
      }

      remaining -= 1;
    }
  }

  return slots;
}

function incrementAgentId(baseAgentId: string, nextIndex: number) {
  const prefix = baseAgentId.replace(/-\d+$/, "");
  return `${prefix}-${String(nextIndex).padStart(2, "0")}`;
}
