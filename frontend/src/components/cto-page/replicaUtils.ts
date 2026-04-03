import type { CircularGalleryItem, TavusReplica } from "./types";

export const FEATURED_REPLICA_LIMIT = 12;
const FEATURED_REPLICA_PATTERNS = [
  ["Charlie"],
  ["Luna"],
  ["Gloria"],
  ["James"],
  ["Raj - Business", "Raj Business", "Raj"],
  ["Olivia - Office", "Olivia Office", "Olivia"],
  ["Diego - Office V2", "Diego Office V2", "Diego Office"],
  ["Carter"],
  ["Ruby 2", "Ruby2", "Ruby"],
  ["Victor - Office", "Victor Office", "Victor"],
  ["Santa"],
] as const;

function normalizeReplicaName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function matchesPreferredName(replicaName: string, aliases: readonly string[]) {
  const normalizedReplicaName = normalizeReplicaName(replicaName);

  return aliases.some((alias) => {
    const normalizedAlias = normalizeReplicaName(alias);
    return (
      normalizedReplicaName === normalizedAlias ||
      normalizedReplicaName.includes(normalizedAlias)
    );
  });
}

export function createReplicaPlaceholderDataUrl(name: string) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return "";
  }

  canvas.width = 1200;
  canvas.height = 900;

  const seed = hashString(name);
  const hue = seed % 360;
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, `hsl(${hue} 52% 20%)`);
  gradient.addColorStop(0.6, `hsl(${(hue + 28) % 360} 58% 32%)`);
  gradient.addColorStop(1, `hsl(${(hue + 68) % 360} 72% 50%)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "rgba(255,255,255,0.12)";
  context.beginPath();
  context.arc(180, 170, 130, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(980, 700, 170, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "700 220px Plus Jakarta Sans";
  context.fillText(getInitials(name), canvas.width / 2, canvas.height / 2 - 55);

  context.font = "600 64px Plus Jakarta Sans";
  context.fillText(name, canvas.width / 2, canvas.height / 2 + 120);

  return canvas.toDataURL("image/jpeg", 0.88);
}

export function getFeaturedReplicas(
  replicas: TavusReplica[],
  limit = FEATURED_REPLICA_LIMIT,
) {
  const seen = new Set<string>();
  const uniqueReplicas = replicas.filter((replica) => {
    const key = normalizeReplicaName(replica.replica_name);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const picked = FEATURED_REPLICA_PATTERNS.map((aliases) =>
    uniqueReplicas.find((replica) => matchesPreferredName(replica.replica_name, aliases)),
  ).filter((replica): replica is TavusReplica => Boolean(replica));

  return picked.slice(0, Math.min(limit, FEATURED_REPLICA_PATTERNS.length));
}

export function buildGalleryItems(
  replicas: TavusReplica[],
  previewImages: Record<string, string> = {},
): CircularGalleryItem[] {
  return [
    ...replicas.map((replica) => ({
      id: replica.replica_id,
      text: replica.replica_name,
      image: replica.poster_image_url ?? previewImages[replica.replica_id],
      mediaUrl: replica.thumbnail_video_url,
      kind: "replica" as const,
    })),
    {
      id: "view-all",
      text: "View All",
      kind: "action" as const,
    },
  ];
}
