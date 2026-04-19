"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import SearchBar from "@/components/SearchBar";
import ClusterView from "@/components/ClusterView";
import { getIdeas } from "@/lib/api";
import type { Idea, IdeasListResponse } from "@/lib/types";

export default function IdeasPage() {
  const [page, setPage] = useState(0);
  const limit = 100;

  const { data, isLoading } = useSWR<IdeasListResponse>(
    `/api/ideas?page=${page}&limit=${limit}`,
    () => getIdeas(page * limit, limit) as Promise<IdeasListResponse>,
    { refreshInterval: 10000, keepPreviousData: true }
  );

  const ideas = data?.items || [];
  const total = data?.total || 0;
  const loading = isLoading && !data;

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="page-shell page-stack">
      <section className="page-hero animate-fade-in">
        <div className="hero-grid lg:grid-cols-[1.25fr_0.8fr] lg:items-end">
          <div>
            <p className="eyebrow">idea library</p>
            <h1 className="display-title max-w-3xl">Browse by energy, mood, or genre.</h1>
            <p className="lede mt-5">
              Every capture lands here as a playable card. Cluster views help you spot
              patterns instead of scrolling through a flat wall of recordings.
            </p>
          </div>
          <div className="panel p-6">
            <p className="metric-label">Library size</p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-6xl leading-none">
              {total}
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              {total === 0
                ? "No saved ideas yet."
                : `${total} idea${total !== 1 ? "s" : ""} ready to explore and compare.`}
            </p>
            <Link href="/capture" className="button-primary mt-6">
              Add a new capture
            </Link>
          </div>
        </div>
      </section>

      <div className="max-w-3xl animate-fade-in animate-fade-in-delay-1">
        <SearchBar />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="panel h-56 animate-pulse" />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <div className="empty-state animate-fade-in">
          <p className="section-title text-[2rem]">No ideas saved yet.</p>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[var(--muted)]">
            Head to capture, save a take, and come back here to organize it by mood or
            genre.
          </p>
          <Link href="/capture" className="button-primary mt-6">
            Open capture
          </Link>
        </div>
      ) : (
        <div className="animate-fade-in animate-fade-in-delay-2">
          <ClusterView ideas={ideas} />

          {totalPages > 1 ? (
            <div className="mt-12 flex flex-wrap items-center justify-center gap-4 pb-8">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="button-secondary disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="button-secondary disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
