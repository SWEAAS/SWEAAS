import { ArrowLeft, Loader2, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { TavusReplica } from "./types";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ReplicaGridCard({ replica }: { replica: TavusReplica }) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      onClick={() => navigate(`/cto-call?replica=${replica.replica_id}`)}
      className="group overflow-hidden rounded-[24px] border border-[#e7e0f6] bg-white text-left shadow-[0_18px_60px_-44px_rgba(42,26,92,0.38)] transition-all hover:-translate-y-0.5 hover:border-[var(--brand-border)] hover:shadow-[0_26px_70px_-48px_rgba(42,26,92,0.42)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[linear-gradient(145deg,#120b27_0%,#33215e_55%,#7c5cff_100%)]">
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/12 text-[20px] font-semibold text-white backdrop-blur">
              {getInitials(replica.replica_name)}
            </div>
          </div>
        )}
        <video
          ref={videoRef}
          src={shouldLoad ? replica.thumbnail_video_url : undefined}
          preload="none"
          muted
          loop
          playsInline
          onLoadedData={() => setIsReady(true)}
          onMouseEnter={() => {
            void videoRef.current?.play()?.catch(() => {});
          }}
          onMouseLeave={() => {
            if (videoRef.current) {
              videoRef.current.pause();
              videoRef.current.currentTime = 0;
            }
          }}
          className={[
            "h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]",
            isReady ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#120b27] to-transparent" />
      </div>

      <div className="px-4 py-4">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand)]">
          Tavus Replica
        </div>
        <p className="m-0 text-[16px] font-semibold tracking-[-0.02em] text-[#1f1638]">
          {replica.replica_name}
        </p>
        <p className="mt-1 text-[12px] text-[#675f7e]">
          {replica.model_name}
        </p>
        <p className="mt-3 text-[12px] font-medium text-[var(--brand)]">
          Use this face for the CTO interview
        </p>
      </div>
    </button>
  );
}

interface CTOReplicaDirectoryProps {
  replicas: TavusReplica[];
  loading: boolean;
  error: string | null;
}

export default function CTOReplicaDirectory({
  replicas,
  loading,
  error,
}: CTOReplicaDirectoryProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return replicas;
    }

    return replicas.filter((replica) => {
      return (
        replica.replica_name.toLowerCase().includes(normalized) ||
        replica.model_name.toLowerCase().includes(normalized)
      );
    });
  }, [query, replicas]);

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8 md:py-10">
      <section className="overflow-hidden rounded-[32px] border border-[#e7e0f6] bg-[radial-gradient(circle_at_top_left,var(--brand-surface)_0%,transparent_44%),linear-gradient(180deg,#fcfbff_0%,#f6f3fb_100%)] p-6 shadow-[0_28px_80px_-56px_rgba(42,26,92,0.38)] md:p-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-white/75 px-3 py-1 text-xs font-medium text-[var(--brand)] backdrop-blur">
              <Sparkles size={12} />
              Global CTO directory
            </div>
            <h1 className="m-0 text-[30px] font-semibold tracking-[-0.03em] text-[#1f1638]">
              All CTO faces
            </h1>
            <p className="mt-2 max-w-[760px] text-[14px] leading-[1.7] text-[#675f7e]">
              Pick from the full replica library in the same Slack-inspired UI language as the rest
              of the product, while keeping the main call page lean.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/cto-call"
              className="inline-flex items-center gap-2 rounded-full border border-[#ece7f5] bg-white px-4 py-2 text-[12px] font-semibold text-[#675f7e] no-underline transition-colors hover:border-[var(--brand-border)] hover:bg-[var(--brand-surface)] hover:text-[var(--brand)]"
            >
              <ArrowLeft size={14} />
              Back to call
            </Link>
            <Link
              to="/cto-call"
              className="rounded-full border border-[#ece7f5] bg-white px-4 py-2 text-[12px] font-semibold text-[#675f7e] no-underline transition-colors hover:border-[var(--brand-border)] hover:bg-[var(--brand-surface)] hover:text-[var(--brand)]"
            >
              Use default face
            </Link>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#ece7f5] bg-white/90 px-3 py-1.5 text-[12px] font-medium text-[#675f7e]">
            <span>{replicas.length} total replicas</span>
            <span className="text-[#c8c0d8]">•</span>
            <span>Videos lazy-load near the viewport</span>
          </div>

          <label className="relative block w-full md:max-w-[340px]">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7a7390]"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search faces or models"
              className="w-full rounded-[14px] border border-[#ece7f5] bg-white px-10 py-3 text-[14px] text-[#1f1638] outline-none transition-colors placeholder:text-[#8d87a2] focus:border-[var(--brand-border)]"
            />
          </label>
        </div>

        {loading && (
          <div className="flex min-h-[280px] items-center justify-center rounded-[24px] border border-dashed border-[#ddd3ff] bg-white/70">
            <div className="flex items-center gap-3 text-[14px] font-medium text-[#675f7e]">
              <Loader2 size={18} className="animate-spin text-[var(--brand)]" />
              Loading Tavus replicas...
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-4 text-[14px] text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-[24px] border border-dashed border-[#ddd3ff] bg-white/70 px-6 py-12 text-center">
            <p className="m-0 text-[15px] font-semibold text-[#1f1638]">
              No faces match "{query}"
            </p>
            <p className="mt-2 text-[13px] text-[#675f7e]">
              Try a replica name or model name instead.
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((replica) => (
              <ReplicaGridCard key={replica.replica_id} replica={replica} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
