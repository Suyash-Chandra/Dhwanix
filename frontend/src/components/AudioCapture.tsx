"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureAudio } from "@/lib/api";
import { useAudioStore } from "@/lib/store";
import { mutate } from "swr";
import WaveformVisualizer from "./WaveformVisualizer";

interface AudioCaptureProps {
  onCaptureComplete?: (data: unknown) => void;
}

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export default function AudioCapture({ onCaptureComplete }: AudioCaptureProps) {
  const {
    isListening,
    setListening,
    isCapturing,
    setCapturing,
    bufferSeconds,
    setBufferSeconds,
    vadLevel,
    setVadLevel,
  } = useAudioStore();

  const [liveWaveform, setLiveWaveform] = useState<Float32Array | null>(null);
  const [captureStatus, setCaptureStatus] = useState("");
  const [error, setError] = useState("");
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
  const [autoCaptureArmed, setAutoCaptureArmed] = useState(false);
  const [pendingStopAfterCapture, setPendingStopAfterCapture] = useState(false);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMood, setModalMood] = useState("");

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activityStartedAtRef = useRef<number | null>(null);
  const silenceStartedAtRef = useRef<number | null>(null);
  const lastAutoCaptureAtRef = useRef<number>(0);
  const stopAfterCaptureRef = useRef<boolean>(false);

  const handleCaptureData = useCallback((buffer: Float32Array, sampleRate: number) => {
    setCaptureStatus("Preparing save...");
    const wavBlob = encodeWAV(buffer, sampleRate);
    setPendingBlob(wavBlob);
    setCapturing(false);

    if (stopAfterCaptureRef.current) {
      stopAfterCaptureRef.current = false;
      setPendingStopAfterCapture(true);
    }
  }, [setCapturing]);

  const confirmSave = async () => {
    if (!pendingBlob) return;
    setCaptureStatus("Uploading and analyzing...");
    const blobToSave = pendingBlob;
    setPendingBlob(null);

    try {
      const result = await captureAudio(blobToSave, modalTitle, modalMood);
      setCaptureStatus("Capture saved successfully.");
      
      // Globally wipe the SWR cache so the Dashboard/Ideas pages update instantly
      mutate(key => typeof key === 'string' && key.startsWith('/api/'), undefined, { revalidate: true });
      
      if (onCaptureComplete) onCaptureComplete(result);
      setTimeout(() => setCaptureStatus(""), 3000);
    } catch (captureError) {
      const message =
        captureError instanceof Error ? captureError.message : "Capture failed.";
      setCaptureStatus(`Capture failed: ${message}`);
      console.error(captureError);
    } finally {
      setModalTitle("");
      setModalMood("");
    }
  };

  const cancelSave = () => {
    setPendingBlob(null);
    setModalTitle("");
    setModalMood("");
    setCaptureStatus("Save discarded.");
    setTimeout(() => setCaptureStatus(""), 3000);
  };

  const startListening = useCallback(async () => {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 44100 });
      audioContextRef.current = audioContext;

      await audioContext.audioWorklet.addModule("/audio-worklet-processor.js");

      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, "rolling-buffer-processor");
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        const {
          type,
          energy,
          bufferSeconds: nextBufferSeconds,
          waveformChunk,
          buffer,
          sampleRate,
        } = event.data;

        if (type === "levels") {
          setVadLevel(energy);
          setBufferSeconds(nextBufferSeconds);
          if (waveformChunk) {
            setLiveWaveform(new Float32Array(waveformChunk));
          }
        }

        if (type === "captureData") {
          void handleCaptureData(buffer, sampleRate);
        }
      };

      source.connect(workletNode);
      setListening(true);
    } catch (captureError) {
      setError("Microphone access denied. Please allow microphone permissions.");
      console.error(captureError);
    }
  }, [handleCaptureData, setListening, setBufferSeconds, setVadLevel]);

  const stopListening = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    workletNodeRef.current = null;
    setListening(false);
    setBufferSeconds(0);
    setVadLevel(0);
    setLiveWaveform(null);
  }, [setListening, setBufferSeconds, setVadLevel]);

  const triggerCapture = useCallback(() => {
    if (!workletNodeRef.current || isCapturing) return;
    setCapturing(true);
    setCaptureStatus("Capturing buffer...");
    workletNodeRef.current.port.postMessage({ type: "capture" });
  }, [isCapturing, setCapturing]);

  const stopAndSave = useCallback(() => {
    if (!isListening || isCapturing) return;

    if (bufferSeconds >= 1 && workletNodeRef.current) {
      stopAfterCaptureRef.current = true;
      triggerCapture();
      return;
    }

    stopListening();
  }, [bufferSeconds, isCapturing, isListening, stopListening, triggerCapture]);

  useEffect(() => {
    if (!pendingStopAfterCapture) return;
    setPendingStopAfterCapture(false);
    stopListening();
  }, [pendingStopAfterCapture, stopListening]);

  useEffect(() => {
    if (!isListening || !autoCaptureEnabled || isCapturing) return;

    const now = Date.now();
    const activityThreshold = 0.02;
    const signalIsActive = vadLevel > activityThreshold;

    if (signalIsActive) {
      if (!activityStartedAtRef.current) {
        activityStartedAtRef.current = now;
      }
      silenceStartedAtRef.current = null;

      // Arm auto-capture only after sustained activity to reduce false triggers.
      if (!autoCaptureArmed && now - activityStartedAtRef.current > 1100) {
        setAutoCaptureArmed(true);
      }
      return;
    }

    if (autoCaptureArmed) {
      if (!silenceStartedAtRef.current) {
        silenceStartedAtRef.current = now;
      }

      const cooldownElapsed = now - lastAutoCaptureAtRef.current > 9000;
      const silenceWindowMet = now - silenceStartedAtRef.current > 1300;
      if (cooldownElapsed && silenceWindowMet && bufferSeconds >= 4) {
        lastAutoCaptureAtRef.current = now;
        setAutoCaptureArmed(false);
        activityStartedAtRef.current = null;
        silenceStartedAtRef.current = null;
        setCaptureStatus("Auto-capture detected a phrase. Saving...");
        triggerCapture();
      }
      return;
    }

    activityStartedAtRef.current = null;
  }, [
    autoCaptureArmed,
    autoCaptureEnabled,
    bufferSeconds,
    isCapturing,
    isListening,
    triggerCapture,
    vadLevel,
  ]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, []);

  const bufferPercentage = (bufferSeconds / 60) * 100;

  return (
    <>
      {pendingBlob ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(34,27,22,0.5)] backdrop-blur-md p-4 animate-fade-in">
          <div className="panel panel-strong w-full max-w-md p-6 shadow-2xl">
            <h3 className="section-title text-[1.8rem] mb-2">Save Capture</h3>
            <p className="text-sm text-[var(--muted)] mb-5">
              Name this idea and set an initial mood. If left blank, the AI will generate these for you based on the recording.
            </p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="metric-label mb-2 block">Idea Name (optional)</label>
                <input
                  type="text"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  placeholder="e.g. Dreamy Acoustic Riff"
                  className="input-shell px-4 py-3 text-sm focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="metric-label mb-2 block">Mood (optional)</label>
                <input
                  type="text"
                  value={modalMood}
                  onChange={(e) => setModalMood(e.target.value)}
                  placeholder="e.g. Melancholic, Energetic"
                  className="input-shell px-4 py-3 text-sm focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3">
              <button onClick={cancelSave} className="button-ghost">
                Discard
              </button>
              <button 
                onClick={confirmSave} 
                className="button-primary px-6"
                disabled={captureStatus === "Uploading and analyzing..."}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel p-6 sm:p-8">
      {error ? (
        <div className="mb-6 rounded-[1.25rem] border border-[rgba(138,49,34,0.16)] bg-[rgba(138,49,34,0.07)] px-5 py-4 text-center text-sm text-[#8a3122]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="flex flex-col items-center gap-6">
          <div className="relative" style={{ width: 280, height: 280 }}>
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 280 280">
              <circle
                cx="140"
                cy="140"
                r="125"
                fill="none"
                stroke="rgba(68,54,40,0.08)"
                strokeWidth="7"
              />
              <circle
                cx="140"
                cy="140"
                r="125"
                fill="none"
                stroke="url(#bufferGradient)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 125}`}
                strokeDashoffset={`${2 * Math.PI * 125 * (1 - bufferPercentage / 100)}`}
                style={{ transition: "stroke-dashoffset 0.3s ease" }}
              />
              <defs>
                <linearGradient id="bufferGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#CFECF3" />
                  <stop offset="100%" stopColor="#CFECF3" />
                </linearGradient>
              </defs>
            </svg>

            <div className="absolute inset-0 flex items-center justify-center">
              {!isListening ? (
                <button
                  onClick={startListening}
                  className="panel panel-hover flex h-44 w-44 flex-col items-center justify-center gap-3 rounded-full border-[rgba(68,54,40,0.1)] bg-[rgba(255,252,247,0.84)]"
                >
                  <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--accent-deep)]">
                    Ready
                  </span>
                  <span className="font-[family-name:var(--font-display)] text-4xl leading-none">
                    Listen
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--soft)]">
                    Start ambient capture
                  </span>
                </button>
              ) : (
                <div className="relative">
                  {isCapturing ? (
                    <div
                      className="capture-btn-ring absolute inset-0 rounded-full border-2 border-[rgba(207,236,243,0.95)]"
                      style={{ width: 176, height: 176, margin: -8 }}
                    />
                  ) : null}
                  <button
                    onClick={triggerCapture}
                    disabled={isCapturing || bufferSeconds < 1}
                    className={`flex h-40 w-40 flex-col items-center justify-center gap-3 rounded-full border transition-all duration-300 ${
                      isCapturing
                        ? "border-[rgba(207,236,243,0.95)] bg-[rgba(207,236,243,0.4)]"
                        : "capture-btn-pulse border-[rgba(68,54,40,0.1)] bg-[linear-gradient(135deg,rgba(207,236,243,0.36),rgba(207,236,243,0.7))] hover:bg-[linear-gradient(135deg,rgba(207,236,243,0.56),rgba(207,236,243,0.88))]"
                    }`}
                    style={{ backdropFilter: "blur(20px)" }}
                  >
                    <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--accent-deep)]">
                      {isCapturing ? "Processing" : "Capture"}
                    </span>
                    <span className="font-[family-name:var(--font-display)] text-4xl leading-none">
                      {Math.max(Math.floor(bufferSeconds), 0)}s
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--soft)]">
                      Rolling buffer
                    </span>
                  </button>
                </div>
              )}
            </div>

            {isListening ? (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-[rgba(68,54,40,0.08)] bg-[rgba(255,252,247,0.82)] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                {Math.floor(bufferSeconds)}s of 60s ready
              </div>
            ) : null}
          </div>

          {isListening ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button onClick={stopListening} className="button-secondary">
                Stop listener
              </button>
              <button onClick={stopAndSave} className="button-primary">
                Stop and save
              </button>
              <button
                onClick={() => {
                  const next = !autoCaptureEnabled;
                  setAutoCaptureEnabled(next);
                  setAutoCaptureArmed(false);
                  activityStartedAtRef.current = null;
                  silenceStartedAtRef.current = null;
                }}
                className={`button-ghost ${autoCaptureEnabled ? "ring-2 ring-[rgba(96,113,76,0.3)]" : ""}`}
              >
                {autoCaptureEnabled ? "Auto capture on" : "Enable auto capture"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-5">
          <div>
            <p className="eyebrow">capture engine</p>
            <h2 className="section-title text-[2.4rem]">A rolling buffer that waits for the good part.</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
              Stay in the flow and save after the fact. The app keeps the recent audio in
              memory so you do not have to hit record first.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.25rem] border border-[rgba(68,54,40,0.08)] bg-[rgba(255,252,247,0.72)] p-4">
              <p className="metric-label">Buffer fill</p>
              <p className="mt-3 text-3xl font-[family-name:var(--font-display)]">
                {Math.round(bufferPercentage)}%
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                The amount of recent audio available to capture right now.
              </p>
            </div>

            <div className="rounded-[1.25rem] border border-[rgba(68,54,40,0.08)] bg-[rgba(255,252,247,0.72)] p-4">
              <p className="metric-label">Input activity</p>
              <p className="mt-3 text-3xl font-[family-name:var(--font-display)]">
                {vadLevel > 0.02 ? "Active" : "Quiet"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                A quick read on whether the microphone is hearing useful signal.
              </p>
            </div>
          </div>

          {isListening ? (
            <div className="rounded-[1.5rem] border border-[rgba(68,54,40,0.08)] bg-[rgba(255,252,247,0.76)] p-5">
              <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                <span>Input level</span>
                <span className={vadLevel > 0.02 ? "text-[var(--accent-olive)]" : ""}>
                  {vadLevel > 0.02 ? "Signal present" : "Waiting"}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[rgba(68,54,40,0.08)]">
                <div
                  className="h-full rounded-full transition-all duration-100"
                  style={{
                    width: `${Math.min(vadLevel * 1000, 100)}%`,
                    background:
                      vadLevel > 0.02
                        ? "linear-gradient(90deg, #CFECF3, #CFECF3)"
                        : "rgba(68,54,40,0.14)",
                  }}
                />
              </div>

              {autoCaptureEnabled ? (
                <div className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--soft)]">
                  {autoCaptureArmed
                    ? "Auto mode armed: waiting for silence to commit."
                    : "Auto mode: waiting for a clear phrase."}
                </div>
              ) : null}

              <div className="mt-4 rounded-[1.1rem] border border-[rgba(68,54,40,0.06)] bg-[rgba(243,237,226,0.8)] p-4">
                <WaveformVisualizer
                  audioData={liveWaveform}
                  isLive={true}
                  color="#CFECF3"
                  height={72}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-[rgba(68,54,40,0.14)] bg-[rgba(255,252,247,0.6)] p-5 text-sm leading-7 text-[var(--muted)]">
              Start listening to activate the live level meter and waveform preview.
            </div>
          )}

          {captureStatus ? (
            <div className="rounded-[1.25rem] border border-[rgba(207,236,243,0.95)] bg-[rgba(207,236,243,0.5)] px-5 py-4 text-sm font-semibold text-[var(--text)]">
              {captureStatus}
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </>
  );
}
