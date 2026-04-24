const rawApiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_BASE = rawApiBase.replace(/\/+$/, "");

async function fetchApi<T>(path: string, options?: RequestInit, retries = 3): Promise<T> {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
      },
    });

    if (!res.ok) {
      // If Render load balancer throws a timeout/gateway error because the container is waking up, retry.
      if ((res.status === 502 || res.status === 503 || res.status === 504) && retries > 0) {
        console.warn(`Render sleeping. Retrying ${url} in 5 seconds... (${retries} left)`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return fetchApi(path, options, retries - 1);
      }
      const error = await res.text();
      throw new Error(`API Error ${res.status}: ${error}`);
    }
    return res.json();
  } catch (error: any) {
    // If it's a network failure (fetch failed completely), retry.
    if (error.name === "TypeError" && retries > 0) {
      console.warn(`Network error. Retrying ${url} in 5 seconds... (${retries} left)`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return fetchApi(path, options, retries - 1);
    }
    throw error;
  }
}

// ---- Capture ----
export async function captureAudio(audioBlob: Blob, title?: string, mood?: string) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "capture.wav");
  if (title) formData.append("title", title);
  if (mood) formData.append("mood", mood);

  return fetchApi("/api/capture", {
    method: "POST",
    body: formData,
  });
}

export async function branchIdea(
  ideaId: number,
  parentVersionId: number,
  audioBlob: Blob,
  notes?: string
) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "branch.wav");
  formData.append("parent_version_id", parentVersionId.toString());
  if (notes) formData.append("notes", notes);

  return fetchApi(`/api/capture/${ideaId}/branch`, {
    method: "POST",
    body: formData,
  });
}

// ---- Ideas ----
export async function getIdeas(skip = 0, limit = 50) {
  return fetchApi(`/api/ideas?skip=${skip}&limit=${limit}`, { cache: "no-store" });
}

export async function getIdea(id: number) {
  return fetchApi(`/api/ideas/${id}`, { cache: "no-store" });
}

export async function deleteIdea(id: number) {
  return fetchApi(`/api/ideas/${id}`, { method: "DELETE" });
}

export async function getIdeaGraph(id: number) {
  return fetchApi(`/api/ideas/${id}/graph`, { cache: "no-store" });
}

// ---- Search ----
export async function searchIdeas(query: string) {
  return fetchApi("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
}

// ---- Stats ----
export async function getStats() {
  return fetchApi("/api/stats", { cache: "no-store" });
}

export async function getActivity(days = 180) {
  return fetchApi(`/api/activity?days=${days}`, { cache: "no-store" });
}

// ---- Audio URL ----
export function getAudioUrl(filename: string) {
  return `${API_BASE}/api/audio/${filename}`;
}
