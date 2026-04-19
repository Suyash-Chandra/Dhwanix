import json
import os
import httpx

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "mistral")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "3"))


async def query_ollama(prompt: str, model: str = DEFAULT_MODEL) -> str:
    """Send a prompt to Ollama and return the response text."""
    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
            response = await client.post(
                OLLAMA_URL,
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("response", "")
    except Exception as e:
        print(f"Ollama error: {e}")
        return ""


async def analyze_musical_idea(audio_features: dict) -> dict:
    """
    Send audio features to Ollama for semantic analysis.
    Returns mood, genre, instruments, energy_level, tags.
    """
    prompt = f"""You are a music analysis AI. Analyze the following audio features of a musical idea and return a JSON object.

Audio Features:
- BPM: {audio_features.get('bpm', 'unknown')}
- Key: {audio_features.get('key_signature', 'unknown')}
- Energy Level: {audio_features.get('energy_level', 'unknown')}
- Spectral Centroid: {audio_features.get('spectral_centroid', 'unknown')}
- Duration: {audio_features.get('duration', 'unknown')} seconds

Return ONLY a JSON object with these exact keys:
{{
  "mood": "one word mood like happy, sad, melancholic, energetic, dreamy, aggressive, peaceful, nostalgic",
  "genre": "most likely genre like rock, jazz, electronic, classical, hip-hop, ambient, folk, blues",
  "instruments": ["list", "of", "likely", "instruments"],
  "energy_level": "low, medium, or high",
  "tags": ["list", "of", "5-8", "descriptive", "tags"],
  "title_suggestion": "a creative short title for this musical idea"
}}"""

    heuristic = _heuristic_analysis(audio_features)
    response_text = await query_ollama(prompt)

    if not response_text:
        # Fast fallback when Ollama is unavailable or slow.
        return heuristic

    try:
        result = json.loads(response_text)
        if not isinstance(result, dict):
            return heuristic
        
        # Ensure all expected keys exist
        return {
            "mood": result.get("mood", heuristic["mood"]),
            "genre": result.get("genre", heuristic["genre"]),
            "instruments": result.get("instruments", heuristic["instruments"]),
            "energy_level": result.get(
                "energy_level",
                audio_features.get("energy_level", heuristic["energy_level"]),
            ),
            "tags": result.get("tags", heuristic["tags"]),
            "title_suggestion": result.get("title_suggestion", heuristic["title_suggestion"]),
        }
    except json.JSONDecodeError:
        return heuristic


async def extract_search_tags(query: str) -> list[str]:
    """Convert a natural language search query into music tags."""
    prompt = f"""You are a music search assistant. Convert this search query into music tags for matching.

Query: "{query}"

Return ONLY a JSON object with a single key "tags" containing a list of relevant music tags.
Example: {{"tags": ["sad", "guitar", "acoustic", "slow", "minor key"]}}"""

    response_text = await query_ollama(prompt)

    if not response_text:
        # Fallback: split query into words as tags
        return query.lower().split()

    try:
        result = json.loads(response_text)
        if isinstance(result, dict):
            return result.get("tags", query.lower().split())
        elif isinstance(result, list):
            # Try to coerce list items to strings
            return [str(item) for item in result]
        return query.lower().split()
    except json.JSONDecodeError:
        return query.lower().split()


def _heuristic_analysis(features: dict) -> dict:
    """Fallback analysis when Ollama is unavailable."""
    bpm = float(features.get("bpm") or 120)
    energy = (features.get("energy_level") or "medium").lower()
    key = features.get("key_signature", "") or ""
    zcr = float(features.get("zero_crossing_rate") or 0.0)
    spectral_centroid = float(features.get("spectral_centroid") or 0.0)
    duration = float(features.get("duration") or 0.0)

    # Mood heuristic
    if "Minor" in key:
        mood = "melancholic" if energy == "low" else ("brooding" if energy == "medium" else "intense")
    else:
        mood = "uplifting" if energy == "high" else ("focused" if energy == "medium" else "peaceful")

    # Genre heuristic based on BPM
    if bpm < 80:
        genre = "ambient"
    elif bpm < 110:
        genre = "jazz"
    elif bpm < 130:
        genre = "pop"
    elif bpm < 150:
        genre = "rock"
    else:
        genre = "electronic"

    # Instrument texture heuristic from spectral shape.
    if zcr > 0.12 and spectral_centroid > 3000:
        instruments = ["drums", "percussion"]
    elif spectral_centroid > 2600:
        instruments = ["synth", "lead"]
    elif spectral_centroid > 1400:
        instruments = ["guitar", "keys"]
    else:
        instruments = ["bass", "pad"]

    tags = [mood, genre, energy, "instrumental", f"{int(round(bpm))}bpm"]
    if "Minor" in key:
        tags.append("minor")
    if "Major" in key:
        tags.append("major")
    if duration > 0:
        tags.append("loop" if duration <= 8 else "phrase")

    return {
        "mood": mood,
        "genre": genre,
        "instruments": instruments,
        "energy_level": energy,
        "tags": tags,
        "title_suggestion": f"{mood.capitalize()} {genre.capitalize()} Sketch",
    }
