import type {
  SplitAveragesResponse,
  StatsResponse,
  SyncDashboardResponse,
  SyncResponse,
  SyncStatusResponse,
  LeaderboardSearchResponse
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const json = (await res.json()) as { detail?: string };
      if (json?.detail) {
        message = json.detail;
      }
    } catch {
      // Keep generic message when response is not JSON.
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export function getPlayer(username: string) {
  return request(`/players/${encodeURIComponent(username)}`);
}

export function syncMatches(
  username: string,
  options?: { scope?: "last_30_days" | "all_time"; maxPages?: number }
) {
  const params = new URLSearchParams();
  if (options?.scope) params.set("scope", options.scope);
  if (options?.maxPages != null) params.set("max_pages", String(options.maxPages));
  const query = params.toString();
  const path = `/players/${encodeURIComponent(username)}/sync-matches${query ? `?${query}` : ""}`;

  return request<SyncResponse>(path, {
    method: "POST"
  });
}

export function syncDashboard(username: string) {
  return request<SyncDashboardResponse>(`/players/${encodeURIComponent(username)}/sync-dashboard`, {
    method: "POST"
  });
}

export function getSyncStatus(username: string) {
  return request<SyncStatusResponse>(`/players/${encodeURIComponent(username)}/sync-status`);
}

export function getStats(username: string) {
  return request<StatsResponse>(`/players/${encodeURIComponent(username)}/stats`);
}

export function searchLeaderboardPlayers(query: string, limit = 10) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("limit", String(limit));
  return request<LeaderboardSearchResponse>(`/players/search/leaderboard?${params.toString()}`);
}

export function getSplitAverages(
  username: string,
  options?: { start?: string; bastion?: string }
) {
  const params = new URLSearchParams();
  if (options?.start) params.set("start", options.start);
  if (options?.bastion) params.set("bastion", options.bastion);
  const query = params.toString();
  const path = `/players/${encodeURIComponent(username)}/split-averages${query ? `?${query}` : ""}`;
  return request<SplitAveragesResponse>(path);
}
