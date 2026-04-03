import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import CircularGallery from "./CircularGallery";
import {
  buildGalleryItems,
  createReplicaPlaceholderDataUrl,
  getFeaturedReplicas,
} from "./replicaUtils";
import type { CircularGalleryItem, TavusReplica } from "./types";

interface CTOReplicaSelectorProps {
  replicas: TavusReplica[];
  selectedReplica: TavusReplica | null;
  onSelect: (replica: TavusReplica | null) => void;
  loading?: boolean;
  error?: string | null;
}

export default function CTOReplicaSelector({
  replicas,
  selectedReplica,
  onSelect,
  loading = false,
  error = null,
}: CTOReplicaSelectorProps) {
  const featuredReplicas = useMemo(
    () => getFeaturedReplicas(replicas),
    [replicas],
  );
  const placeholderImages = useMemo(
    () =>
      Object.fromEntries(
        featuredReplicas.map((replica) => [
          replica.replica_id,
          createReplicaPlaceholderDataUrl(replica.replica_name),
        ]),
      ),
    [featuredReplicas],
  );
  const galleryItems = useMemo(
    () => buildGalleryItems(featuredReplicas, placeholderImages),
    [featuredReplicas, placeholderImages],
  );
  const [focusedItem, setFocusedItem] = useState<CircularGalleryItem | null>(
    galleryItems[0] ?? null,
  );
  const effectiveFocusedItem = focusedItem ?? galleryItems[0] ?? null;

  if (loading) {
    return (
      <section className="mt-9 w-full max-w-5xl rounded-[28px] border border-[#e7e0f6] bg-[radial-gradient(circle_at_top_left,var(--brand-surface)_0%,transparent_42%),linear-gradient(180deg,#fcfbff_0%,#f6f3fb_100%)] px-5 py-5 shadow-[0_24px_70px_-50px_rgba(42,26,92,0.3)] md:px-7 md:py-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-white/75 px-3 py-1 text-xs font-medium text-[var(--brand)] backdrop-blur">
          <Sparkles size={12} />
          Featured Tavus faces
        </div>
        <div className="rounded-[22px] border border-[#ece7f5] bg-white/88 px-4 py-6 text-[13px] text-[#675f7e] backdrop-blur">
          Loading Tavus replicas for the Cto picker...
        </div>
      </section>
    );
  }

  if (replicas.length === 0) {
    return (
      <section className="mt-9 w-full max-w-5xl rounded-[28px] border border-[#e7e0f6] bg-[radial-gradient(circle_at_top_left,var(--brand-surface)_0%,transparent_42%),linear-gradient(180deg,#fcfbff_0%,#f6f3fb_100%)] px-5 py-5 shadow-[0_24px_70px_-50px_rgba(42,26,92,0.3)] md:px-7 md:py-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-white/75 px-3 py-1 text-xs font-medium text-[var(--brand)] backdrop-blur">
          <Sparkles size={12} />
          Featured Tavus faces
        </div>
        <div className="space-y-3 rounded-[22px] border border-[#ece7f5] bg-white/88 px-4 py-5 backdrop-blur">
          <p className="m-0 text-[14px] font-semibold text-[#1f1638]">Replica picker unavailable</p>
          <p className="m-0 text-[13px] leading-[1.6] text-[#675f7e]">
            {error ??
              "We could not load Tavus replicas right now. You can still continue with the default Cto face while the replica library is unavailable."}
          </p>
          <button
            onClick={() => onSelect(null)}
            className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-chip)] px-3.5 py-2 text-[12px] font-semibold text-[var(--brand)] transition-colors hover:bg-[var(--brand-surface)]"
          >
            Use default face
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-9 w-full max-w-5xl overflow-hidden rounded-[28px] border border-[#e7e0f6] bg-[radial-gradient(circle_at_top_left,var(--brand-surface)_0%,transparent_42%),linear-gradient(180deg,#fcfbff_0%,#f6f3fb_100%)] px-5 py-5 shadow-[0_24px_70px_-50px_rgba(42,26,92,0.3)] md:px-7 md:py-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-white/75 px-3 py-1 text-xs font-medium text-[var(--brand)] backdrop-blur">
            <Sparkles size={12} />
            Featured Tavus faces
          </div>
          <h2 className="m-0 text-[20px] font-semibold tracking-[-0.02em] text-[#1f1638]">
            Browse fast, open the full directory only when you need it
          </h2>
          <p className="mt-2 max-w-[640px] text-[13px] leading-[1.6] text-[#675f7e]">
            The call page now keeps only a curated set of Cto faces live here for speed.
            We serve local poster images immediately, then only upgrade the centered card to live Tavus video.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setFocusedItem({
                id: "default-face",
                text: "Default Cto",
                kind: "action",
              });
              onSelect(null);
            }}
            className={[
              "rounded-full border px-3.5 py-2 text-[12px] font-semibold transition-colors",
              selectedReplica === null
                ? "border-[var(--brand-border)] bg-[var(--brand-chip)] text-[var(--brand)]"
                : "border-[#ece7f5] bg-white text-[#675f7e] hover:bg-[var(--brand-surface)]",
            ].join(" ")}
          >
            Use default face
          </button>
          <Link
            to="/cto-call/all"
            className="rounded-full border border-[#ece7f5] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#675f7e] no-underline transition-colors hover:border-[var(--brand-border)] hover:bg-[var(--brand-surface)] hover:text-[var(--brand)]"
          >
            View all
          </Link>
        </div>
      </div>

      <div className="relative h-[430px] overflow-hidden rounded-[24px] border border-white/70 bg-[#100a22] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] md:h-[520px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-[#100a22] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-[#100a22] to-transparent" />
        <CircularGallery
          items={galleryItems}
          bend={1}
          borderRadius={0.06}
          scrollSpeed={2}
          scrollEase={0.05}
          textColor="#ffffff"
          onActiveItemChange={(item) => {
            if (item?.id && item?.text) {
              setFocusedItem(item as CircularGalleryItem);
            } else {
              setFocusedItem(null);
            }
          }}
          onItemClick={(item) => {
            if (item.kind === "replica") {
              const replica = featuredReplicas.find(
                (candidate) => candidate.replica_id === item.id,
              );
              if (replica) {
                onSelect(replica);
              }
            }
          }}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-[22px] border border-[#ece7f5] bg-white/88 px-4 py-4 backdrop-blur md:flex-row md:items-center md:justify-between md:px-5">
        <div>
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7a7390]">
            Selected face
          </p>
          <p className="mt-1 text-[16px] font-semibold text-[#1f1638]">
            {selectedReplica?.replica_name ?? "Default Cto"}
          </p>
          <p className="mt-1 text-[12px] text-[#675f7e]">
            {selectedReplica
              ? `${selectedReplica.model_name} replica ready for the interview`
              : "Use the platform default if you want the quickest path into the call."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {effectiveFocusedItem?.id === "view-all" && (
            <Link
              to="/cto-call/all"
              className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-chip)] px-3.5 py-2 text-[12px] font-semibold text-[var(--brand)] no-underline transition-colors hover:bg-[var(--brand-surface)]"
            >
              Open full Cto directory
            </Link>
          )}
          <span className="rounded-full border border-[#ece7f5] bg-[#f8f6fc] px-3 py-1.5 text-[11px] font-medium text-[#7a7390]">
            Click the centered face to select it
          </span>
          <span className="rounded-full border border-[#ece7f5] bg-[#f8f6fc] px-3 py-1.5 text-[11px] font-medium text-[#7a7390]">
            {featuredReplicas.length} fast-loaded faces here
          </span>
          <span className="rounded-full border border-[#ece7f5] bg-[#f8f6fc] px-3 py-1.5 text-[11px] font-medium text-[#7a7390]">
            {Math.max(replicas.length - featuredReplicas.length, 0)} more in the directory
          </span>
        </div>
      </div>
    </section>
  );
}
