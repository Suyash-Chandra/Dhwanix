"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { getIdeaGraph, getIdeas } from "@/lib/api";
import type { GraphResponse, Idea, IdeasListResponse } from "@/lib/types";

const EvolutionGraph = dynamic(() => import("@/components/EvolutionGraph"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-[var(--muted)]">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 rounded-full border-2 border-[rgba(207,236,243,0.95)] border-t-[var(--accent)] animate-spin" />
        <p className="text-sm font-medium">Loading graph engine...</p>
      </div>
    </div>
  ),
});

function EvolutionContent() {
  const searchParams = useSearchParams();
  const ideaIdParam = searchParams.get("idea");

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState<number | null>(
    ideaIdParam ? Number(ideaIdParam) : null,
  );
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: ideasListResponse } = useSWR<IdeasListResponse>(
    "/api/ideas?limit=100",
    () => getIdeas(0, 100) as Promise<IdeasListResponse>,
    { refreshInterval: 10000 }
  );

  const ideas = ideasListResponse?.items || [];

  useEffect(() => {
    if (!selectedIdeaId && ideas.length > 0) {
      setSelectedIdeaId(ideas[0].id);
    }
  }, [ideas, selectedIdeaId]);

  useEffect(() => {
    if (!selectedIdeaId) return;

    const fetchGraph = async () => {
      setLoading(true);
      try {
        const data = (await getIdeaGraph(selectedIdeaId)) as GraphResponse;
        setGraphData(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchGraph();
  }, [selectedIdeaId]);

  const selectedIdea = ideas.find((idea) => idea.id === selectedIdeaId);

  return (
    <div className="page-shell page-stack">
      <section className="page-hero animate-fade-in">
        <div className="hero-grid lg:grid-cols-[1.25fr_0.9fr] lg:items-end">
          <div>
            <p className="eyebrow">evolution map</p>
            <h1 className="display-title max-w-3xl">See how an idea splits and grows.</h1>
            <p className="lede mt-5">
              Each node represents a saved version. Edges show the jump from one take to
              the next so you can follow a theme through every branch.
            </p>
          </div>

          <div className="panel p-6">
            <p className="metric-label">Select idea</p>
            {ideas.length > 0 ? (
              <div className="mt-4 input-shell">
                <select
                  value={selectedIdeaId ?? ""}
                  onChange={(e) => setSelectedIdeaId(Number(e.target.value))}
                  className="w-full appearance-none bg-transparent px-4 py-4 text-sm font-semibold text-[var(--text)] focus:outline-none"
                >
                  <option value="" disabled>
                    Select an idea
                  </option>
                  {ideas.map((idea) => (
                    <option key={idea.id} value={idea.id}>
                      {idea.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                No ideas are available yet.
              </p>
            )}
          </div>
        </div>
      </section>

      {selectedIdea && graphData ? (
        <div className="panel flex flex-wrap items-center gap-3 px-5 py-4 text-sm animate-fade-in animate-fade-in-delay-1">
          <span className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--accent-deep)]">
            {graphData.idea_title}
          </span>
          <span className="text-[var(--soft)]">/</span>
          <span className="text-[var(--muted)]">
            {graphData.nodes.length} version{graphData.nodes.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[var(--soft)]">/</span>
          <span className="text-[var(--muted)]">
            {graphData.edges.length} branch{graphData.edges.length !== 1 ? "es" : ""}
          </span>
          {selectedIdea.latest_version?.mood ? (
            <span className="tag-badge">{selectedIdea.latest_version.mood}</span>
          ) : null}
          {selectedIdea.latest_version?.genre ? (
            <span className="tag-badge">{selectedIdea.latest_version.genre}</span>
          ) : null}
          <Link href={`/ideas/${selectedIdeaId}`} className="button-ghost ml-auto">
            Open detail
          </Link>
        </div>
      ) : null}

      <div
        className="panel panel-strong overflow-hidden animate-fade-in animate-fade-in-delay-2"
        style={{ height: "calc(100vh - 21rem)", minHeight: 480 }}
      >
        {loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-[rgba(207,236,243,0.95)] border-t-[var(--accent)] animate-spin" />
              <p className="text-sm font-medium text-[var(--muted)]">Loading evolution tree...</p>
            </div>
          </div>
        ) : ideas.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center px-6 text-center">
            <div>
              <p className="section-title text-[2rem]">No ideas to visualize yet.</p>
              <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-[var(--muted)]">
                Capture your first musical idea to start building an evolution tree.
              </p>
              <Link href="/capture" className="button-primary mt-6">
                Start capturing
              </Link>
            </div>
          </div>
        ) : !graphData || graphData.nodes.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center px-6 text-center">
            <div>
              <p className="section-title text-[2rem]">
                {ideas.length > 0 && selectedIdeaId
                  ? "This idea has only one version"
                  : "Select an idea above"}
              </p>
              <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-[var(--muted)]">
                {ideas.length > 0 && selectedIdeaId
                  ? "Create branches from the detail page to turn a single recording into an evolution tree."
                  : "Choose an idea from the selector to visualize its branches."}
              </p>
              {selectedIdeaId ? (
                <Link href={`/ideas/${selectedIdeaId}`} className="button-secondary mt-6">
                  Open idea detail
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <EvolutionGraph
            nodes={graphData.nodes}
            edges={graphData.edges}
            title={graphData.idea_title}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 animate-fade-in animate-fade-in-delay-3">
        {[
          {
            title: "1. Capture",
            desc: "Record an idea in the browser whenever a promising phrase arrives.",
          },
          {
            title: "2. Branch",
            desc: "Store new versions as you keep experimenting with the same seed.",
          },
          {
            title: "3. Review",
            desc: "Come back to compare structure, mood, and direction over time.",
          },
        ].map((step) => (
          <div key={step.title} className="panel p-5">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--accent-deep)]">
                {step.title}
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EvolutionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center" style={{ height: "60vh" }}>
          <div className="text-center">
            <div className="mx-auto mb-3 h-10 w-10 rounded-full border-2 border-[rgba(207,236,243,0.95)] border-t-[var(--accent)] animate-spin" />
            <p className="text-sm font-medium text-[var(--muted)]">Loading...</p>
          </div>
        </div>
      }
    >
      <EvolutionContent />
    </Suspense>
  );
}
