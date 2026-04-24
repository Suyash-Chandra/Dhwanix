"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { branchIdea, deleteIdea, getAudioUrl, getIdea } from "@/lib/api";
import type { Idea, IdeaVersion } from "@/lib/types";
import WaveformVisualizer from "@/components/WaveformVisualizer";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function getMoodClass(mood: string | null): string {
  if (!mood) return "";
  const value = mood.toLowerCase();
  if (value.includes("happy") || value.includes("uplifting") || value.includes("joy")) {
    return "mood-happy";
  }
  if (value.includes("sad") || value.includes("melanchol")) {
    return "mood-sad";
  }
  if (value.includes("energetic") || value.includes("upbeat")) {
    return "mood-energetic";
  }
  if (value.includes("peace") || value.includes("dream") || value.includes("calm")) {
    return "mood-peaceful";
  }
  if (value.includes("aggress") || value.includes("intense")) {
    return "mood-aggressive";
  }
  return "";
}

export default function IdeaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [idea, setIdea] = useState<Idea | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeVersion, setActiveVersion] = useState<IdeaVersion | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [notes, setNotes] = useState("");
  const [isBranchRecording, setIsBranchRecording] = useState(false);
  const [isSavingBranch, setIsSavingBranch] = useState(false);
  const [branchStatus, setBranchStatus] = useState("");
  const [branchError, setBranchError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const branchRecorderRef = useRef<MediaRecorder | null>(null);
  const branchChunksRef = useRef<Blob[]>([]);

  // Waveform state
  const [liveWaveform, setLiveWaveform] = useState<Float32Array | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchIdea = async () => {
      try {
        const data = (await getIdea(id)) as Idea;
        setIdea(data);
        if (data.versions && data.versions.length > 0) {
          setActiveVersion(data.versions[0]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchIdea();
  }, [id]);

  const togglePlay = async () => {
    if (!activeVersion || !audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    audioRef.current.src = getAudioUrl(activeVersion.file_path);
    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (error) {
      console.error("Unable to play preview:", error);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this idea and all its versions?")) return;

    try {
      await deleteIdea(id);
      router.push("/ideas");
    } catch (err) {
      console.error(err);
    }
  };

  const startBranchRecording = async () => {
    if (!activeVersion || isBranchRecording || isSavingBranch) return;
    setBranchError("");
    setBranchStatus("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      branchChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          branchChunksRef.current.push(event.data);
        }
      };

      // Set up live waveform visualization
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const updateWaveform = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteTimeDomainData(dataArray);
        const floatArray = new Float32Array(dataArray.length);
        for (let i = 0; i < dataArray.length; i++) {
          floatArray[i] = (dataArray[i] - 128) / 128.0;
        }
        setLiveWaveform(floatArray);
        animationFrameRef.current = requestAnimationFrame(updateWaveform);
      };
      updateWaveform();

      recorder.onstop = async () => {
        setIsBranchRecording(false);

        // Cleanup waveform
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current) audioContextRef.current.close();
        setLiveWaveform(null);

        const tracks = stream.getTracks();
        tracks.forEach((track) => track.stop());

        if (!activeVersion || branchChunksRef.current.length === 0) {
          setBranchError("No audio captured for this branch.");
          return;
        }

        setIsSavingBranch(true);
        setBranchStatus("Saving branch and analyzing...");
        try {
          const blob = new Blob(branchChunksRef.current, { type: "audio/webm" });
          await branchIdea(id, activeVersion.id, blob, notes.trim());

          const refreshed = (await getIdea(id)) as Idea;
          setIdea(refreshed);
          if (refreshed.versions && refreshed.versions.length > 0) {
            setActiveVersion(refreshed.versions[0]);
          }
          setNotes("");
          setBranchStatus("Branch saved successfully.");
        } catch (error) {
          console.error(error);
          setBranchError("Could not save branch. Please retry.");
          setBranchStatus("");
        } finally {
          setIsSavingBranch(false);
        }
      };

      branchRecorderRef.current = recorder;
      recorder.start();
      setIsBranchRecording(true);
      setBranchStatus("Recording branch take...");
    } catch (error) {
      console.error(error);
      setBranchError("Microphone permission is required to branch an idea.");
    }
  };

  const stopBranchRecording = () => {
    const recorder = branchRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop();
  };

  if (loading) {
    return (
      <div className="page-shell">
        <div className="panel h-96 animate-pulse" />
      </div>
    );
  }

  if (!idea) {
    return (
      <div className="page-shell">
        <div className="empty-state">
          <p className="section-title text-[2rem]">Idea not found.</p>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            This idea may have been removed or the link is no longer valid.
          </p>
        </div>
      </div>
    );
  }

  const versionCount = idea.versions?.length ?? 0;

  return (
    <div className="page-shell page-stack">
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} className="hidden" />

      <div className="flex flex-wrap items-center justify-between gap-3 animate-fade-in">
        <button onClick={() => router.back()} className="button-secondary">
          Back to library
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/evolution?idea=${id}`} className="button-ghost">
            Open evolution map
          </Link>
          <button onClick={handleDelete} className="button-danger">
            Delete idea
          </button>
        </div>
      </div>

      <section className="page-hero animate-fade-in animate-fade-in-delay-1">
        <div className="hero-grid lg:grid-cols-[1.3fr_0.8fr] lg:items-start">
          <div>
            <p className="eyebrow">idea detail</p>
            <h1 className="display-title max-w-3xl">{idea.title}</h1>
            <p className="lede mt-5">
              Created {new Date(idea.created_at).toLocaleDateString()} and currently
              holding {versionCount} version{versionCount !== 1 ? "s" : ""}. Use this
              page to review the latest version and step through earlier branches.
            </p>

            {activeVersion ? (
              <>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button onClick={togglePlay} className="button-primary">
                    {isPlaying ? "Pause preview" : "Play preview"}
                  </button>
                  <a
                    href={getAudioUrl(activeVersion.file_path)}
                    target="_blank"
                    rel="noreferrer"
                    className="button-secondary"
                  >
                    Open audio file
                  </a>
                </div>

                <div className="mt-8 h-16 overflow-hidden rounded-[1.25rem] border border-[rgba(68,54,40,0.08)] bg-[rgba(255,252,247,0.72)] px-3">
                  <div className="flex h-full items-center gap-[2px]">
                    {Array.from({ length: 96 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-full bg-[linear-gradient(180deg,rgba(207,236,243,0.55),rgba(207,236,243,0.95))]"
                        style={{ height: `${Math.abs(Math.sin(i * 0.52)) * 72 + 18}%` }}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="panel p-6">
            <p className="metric-label">Selected version</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["Version", activeVersion ? (activeVersion.display_version || `v${activeVersion.id}`) : "--"],
                ["BPM", activeVersion?.bpm ? Math.round(activeVersion.bpm).toString() : "--"],
                ["Key", activeVersion?.key_signature ?? "--"],
                ["Duration", formatDuration(activeVersion?.duration ?? null)],
                ["Mood", activeVersion?.mood ?? "--"],
                ["Genre", activeVersion?.genre ?? "--"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[1.25rem] border border-[rgba(68,54,40,0.08)] bg-[rgba(255,252,247,0.76)] p-4"
                >
                  <p className="metric-label">{label}</p>
                  <p className="mt-3 text-2xl font-[family-name:var(--font-display)] capitalize">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {activeVersion &&
            (activeVersion.tags.length > 0 ||
              activeVersion.genre ||
              activeVersion.instruments.length > 0 ||
              activeVersion.energy_level) ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {activeVersion.mood ? (
                  <span className={`tag-badge ${getMoodClass(activeVersion.mood)}`}>
                    {activeVersion.mood}
                  </span>
                ) : null}
                {activeVersion.genre ? (
                  <span className="tag-badge">{activeVersion.genre}</span>
                ) : null}
                {activeVersion.energy_level ? (
                  <span className="tag-badge">{activeVersion.energy_level} energy</span>
                ) : null}
                {activeVersion.instruments.map((instrument) => (
                  <span key={instrument} className="tag-badge">
                    {instrument}
                  </span>
                ))}
                {activeVersion.tags.map((tag) => (
                  <span key={tag} className="tag-badge">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="panel p-6 animate-fade-in animate-fade-in-delay-2">
          <p className="eyebrow">version history</p>
          <div className="mt-2 grid gap-3">
            {idea.versions?.map((version, index) => (
              <button
                key={version.id}
                onClick={() => {
                  setActiveVersion(version);
                  setIsPlaying(false);
                }}
                className={`rounded-[1.25rem] border p-4 text-left transition-all ${
                  activeVersion?.id === version.id
                    ? "border-[rgba(207,236,243,0.95)] bg-[rgba(207,236,243,0.5)]"
                    : "border-[rgba(68,54,40,0.08)] bg-[rgba(255,252,247,0.74)] hover:border-[rgba(68,54,40,0.16)]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-violet-500">
                      {index === 0 ? "Newest version" : (version.display_version || `Version ${version.id}`)}
                    </p>
                    <p className="mt-2 text-xl font-[family-name:var(--font-display)] text-[var(--text)]">
                      {version.parent_version_id
                        ? `Branched from ${idea.versions?.find((v) => v.id === version.parent_version_id)?.display_version || `v${version.parent_version_id}`}`
                        : "Original root version"}
                    </p>
                  </div>
                  <div className="text-right text-xs font-semibold uppercase tracking-[0.12em] text-[var(--soft)]">
                    {new Date(version.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {version.mood ? (
                    <span className={`tag-badge ${getMoodClass(version.mood)}`}>
                      {version.mood}
                    </span>
                  ) : null}
                  {version.genre ? <span className="tag-badge">{version.genre}</span> : null}
                  {version.bpm ? (
                    <span className="tag-badge">{Math.round(version.bpm)} BPM</span>
                  ) : null}
                </div>

                {version.notes ? (
                  <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                    {version.notes}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="page-stack animate-fade-in animate-fade-in-delay-3">
          <div className="panel p-6">
            <p className="eyebrow">create branch</p>
            <p className="text-sm leading-7 text-[var(--muted)]">
              Record a fresh take based on the selected version and save it as a new
              branch in this idea history.
            </p>

            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes about what changed in this branch"
              className="mt-4 min-h-24 w-full rounded-[1rem] border border-[rgba(68,54,40,0.12)] bg-[rgba(255,252,247,0.9)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[rgba(207,236,243,0.95)]"
            />

            <div className="mt-4 flex flex-wrap gap-3">
              {!isBranchRecording ? (
                <button
                  onClick={startBranchRecording}
                  disabled={!activeVersion || isSavingBranch}
                  className="button-primary disabled:opacity-45"
                >
                  Record branch
                </button>
              ) : (
                <button onClick={stopBranchRecording} className="button-danger">
                  Stop and save branch
                </button>
              )}
            </div>

            {isBranchRecording && (
              <div className="mt-6 w-full max-w-sm glass rounded-xl p-4 animate-fade-in">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-400 mb-2">Live Input</p>
                <WaveformVisualizer audioData={liveWaveform} isLive={true} color="#8b5cf6" height={48} />
              </div>
            )}

            {branchStatus ? (
              <p className="mt-4 text-sm font-semibold text-violet-500">
                {branchStatus}
              </p>
            ) : null}
            {branchError ? (
              <p className="mt-3 text-sm font-semibold text-[#8a3122]">{branchError}</p>
            ) : null}
          </div>

          <div className="panel p-6">
            <p className="eyebrow">current context</p>
            <div className="grid gap-4">
              <div>
                <p className="metric-label">Updated</p>
                <p className="mt-2 text-lg font-semibold">
                  {new Date(idea.updated_at).toLocaleDateString()}
                </p>
              </div>

              <div>
                <p className="metric-label">Selected file</p>
                <p className="mt-2 break-all text-sm leading-7 text-[var(--muted)]">
                  {activeVersion?.file_path ?? "No file available"}
                </p>
              </div>

              <div>
                <p className="metric-label">Notes</p>
                <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                  {activeVersion?.notes
                    ? activeVersion.notes
                    : "No notes were added for this version. Future branches can use notes to explain what changed."}
                </p>
              </div>
            </div>
          </div>

          <div className="panel p-6">
            <p className="eyebrow">next step</p>
            <p className="text-sm leading-7 text-[var(--muted)]">
              Open the evolution map to inspect how this idea branches over time, or
              return to capture and record another take when you are ready to extend it.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`/evolution?idea=${id}`} className="button-primary">
                View branches
              </Link>
              <Link href="/capture" className="button-secondary">
                Capture another idea
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
