"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActivity, getIdeas, getStats } from "@/lib/api";
import type { ActivityResponse, Idea, IdeasListResponse, Stats } from "@/lib/types";
import IdeaCard from "@/components/IdeaCard";
import SearchBar from "@/components/SearchBar";

export default function Dashboard() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ideasData, statsData, activityData] = await Promise.all([
          getIdeas(0, 6) as Promise<IdeasListResponse>,
          getStats() as Promise<Stats>,
          getActivity(30) as Promise<ActivityResponse>,
        ]);
        setIdeas(ideasData.items);
        setStats(statsData);
        setActivity(activityData);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const topMood =
    stats?.moods && Object.keys(stats.moods).length > 0
      ? Object.keys(stats.moods)[0]
      : "No pattern yet";
  const topGenre =
    stats?.genres && Object.keys(stats.genres).length > 0
      ? Object.keys(stats.genres)[0]
      : "No pattern yet";
  const activityMap = new Map(activity?.items.map((entry) => [entry.date, entry.count]) ?? []);
  const maxActivity = Math.max(1, ...Array.from(activityMap.values()));
  const heatmapDays = Array.from({ length: 30 }).map((_, idx) => {
    const d = new Date(2026, 3, idx + 1); // April 1-30, 2026 (month is 0-indexed)
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const date = `${year}-${month}-${day}`;
    const count = activityMap.get(date) ?? 0;
    return { date, count };
  });

  const squareClass = (count: number) => {
    if (count <= 0) return "activity-square activity-level-0";
    const ratio = count / maxActivity;
    if (ratio < 0.34) return "activity-square activity-level-1";
    if (ratio < 0.67) return "activity-square activity-level-2";
    return "activity-square activity-level-3";
  };

  return (
    <div className="page-shell page-stack">
      <section className="page-hero animate-fade-in">
        <div className="hero-grid lg:grid-cols-[1.6fr_0.9fr] lg:items-end">
          <div>
            <p className="eyebrow">studio memory system</p>
            <h1 className="display-title max-w-3xl">
              Save the riff before the room forgets it.
            </h1>
            <p className="lede mt-5">
              Dhwanix turns scattered melodies, loops, and fragments into a catalog
              you can revisit, search, and evolve like drafts in a recording notebook.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/capture" className="button-primary">
                Capture a new idea
              </Link>
              <Link href="/ideas" className="button-secondary">
                Browse library
              </Link>
            </div>
          </div>

          <div className="panel panel-strong grid gap-4 p-5">
            <div>
              <p className="metric-label">Current pulse</p>
              <p className="section-title mt-2">Your archive at a glance</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[1.25rem] bg-[rgba(34,27,22,0.92)] p-4 text-[#fff7f0]">
                <p className="metric-label text-[rgba(255,247,240,0.64)]">Ideas</p>
                <p className="mt-2 text-3xl font-[family-name:var(--font-display)]">
                  {stats?.total_ideas ?? 0}
                </p>
              </div>
              <div className="rounded-[1.25rem] bg-[rgba(207,236,243,0.5)] p-4">
                <p className="metric-label">Versions</p>
                <p className="mt-2 text-3xl font-[family-name:var(--font-display)]">
                  {stats?.total_versions ?? 0}
                </p>
              </div>
            </div>

            <div className="grid gap-2 text-sm text-[var(--muted)]">
              <div className="flex items-center justify-between rounded-2xl border border-[rgba(68,54,40,0.08)] bg-[rgba(255,252,247,0.72)] px-4 py-3">
                <span>Top mood</span>
                <span className="font-semibold capitalize text-[var(--text)]">{topMood}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-[rgba(68,54,40,0.08)] bg-[rgba(255,252,247,0.72)] px-4 py-3">
                <span>Top genre</span>
                <span className="font-semibold capitalize text-[var(--text)]">{topGenre}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="animate-fade-in animate-fade-in-delay-1">
        <SearchBar />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 animate-fade-in animate-fade-in-delay-2">
        {[
          {
            label: "Total ideas",
            value: stats?.total_ideas ?? 0,
            note: "Captured sketches and drafts",
          },
          {
            label: "Versions",
            value: stats?.total_versions ?? 0,
            note: "Iterations stored across branches",
          },
          {
            label: "Dominant mood",
            value: topMood,
            note: "The emotional center of the archive",
          },
          {
            label: "Lead genre",
            value: topGenre,
            note: "Most recurring stylistic signal",
          },
        ].map((item, index) => (
          <div
            key={item.label}
            className="panel panel-hover metric-card animate-fade-in"
            style={{ animationDelay: `${index * 0.06}s` }}
          >
            <span className="stat-kicker">{item.label}</span>
            <p className="metric-value capitalize">{item.value}</p>
            <p className="text-sm leading-6 text-[var(--muted)]">{item.note}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_0.85fr]">
        <section className="page-stack animate-fade-in animate-fade-in-delay-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-3">recent drafts</p>
              <h2 className="section-title">Newest ideas in the room</h2>
            </div>
            <Link href="/ideas" className="button-ghost">
              View all ideas
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="panel h-56 animate-pulse" />
              ))}
            </div>
          ) : ideas.length === 0 ? (
            <div className="empty-state">
              <p className="section-title text-[2rem]">The archive is still quiet.</p>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[var(--muted)]">
                Open capture and record the first riff, melody, or rhythm fragment you
                want to keep.
              </p>
              <Link href="/capture" className="button-primary mt-6">
                Start the first capture
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {ideas.map((idea, i) => (
                <IdeaCard key={idea.id} idea={idea} index={i} />
              ))}
            </div>
          )}
        </section>

        <aside className="page-stack animate-fade-in animate-fade-in-delay-4">
          <div className="panel p-6">
            <p className="eyebrow">quick moves</p>
            <div className="mt-2 grid gap-3">
              <Link href="/capture" className="panel panel-hover rounded-[1.25rem] p-4">
                <p className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--text)]">
                  Capture
                </p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-3xl leading-none">
                  Record an idea
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Store the last minute of audio the moment inspiration hits.
                </p>
              </Link>

              <Link href="/evolution" className="panel panel-hover rounded-[1.25rem] p-4">
                <p className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--text)]">
                  Evolution
                </p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-3xl leading-none">
                  Follow branches
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  See how one sketch turns into alternate takes and refined versions.
                </p>
              </Link>
            </div>
          </div>

          <div className="panel p-6">
            <p className="eyebrow">workflow</p>
            <div className="grid gap-4">
              {[
                "Listen in the background while you play or hum.",
                "Capture the last minute once something feels worth saving.",
                "Return later to search, compare, and branch the strongest ideas.",
              ].map((step, index) => (
                <div key={step} className="flex gap-3">
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(34,27,22,0.92)] text-xs font-bold text-[#fff7f0]">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-7 text-[var(--muted)]">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-6">
            <div className="flex items-center justify-between">
              <p className="eyebrow">activity</p>
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--soft)]">
                April 2026
              </span>
            </div>
            <p className="mt-1 text-sm leading-7 text-[var(--muted)]">
              Daily capture activity for April 2026.
            </p>
            <div className="activity-grid mt-4">
              {heatmapDays.map((day) => {
                const d = new Date(day.date + "T00:00:00");
                const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                const tooltip = `${label} — ${day.count} capture${day.count === 1 ? "" : "s"}`;
                return (
                  <div
                    key={day.date}
                    className={squareClass(day.count)}
                    data-tooltip={tooltip}
                  />
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-[var(--soft)]">
              <span>1st – 30th April</span>
              <span>{activity?.items.reduce((sum, item) => sum + item.count, 0) ?? 0} total captures</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
