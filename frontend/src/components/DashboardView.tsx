import { useEffect, useMemo, useRef, useState } from "react";
import { getSplitAverages, getStats, getSyncStatus, searchLeaderboardPlayers, syncDashboard } from "../lib/api";
import type { LeaderboardPlayer, SplitAveragesResponse, StatsResponse, SyncDashboardResponse } from "../lib/types";
import coalIcon from "../assets/coal.png";
import ironIcon from "../assets/iron.png";
import goldIcon from "../assets/gold.png";
import emeraldIcon from "../assets/emerald.png";
import diamondIcon from "../assets/diamond.png";
import netheriteIcon from "../assets/netherite.png";

type DashboardViewProps = {
  onBackHome: () => void;
};

type WindowKey = "7" | "30";
type SplitWindowKey = "all" | "7" | "30";
type SplitKey =
  | "nether_enter"
  | "bastion"
  | "fortress"
  | "first_rod"
  | "blind"
  | "stronghold"
  | "end_enter"
  | "dragon_death"
  | "finish";

type RankMeta = { label: string; icon: string };
type SplitMeta = { label: string; icon: string };

const SPLIT_META: Record<SplitKey, SplitMeta> = {
  nether_enter: {
    label: "Nether Enter",
    icon: "https://minecraft.wiki/Special:FilePath/Invicon%20Obsidian.png"
  },
  bastion: {
    label: "Bastion",
    icon: "https://minecraft.wiki/Special:FilePath/Bastion%20Remnant.png"
  },
  fortress: {
    label: "Fortress",
    icon: "https://minecraft.wiki/Special:FilePath/Nether%20Fortress.png"
  },
  first_rod: {
    label: "First Rod",
    icon: "https://minecraft.wiki/Special:FilePath/Invicon%20Blaze%20Rod.png"
  },
  blind: {
    label: "Blind",
    icon: "https://minecraft.wiki/Special:FilePath/Invicon%20Eye%20of%20Ender.png"
  },
  stronghold: {
    label: "Stronghold",
    icon: "https://minecraft.wiki/Special:FilePath/Invicon%20Mossy%20Stone%20Bricks.png"
  },
  end_enter: {
    label: "End Enter",
    icon: "https://minecraft.wiki/Special:FilePath/Invicon%20End%20Portal%20Frame.png"
  },
  dragon_death: {
    label: "Dragon Death",
    icon: "https://minecraft.wiki/Special:FilePath/Ender%20Dragon.png"
  },
  finish: {
    label: "Finish",
    icon: "https://minecraft.wiki/Special:FilePath/Invicon%20Dragon%20Egg.png"
  }
};

const DEFAULT_START_FILTERS = [
  "all",
  "village",
  "desert_temple",
  "ruined_portal",
  "shipwreck",
  "buried_treasure"
];

function fmtSeconds(value: number | null | undefined) {
  if (value == null) return "-";
  const total = Math.round(value);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getPlayerHeadUrl(username: string, size = 32) {
  return `https://mc-heads.net/avatar/${encodeURIComponent(username)}/${size}`;
}

function fmtFilterLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getRankFromElo(elo: number | null | undefined): RankMeta {
  const v = elo ?? 0;
  if (v >= 2000) return { label: "Netherite", icon: netheriteIcon };
  if (v >= 1800) return { label: "Diamond III", icon: diamondIcon };
  if (v >= 1650) return { label: "Diamond II", icon: diamondIcon };
  if (v >= 1500) return { label: "Diamond I", icon: diamondIcon };
  if (v >= 1400) return { label: "Emerald III", icon: emeraldIcon };
  if (v >= 1300) return { label: "Emerald II", icon: emeraldIcon };
  if (v >= 1200) return { label: "Emerald I", icon: emeraldIcon };
  if (v >= 1100) return { label: "Gold III", icon: goldIcon };
  if (v >= 1000) return { label: "Gold II", icon: goldIcon };
  if (v >= 900) return { label: "Gold I", icon: goldIcon };
  if (v >= 800) return { label: "Iron III", icon: ironIcon };
  if (v >= 700) return { label: "Iron II", icon: ironIcon };
  if (v >= 600) return { label: "Iron I", icon: ironIcon };
  if (v >= 500) return { label: "Coal III", icon: coalIcon };
  if (v >= 400) return { label: "Coal II", icon: coalIcon };
  return { label: "Coal I", icon: coalIcon };
}

export default function DashboardView({ onBackHome }: DashboardViewProps) {
  const [username, setUsername] = useState("");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [splits, setSplits] = useState<SplitAveragesResponse | null>(null);
  const [syncInfo, setSyncInfo] = useState<SyncDashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [windowKey, setWindowKey] = useState<WindowKey>("7");
  const [splitWindowKey, setSplitWindowKey] = useState<SplitWindowKey>("all");
  const [splitStartFilter, setSplitStartFilter] = useState("all");
  const [splitBastionFilter, setSplitBastionFilter] = useState("all");
  const [activeUsername, setActiveUsername] = useState<string | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<LeaderboardPlayer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const syncMonitorIdRef = useRef(0);
  const suggestionDebounceRef = useRef<number | null>(null);

  const windowStats =
    windowKey === "7" ? stats?.synced_record_last_7_days ?? null : stats?.synced_record_last_30_days ?? null;
  const currentRank = getRankFromElo(stats?.current_elo);
  const peakRank = getRankFromElo(stats?.peak_elo);

  const activeSplitWindow = useMemo(() => {
    if (!splits) return null;
    if (splitWindowKey === "7") return splits.windows.last_7_days;
    if (splitWindowKey === "30") return splits.windows.last_30_days;
    return splits.windows.all_time;
  }, [splits, splitWindowKey]);

  const splitRows = useMemo(() => {
    if (!activeSplitWindow) return [];
    return Object.entries(activeSplitWindow.averages_mmss)
      .map(([key, mmss]) => ({
        key,
        label: SPLIT_META[key as SplitKey]?.label ?? key.replaceAll("_", " "),
        icon: SPLIT_META[key as SplitKey]?.icon ?? null,
        mmss: mmss ?? "-"
      }));
  }, [activeSplitWindow]);

  const startFilterOptions = useMemo(() => {
    const dynamic = (splits?.available_filters.starts ?? []).map((s) => s.toLowerCase());
    return Array.from(new Set([...DEFAULT_START_FILTERS, ...dynamic]));
  }, [splits]);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    setStatusText("Checking player and syncing ranked data...");
    try {
      const clean = username.trim();
      syncMonitorIdRef.current += 1;
      const monitorId = syncMonitorIdRef.current;
      const defaultStartFilter = "all";
      const defaultBastionFilter = "all";
      setSplitStartFilter(defaultStartFilter);
      setSplitBastionFilter(defaultBastionFilter);
      const sync = await syncDashboard(clean);
      setSyncInfo(sync);
      if (sync.first_time) {
        setStatusText("First-time player detected. Building all-time history, this can take a bit.");
      } else if (sync.up_to_date) {
        setStatusText("Player is up to date. Loading dashboard.");
      } else {
        setStatusText("Found new matches and synced latest data.");
      }
      const [statsRes, splitsRes] = await Promise.all([
        getStats(clean),
        getSplitAverages(clean, {
          start: defaultStartFilter,
          bastion: defaultBastionFilter
        })
      ]);
      setStats(statsRes);
      setSplits(splitsRes);
      setActiveUsername(clean);
      setStatusText(sync.message);
      if (sync.sync_started) {
        setSyncProgress(0);
        void monitorSyncProgress(clean, defaultStartFilter, defaultBastionFilter, monitorId);
      } else {
        setSyncProgress(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatusText(null);
      setSyncProgress(null);
    } finally {
      setLoading(false);
    }
  }

  async function monitorSyncProgress(
    usernameToTrack: string,
    startFilter: string,
    bastionFilter: string,
    monitorId: number
  ) {
    const startedAt = Date.now();
    let maxSeenProgress = 0;
    for (let i = 0; i < 80; i += 1) {
      if (monitorId !== syncMonitorIdRef.current) return;
      try {
        const status = await getSyncStatus(usernameToTrack);
        maxSeenProgress = Math.max(maxSeenProgress, status.progress_percent || 0);
        if (monitorId !== syncMonitorIdRef.current) return;
        setSyncProgress(maxSeenProgress);
        setStatusText(status.message);
        if (!status.in_progress) break;
      } catch {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    try {
      if (monitorId !== syncMonitorIdRef.current) return;
      setSyncProgress((prev) => Math.max(prev ?? 0, 100));
      const elapsed = Date.now() - startedAt;
      const minVisibleMs = 1200;
      if (elapsed < minVisibleMs) {
        await new Promise((resolve) => setTimeout(resolve, minVisibleMs - elapsed));
      }
      const [nextStats, nextSplits] = await Promise.all([
        getStats(usernameToTrack),
        getSplitAverages(usernameToTrack, { start: startFilter, bastion: bastionFilter })
      ]);
      if (monitorId !== syncMonitorIdRef.current) return;
      setStats(nextStats);
      setSplits(nextSplits);
      setStatusText("Sync complete. Dashboard updated.");
    } catch {
      // Keep prior data if refresh fails.
    } finally {
      if (monitorId === syncMonitorIdRef.current) {
        setSyncProgress(null);
      }
    }
  }

  useEffect(() => {
    if (!activeUsername) return;
    const currentUsername = activeUsername;
    let cancelled = false;

    async function reloadFilteredSplits() {
      try {
        const next = await getSplitAverages(currentUsername, {
          start: splitStartFilter,
          bastion: splitBastionFilter
        });
        if (!cancelled) {
          setSplits(next);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load filtered splits");
        }
      }
    }

    reloadFilteredSplits();
    return () => {
      cancelled = true;
    };
  }, [activeUsername, splitStartFilter, splitBastionFilter]);

  useEffect(() => {
    const q = username.trim();
    if (suggestionDebounceRef.current) {
      window.clearTimeout(suggestionDebounceRef.current);
      suggestionDebounceRef.current = null;
    }

    if (q.length < 1) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    suggestionDebounceRef.current = window.setTimeout(async () => {
      try {
        const res = await searchLeaderboardPlayers(q, 10);
        setSearchSuggestions(res.results);
        setShowSuggestions(true);
      } catch {
        setSearchSuggestions([]);
      }
    }, 220);

    return () => {
      if (suggestionDebounceRef.current) {
        window.clearTimeout(suggestionDebounceRef.current);
        suggestionDebounceRef.current = null;
      }
    };
  }, [username]);

  function handleSuggestionSelect(player: LeaderboardPlayer) {
    setUsername(player.nickname);
    setShowSuggestions(false);
    setSearchSuggestions([]);
  }

  function handleSubmitSearch() {
    if (loading || !username.trim()) return;
    void loadDashboard();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[340px_1fr]">
        <aside className="border-b border-slate-800 bg-slate-950/70 p-6 backdrop-blur lg:border-b-0 lg:border-r">
          <button
            onClick={onBackHome}
            className="mb-4 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
          >
            Back to Home
          </button>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">MCSR Dashboard</p>
          <h1 className="mt-2 text-2xl font-bold">Player Lookup</h1>
          <p className="mt-2 text-sm text-slate-400">Search username only.</p>

          <div className="mt-6 space-y-3">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmitSearch();
                }
              }}
              onFocus={() => {
                if (searchSuggestions.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              onBlur={() => {
                window.setTimeout(() => setShowSuggestions(false), 120);
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-slate-100 outline-none ring-cyan/30 focus:ring"
              placeholder="Search username"
            />
            {showSuggestions && searchSuggestions.length > 0 ? (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/95">
                {searchSuggestions.map((player) => (
                  <button
                    key={player.uuid}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSuggestionSelect(player)}
                    className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-slate-800 px-3 py-2 text-left transition hover:bg-slate-800/70 last:border-b-0"
                  >
                    <img
                      src={`https://mc-heads.net/avatar/${encodeURIComponent(player.nickname)}/24`}
                      alt={player.nickname}
                      className="h-6 w-6 rounded-sm [image-rendering:pixelated]"
                      loading="lazy"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{player.nickname}</p>
                      <p className="text-xs text-slate-400">{player.elo_rate ?? "-"} ELO</p>
                    </div>
                    <p className="text-xs text-slate-500">#{player.elo_rank ?? "-"}</p>
                  </button>
                ))}
              </div>
            ) : null}
            <button
              onClick={handleSubmitSearch}
              disabled={loading || !username.trim()}
              className="w-full rounded-xl bg-ink px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Loading..." : "Search"}
            </button>
          </div>

          {syncInfo ? (
            <p className="mt-4 text-xs text-slate-400">
              {syncInfo.message}
              {syncInfo.sync ? ` Synced ${syncInfo.sync.fetched_ranked_matches_in_window} ranked matches (${syncInfo.sync.window}).` : ""}
            </p>
          ) : null}
          {statusText ? <p className="mt-2 text-xs text-cyan">{statusText}</p> : null}
          {syncProgress != null ? (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                <span>Sync Progress</span>
                <span>{Math.round(syncProgress)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-cyan transition-all duration-500"
                  style={{ width: `${Math.max(5, syncProgress)}%` }}
                />
              </div>
            </div>
          ) : null}
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </aside>

        <main className="p-4 md:p-8">
          {!stats ? (
            <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-slate-700 bg-slate-900/60 p-10 text-center text-slate-400">
              Search for a player to load dashboard data.
            </div>
          ) : (
            <div className="space-y-6">
              <section className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-soft">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-400">Player</p>
                      <h2 className="flex items-center gap-3 text-3xl font-bold">
                        <img
                          src={getPlayerHeadUrl(stats.username, 32)}
                          alt={`${stats.username} skin head`}
                          className="h-8 w-8 rounded-sm border border-slate-700 [image-rendering:pixelated]"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.src = getPlayerHeadUrl("Steve", 32);
                          }}
                        />
                        <span>{stats.username}</span>
                      </h2>
                      <p className="mt-1 text-sm italic text-slate-400">
                        {stats.overall_record?.record_line ?? "-"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-300">Personal Overview</div>
                  </div>

                  <div className="mt-6 space-y-3 text-sm">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Current Elo:</span>
                        <img src={currentRank.icon} alt={currentRank.label} className="h-5 w-5" />
                        <span className="font-semibold">{currentRank.label} ({stats.current_elo ?? "-"})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Peak Elo:</span>
                        <img src={peakRank.icon} alt={peakRank.label} className="h-5 w-5" />
                        <span className="font-semibold">{peakRank.label} ({stats.peak_elo ?? "-"})</span>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <span className="text-slate-400">Current Streak:</span>{" "}
                        <span className="font-semibold">{stats.win_streak?.current ?? 0}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Best Streak:</span>{" "}
                        <span className="font-semibold">{stats.win_streak?.best ?? 0}</span>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <span className="text-slate-400">Win Rate:</span>{" "}
                        <span className="font-semibold">{(stats.overall_win_rate_percent ?? 0).toFixed(2)}%</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Average Time:</span>{" "}
                        <span className="font-semibold">
                          {stats.overall_average_time_mmss ?? fmtSeconds(stats.overall_average_time_seconds ?? null)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-soft">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">Ranked Form</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setWindowKey("7")}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                          windowKey === "7" ? "bg-cyan text-white" : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        Last 7 Days
                      </button>
                      <button
                        onClick={() => setWindowKey("30")}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                          windowKey === "30" ? "bg-cyan text-white" : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        Last 30 Days
                      </button>
                    </div>
                  </div>

                  <ul className="grid gap-2 text-sm md:grid-cols-2">
                    <li className="rounded-lg bg-slate-800/70 px-3 py-2"><span className="text-slate-400">Record:</span> <span className="font-semibold">{windowStats?.wins ?? 0}W {windowStats?.losses ?? 0}L {windowStats?.draws ?? 0}D</span></li>
                    <li className="rounded-lg bg-slate-800/70 px-3 py-2"><span className="text-slate-400">Win Rate:</span> <span className="font-semibold">{(windowStats?.win_rate_percent ?? 0).toFixed(2)}%</span></li>
                    <li className="rounded-lg bg-slate-800/70 px-3 py-2"><span className="text-slate-400">Avg Time:</span> <span className="font-semibold">{fmtSeconds(windowStats?.average_match_duration_seconds ?? null)}</span></li>
                    <li className="rounded-lg bg-slate-800/70 px-3 py-2"><span className="text-slate-400">Total Deaths:</span> <span className="font-semibold">{windowStats?.total_deaths ?? 0}</span></li>
                    <li className="rounded-lg bg-slate-800/70 px-3 py-2"><span className="text-slate-400">Avg Deaths/Match:</span> <span className="font-semibold">{(windowStats?.average_deaths_per_match ?? 0).toFixed(2)}</span></li>
                  </ul>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-soft">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Average Split Times (Ranked)</h3>
                    <p className="text-sm text-slate-400">{activeSplitWindow ? `${activeSplitWindow.total_split_rows} matches` : ""}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setSplitWindowKey("all")}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                        splitWindowKey === "all" ? "bg-cyan text-white" : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      All Time
                    </button>
                    <button
                      onClick={() => setSplitWindowKey("7")}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                        splitWindowKey === "7" ? "bg-cyan text-white" : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      7 Days
                    </button>
                    <button
                      onClick={() => setSplitWindowKey("30")}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                        splitWindowKey === "30" ? "bg-cyan text-white" : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      30 Days
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {(activeSplitWindow?.total_split_rows ?? 0) === 0 ? (
                    <div className="rounded-lg bg-slate-800/70 px-3 py-3 text-sm text-slate-300">
                      No matches found for the selected seed type + bastion filters.
                    </div>
                  ) : (
                    splitRows.map((row) => (
                      <div key={row.key} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-slate-800/70 px-3 py-2 text-sm">
                        <span className="flex items-center gap-2 capitalize text-slate-300">
                          {row.icon ? (
                            <img
                              src={row.icon}
                              alt={row.label}
                              className="h-5 w-5 rounded-sm object-contain"
                              loading="lazy"
                            />
                          ) : null}
                          {row.label}
                        </span>
                        <span className="font-semibold text-slate-100">{row.mmss}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-5 space-y-4 border-t border-slate-800 pt-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Filter by Seed Type</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setSplitStartFilter("all")}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          splitStartFilter === "all" ? "bg-cyan text-white" : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        All
                      </button>
                      {startFilterOptions
                        .filter((value) => value !== "all")
                        .map((value) => (
                        <button
                          key={value}
                          onClick={() => setSplitStartFilter(value)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                            splitStartFilter === value ? "bg-cyan text-white" : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {fmtFilterLabel(value)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Filter by Bastion</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setSplitBastionFilter("all")}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          splitBastionFilter === "all" ? "bg-cyan text-white" : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        All
                      </button>
                      {(splits?.available_filters.bastions ?? []).map((value) => (
                        <button
                          key={value}
                          onClick={() => setSplitBastionFilter(value)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                            splitBastionFilter === value ? "bg-cyan text-white" : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {fmtFilterLabel(value)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
