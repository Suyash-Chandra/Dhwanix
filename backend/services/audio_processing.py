import numpy as np
import librosa
import soundfile as sf
import os


# ── Key profiles (Krumhansl-Kessler) ──────────────────────────────────────
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def detect_key(y: np.ndarray, sr: int) -> str:
    """
    Memory-lite key detection to prevent OOM on small servers.
    Uses basic STFT chroma instead of HPSS + CQT.
    """
    try:
        # Use simple STFT chroma (much less memory than CQT + HPSS)
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        
        # Aggregate: simple mean across time
        chroma_mean = np.mean(chroma, axis=1)

        # Normalize the chroma vector
        chroma_norm = np.linalg.norm(chroma_mean)
        if chroma_norm < 1e-10:
            return "Unknown"
        chroma_mean = chroma_mean / chroma_norm

        # Correlate with all 24 key profiles
        major_corrs: list[float] = []
        minor_corrs: list[float] = []
        for i in range(12):
            rolled_major = np.roll(MAJOR_PROFILE, i)
            rolled_minor = np.roll(MINOR_PROFILE, i)
            major_corrs.append(float(np.corrcoef(rolled_major, chroma_mean)[0, 1]))
            minor_corrs.append(float(np.corrcoef(rolled_minor, chroma_mean)[0, 1]))

        max_major_idx = int(np.argmax(major_corrs))
        max_minor_idx = int(np.argmax(minor_corrs))
        major_score = major_corrs[max_major_idx]
        minor_score = minor_corrs[max_minor_idx]

        best_score = max(major_score, minor_score)

        if best_score < 0.10:
            return "Unknown"

        if major_score >= minor_score:
            return f"{KEY_NAMES[max_major_idx]} Major"
        else:
            return f"{KEY_NAMES[max_minor_idx]} Minor"
    except Exception:
        return "Unknown"


def detect_bpm(y: np.ndarray, sr: int) -> float | None:
    """
    Memory-lite BPM detection using librosa's default beat tracker.
    Avoids HPSS to save memory.
    """
    try:
        # Build onset strength envelope directly from the original signal
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)

        # Dynamic-programming beat tracker
        tempo_estimate, beat_frames = librosa.beat.beat_track(
            onset_envelope=onset_env,
            sr=sr,
            tightness=100,
        )

        # Compute BPM from actual inter-beat intervals for accuracy
        if beat_frames is not None and len(beat_frames) >= 4:
            beat_times = librosa.frames_to_time(beat_frames, sr=sr)
            intervals = np.diff(beat_times)
            if len(intervals) >= 4:
                p10, p90 = np.percentile(intervals, [10, 90])
                intervals = intervals[(intervals >= p10) & (intervals <= p90)]
            if len(intervals) > 0:
                mean_interval = np.mean(intervals)
                bpm = 60.0 / mean_interval
            else:
                bpm = float(np.atleast_1d(tempo_estimate)[0])
        else:
            bpm = float(np.atleast_1d(tempo_estimate)[0])

        # Octave-error correction
        while bpm > 200:
            bpm /= 2
        while bpm < 60:
            bpm *= 2

        bpm = max(40.0, min(bpm, 250.0))
        return round(bpm, 1)

    except Exception:
        return None


def analyze_audio(file_path: str) -> dict:
    """
    Extract audio features from a WAV file using librosa.
    Returns dict with bpm, key, spectral features, duration, energy.
    """
    try:
        y, sr = librosa.load(file_path, sr=22050, mono=True)
        duration = librosa.get_duration(y=y, sr=sr)

        # Skip analysis for extremely short clips (< 0.5s)
        if duration < 0.5:
            return {
                "bpm": None,
                "key_signature": "Unknown",
                "duration": round(duration, 2),
                "spectral_centroid": None,
                "zero_crossing_rate": None,
                "rms_energy": None,
                "energy_level": "unknown",
            }

        # BPM (uses percussive separation + beat tracking + IBI calculation)
        bpm = detect_bpm(y, sr)

        # Key detection (uses harmonic separation + CQT chroma + nn_filter)
        key_signature = detect_key(y, sr)

        # Spectral centroid (brightness)
        spectral_centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))

        # Zero crossing rate (noisiness / percussiveness)
        zcr = float(np.mean(librosa.feature.zero_crossing_rate(y)))

        # RMS energy
        rms = float(np.mean(librosa.feature.rms(y=y)))

        # Determine energy level heuristic
        if rms > 0.1:
            energy_level = "high"
        elif rms > 0.03:
            energy_level = "medium"
        else:
            energy_level = "low"

        return {
            "bpm": bpm,
            "key_signature": key_signature,
            "duration": round(duration, 2),
            "spectral_centroid": round(spectral_centroid, 2),
            "zero_crossing_rate": round(zcr, 6),
            "rms_energy": round(rms, 6),
            "energy_level": energy_level,
        }
    except Exception as e:
        print(f"Audio analysis error: {e}")
        return {
            "bpm": None,
            "key_signature": "Unknown",
            "duration": 0,
            "spectral_centroid": None,
            "zero_crossing_rate": None,
            "rms_energy": None,
            "energy_level": "unknown",
        }
