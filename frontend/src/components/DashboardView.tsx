import { useEffect, useMemo, useRef, useState } from "react";
import { getMatchHistory, getMatchHistoryDetail, getSplitAverages, getStats, getSyncStatus, searchLeaderboardPlayers, syncDashboard } from "../lib/api";
import type {
  LeaderboardPlayer,
  MatchHistoryDetailResponse,
  MatchHistoryItem,
  MatchHistoryResponse,
  SplitAveragesResponse,
  StatsResponse,
  SyncDashboardResponse
} from "../lib/types";
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

function fmtDateFromEpoch(epochSeconds: number | null | undefined) {
  if (!epochSeconds) return "-";
  const d = new Date(epochSeconds * 1000);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

function fmtMatchAge(epochSeconds: number | null | undefined) {
  if (!epochSeconds) return "-";
  const diffHours = Math.max(Math.floor((Date.now() - epochSeconds * 1000) / 3600000), 0);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
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

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
      <path d="M20.32 4.37a16.4 16.4 0 0 0-4.1-1.29.06.06 0 0 0-.07.03c-.18.32-.38.74-.52 1.07a15.3 15.3 0 0 0-4.58 0 10.7 10.7 0 0 0-.53-1.07.06.06 0 0 0-.07-.03 16.4 16.4 0 0 0-4.1 1.29.05.05 0 0 0-.03.02C3.73 8.1 2.96 11.72 3.33 15.29a.07.07 0 0 0 .03.05 16.6 16.6 0 0 0 5.03 2.57.06.06 0 0 0 .08-.02c.39-.53.73-1.08 1.03-1.67a.06.06 0 0 0-.03-.08c-.55-.21-1.08-.46-1.58-.75a.06.06 0 0 1-.01-.1c.1-.08.21-.16.31-.24a.06.06 0 0 1 .06-.01c3.3 1.5 6.87 1.5 10.13 0a.06.06 0 0 1 .06 0c.1.08.21.16.31.24a.06.06 0 0 1-.01.1c-.5.29-1.03.54-1.58.75a.06.06 0 0 0-.03.08c.3.58.64 1.14 1.03 1.67a.06.06 0 0 0 .08.02 16.54 16.54 0 0 0 5.03-2.57.06.06 0 0 0 .03-.05c.44-4.13-.74-7.72-2.96-10.9a.05.05 0 0 0-.03-.02ZM9.55 13.1c-.99 0-1.8-.91-1.8-2.03 0-1.12.8-2.03 1.8-2.03 1 0 1.81.92 1.8 2.03 0 1.12-.8 2.03-1.8 2.03Zm4.9 0c-.99 0-1.8-.91-1.8-2.03 0-1.12.8-2.03 1.8-2.03 1 0 1.81.92 1.8 2.03 0 1.12-.8 2.03-1.8 2.03Z" />
    </svg>
  );
}

function TwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
      <path d="M4 3h17v11l-4 4h-3l-2 2H9v-2H4V3Zm2 2v9h4v2l2-2h4l3-3V5H6Zm5 2h2v5h-2V7Zm4 0h2v5h-2V7Z" />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
      <path d="M21.58 7.19a2.88 2.88 0 0 0-2.03-2.03C17.78 4.67 12 4.67 12 4.67s-5.78 0-7.55.49A2.88 2.88 0 0 0 2.42 7.2C1.93 8.96 1.93 12 1.93 12s0 3.04.49 4.8a2.88 2.88 0 0 0 2.03 2.03c1.77.49 7.55.49 7.55.49s5.78 0 7.55-.49a2.88 2.88 0 0 0 2.03-2.03c.49-1.76.49-4.8.49-4.8s0-3.04-.49-4.8ZM9.99 15.01V8.99L15.2 12l-5.21 3.01Z" />
    </svg>
  );
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
  const [matchHistory, setMatchHistory] = useState<MatchHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<LeaderboardPlayer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);
  const [copiedDiscord, setCopiedDiscord] = useState(false);
  const [expandedMatchIds, setExpandedMatchIds] = useState<number[]>([]);
  const [matchDetails, setMatchDetails] = useState<Record<number, MatchHistoryDetailResponse>>({});
  const [matchDetailLoadingIds, setMatchDetailLoadingIds] = useState<Record<number, boolean>>({});
  const [matchDetailErrors, setMatchDetailErrors] = useState<Record<number, string>>({});
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

  async function loadDashboard(usernameOverride?: string) {
    setLoading(true);
    setError(null);
    setStatusText(null);
    try {
      const clean = (usernameOverride ?? username).trim();
      syncMonitorIdRef.current += 1;
      const monitorId = syncMonitorIdRef.current;
      const defaultStartFilter = "all";
      const defaultBastionFilter = "all";
      setSplitStartFilter(defaultStartFilter);
      setSplitBastionFilter(defaultBastionFilter);
      const sync = await syncDashboard(clean);
      setSyncInfo(sync);
      if (sync.up_to_date) {
        setStatusText(null);
      } else {
        setStatusText(sync.message);
      }
      const [statsRes, splitsRes, historyRes] = await Promise.all([
        getStats(clean),
        getSplitAverages(clean, {
          start: defaultStartFilter,
          bastion: defaultBastionFilter
        }),
        getMatchHistory(clean, { window: "current_season" })
      ]);
      setStats(statsRes);
      setSplits(splitsRes);
      setMatchHistory(historyRes);
      setActiveUsername(clean);
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
      const [nextStats, nextSplits, nextHistory] = await Promise.all([
        getStats(usernameToTrack),
        getSplitAverages(usernameToTrack, { start: startFilter, bastion: bastionFilter }),
        getMatchHistory(usernameToTrack, { window: "current_season" })
      ]);
      if (monitorId !== syncMonitorIdRef.current) return;
      setStats(nextStats);
      setSplits(nextSplits);
      setMatchHistory(nextHistory);
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
    if (!activeUsername) return;
    const usernameToLoad = activeUsername;
    let cancelled = false;

    async function reloadHistory() {
      setHistoryLoading(true);
      try {
        const next = await getMatchHistory(usernameToLoad, { window: "current_season" });
        if (!cancelled) {
          setMatchHistory(next);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load match history");
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    reloadHistory();
    return () => {
      cancelled = true;
    };
  }, [activeUsername]);

  useEffect(() => {
    const q = username.trim();
    if (suggestionDebounceRef.current) {
      window.clearTimeout(suggestionDebounceRef.current);
      suggestionDebounceRef.current = null;
    }

    if (selectedSuggestion && q.toLowerCase() === selectedSuggestion.toLowerCase()) {
      setShowSuggestions(false);
      return;
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
    setSelectedSuggestion(player.nickname);
    setShowSuggestions(false);
    setSearchSuggestions([]);
    void loadDashboard(player.nickname);
  }

  function handleSubmitSearch() {
    if (loading || !username.trim()) return;
    void loadDashboard();
  }

  async function handleCopyDiscord() {
    const discordValue = stats?.socials?.discord_username || stats?.socials?.discord_id;
    if (!discordValue) return;
    try {
      await navigator.clipboard.writeText(discordValue);
      setCopiedDiscord(true);
      window.setTimeout(() => setCopiedDiscord(false), 1600);
    } catch {
      setCopiedDiscord(false);
    }
  }

  async function handleOpenMatchDetail(match: MatchHistoryItem) {
    if (!activeUsername || !match.match_id) return;
    const matchId = match.match_id;
    if (expandedMatchIds.includes(matchId)) {
      setExpandedMatchIds((prev) => prev.filter((id) => id !== matchId));
      return;
    }

    setExpandedMatchIds((prev) => [...prev, matchId]);
    if (matchDetails[matchId]) {
      return;
    }

    setMatchDetailLoadingIds((prev) => ({ ...prev, [matchId]: true }));
    setMatchDetailErrors((prev) => {
      const next = { ...prev };
      delete next[matchId];
      return next;
    });
    try {
      const detail = await getMatchHistoryDetail(activeUsername, matchId);
      setMatchDetails((prev) => ({ ...prev, [matchId]: detail }));
    } catch (e) {
      setMatchDetailErrors((prev) => ({
        ...prev,
        [matchId]: e instanceof Error ? e.message : "Failed to load match details"
      }));
    } finally {
      setMatchDetailLoadingIds((prev) => ({ ...prev, [matchId]: false }));
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="grid h-full grid-cols-1 lg:grid-cols-[340px_1fr]">
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
              onChange={(e) => {
                setUsername(e.target.value);
                setSelectedSuggestion(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmitSearch();
                }
              }}
              onFocus={() => {
                const q = username.trim();
                const isSelectedValue =
                  !!selectedSuggestion && q.toLowerCase() === selectedSuggestion.toLowerCase();
                if (searchSuggestions.length > 0 && !isSelectedValue) {
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

          {syncInfo && !syncInfo.up_to_date ? (
            <p className="mt-4 text-xs text-slate-400">
              {syncInfo.message}
              {syncInfo.sync ? ` Synced ${syncInfo.sync.fetched_ranked_matches_in_window} ranked matches (${syncInfo.sync.window}).` : ""}
            </p>
          ) : null}
          {statusText && !syncInfo?.up_to_date ? <p className="mt-2 text-xs text-cyan">{statusText}</p> : null}
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

        <main className="h-full overflow-hidden p-4 md:p-6">
          {!stats ? (
            <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-slate-700 bg-slate-900/60 p-10 text-center text-slate-400">
              Search for a player to load dashboard data.
            </div>
          ) : (
            <div className="relative grid h-full grid-rows-[auto_1fr] gap-4 overflow-hidden">
              <section className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-soft">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-400">Player</p>
                      <div className="flex items-center gap-3">
                        <img
                          src={getPlayerHeadUrl(stats.username, 32)}
                          alt={`${stats.username} skin head`}
                          className="h-8 w-8 rounded-sm border border-slate-700 [image-rendering:pixelated]"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.src = getPlayerHeadUrl("Steve", 32);
                          }}
                        />
                        <h2 className="text-3xl font-bold">{stats.username}</h2>
                        <div className="flex items-center gap-2 pt-1 text-slate-400">
                          {stats.socials?.discord_username || stats.socials?.discord_id ? (
                            <button
                              type="button"
                              onClick={handleCopyDiscord}
                              className="relative transition hover:text-cyan"
                              title={copiedDiscord ? "Copied" : "Copy Discord"}
                            >
                              <DiscordIcon />
                              {copiedDiscord ? (
                                <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 rounded-md border border-cyan/30 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-cyan">
                                  Copied
                                </span>
                              ) : null}
                            </button>
                          ) : null}
                          {stats.socials?.twitch_url ? (
                            <a
                              href={stats.socials.twitch_url}
                              target="_blank"
                              rel="noreferrer"
                              className="transition hover:text-cyan"
                              title="Open Twitch"
                            >
                              <TwitchIcon />
                            </a>
                          ) : null}
                          {stats.socials?.youtube_url ? (
                            <a
                              href={stats.socials.youtube_url}
                              target="_blank"
                              rel="noreferrer"
                              className="transition hover:text-cyan"
                              title="Open YouTube"
                            >
                              <YoutubeIcon />
                            </a>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-1 text-sm italic text-slate-400">
                        {stats.overall_record?.record_line ?? "-"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-300">Personal Overview</div>
                  </div>

                  <div className="mt-6 p-1">
                    <div className="grid gap-5 lg:grid-cols-[96px_1fr_auto] lg:items-center">
                      <div className="flex items-center justify-center">
                        <div className="p-2">
                          <img src={currentRank.icon} alt={currentRank.label} className="h-16 w-16 object-contain" />
                        </div>
                      </div>

                      <div>
                        <p className="text-2xl font-extrabold uppercase tracking-wide text-slate-100">{currentRank.label}</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-200">{stats.current_elo ?? "-"} ELO</p>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                          <span className="text-slate-400">
                            Peak: <span className="font-semibold text-slate-200">{peakRank.label} ({stats.peak_elo ?? "-"})</span>
                          </span>
                          <span className="text-slate-400">
                            Best Time: <span className="font-semibold text-slate-200">{stats.personal_best?.time_mmss ?? "-"}</span>
                          </span>
                        </div>
                      </div>

                      <div className="grid min-w-[210px] gap-2 text-sm">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-400">Win Rate</span>
                          <span className="font-semibold text-slate-100">{(stats.overall_win_rate_percent ?? 0).toFixed(2)}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-400">Average Time</span>
                          <span className="font-semibold text-slate-100">
                            {stats.overall_average_time_mmss ?? fmtSeconds(stats.overall_average_time_seconds ?? null)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-400">Current Streak</span>
                          <span className="font-semibold text-slate-100">{stats.win_streak?.current ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-400">Best Streak</span>
                          <span className="font-semibold text-slate-100">{stats.win_streak?.best ?? 0}</span>
                        </div>
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

              <section className="grid min-h-0 items-stretch gap-4 xl:grid-cols-2">
                <section className="flex min-h-0 flex-col rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-soft">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
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
                  <div className="space-y-1.5">
                    {(activeSplitWindow?.total_split_rows ?? 0) === 0 ? (
                      <div className="rounded-lg bg-slate-800/70 px-3 py-3 text-sm text-slate-300">
                        No matches found for the selected seed type + bastion filters.
                      </div>
                    ) : (
                      splitRows.map((row) => (
                        <div key={row.key} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-slate-800/60 px-3 py-1.5 text-sm">
                          <span className="flex items-center gap-2 capitalize text-slate-300">
                            {row.icon ? (
                              <img
                                src={row.icon}
                                alt={row.label}
                                className="h-4 w-4 rounded-sm object-contain"
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
                  <div className="mt-4 space-y-3 border-t border-slate-800 pt-3">
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

                <section className="flex min-h-0 flex-col rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-soft">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">Match History</h3>
                    <p className="text-sm text-slate-400">
                      {historyLoading ? "Loading..." : `${matchHistory?.count ?? 0} matches (season)`}
                    </p>
                  </div>

                  {historyLoading ? (
                    <p className="text-sm text-slate-400">Loading match history...</p>
                  ) : (matchHistory?.matches.length ?? 0) === 0 ? (
                    <p className="text-sm text-slate-400">No ranked matches found.</p>
                  ) : (
                    <div className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-800">
                      <div className="grid grid-cols-[1.2fr_0.6fr_0.6fr_0.8fr] gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        <span>Opponent</span>
                        <span>Result</span>
                        <span>Elo</span>
                        <span>Date</span>
                      </div>
                      {(matchHistory?.matches ?? []).map((match: MatchHistoryItem) => {
                        const matchId = match.match_id ?? -1;
                        const isExpanded = match.match_id != null && expandedMatchIds.includes(match.match_id);
                        const detail = match.match_id != null ? matchDetails[match.match_id] : undefined;
                        const isLoadingDetail = match.match_id != null ? !!matchDetailLoadingIds[match.match_id] : false;
                        const detailError = match.match_id != null ? matchDetailErrors[match.match_id] : undefined;

                        return (
                          <div key={`${match.match_id ?? "m"}-${match.played_at_epoch ?? "t"}`} className="border-b border-slate-800/70 last:border-b-0">
                            <button
                              type="button"
                              onClick={() => void handleOpenMatchDetail(match)}
                              className={`grid w-full grid-cols-[1.2fr_0.6fr_0.6fr_0.8fr] gap-2 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800/40 ${
                                isExpanded ? "bg-slate-800/50" : ""
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {match.opponent.head_url ? (
                                  <img
                                    src={match.opponent.head_url}
                                    alt={match.opponent.nickname ?? "opponent"}
                                    className="h-5 w-5 rounded-sm [image-rendering:pixelated]"
                                    loading="lazy"
                                  />
                                ) : null}
                                <span className="truncate">{match.opponent.nickname ?? "Unknown"}</span>
                              </div>
                              <span
                                className={
                                  match.outcome === "win"
                                    ? "font-semibold text-green-400"
                                    : match.outcome === "loss"
                                      ? "font-semibold text-red-400"
                                      : "font-semibold text-blue-400"
                                }
                              >
                                {match.outcome === "win" ? "W" : match.outcome === "loss" ? "L" : "D"}
                              </span>
                              <span
                                className={
                                  match.elo_change == null
                                    ? "font-semibold text-cyan"
                                    : (match.elo_change ?? 0) > 0
                                    ? "font-semibold text-green-400"
                                    : (match.elo_change ?? 0) < 0
                                      ? "font-semibold text-red-400"
                                      : "text-slate-300"
                                }
                              >
                                {match.elo_change == null ? "Placement" : `${match.elo_change > 0 ? "+" : ""}${match.elo_change}`}
                              </span>
                              <span className="text-slate-400">{fmtDateFromEpoch(match.played_at_epoch)}</span>
                            </button>

                            {isExpanded ? (
                              <div className="bg-slate-900/65 px-3 pb-3">
                                <div className="rounded-xl border border-slate-800 bg-slate-950/55">
                                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
                                    <div className="flex flex-wrap items-center gap-4 text-sm">
                                      <div>
                                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Ranked</p>
                                        <p className="text-slate-300">{detail ? fmtMatchAge(detail.played_at_epoch) : "Loading..."}</p>
                                      </div>
                                      <div>
                                        <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                          {detail?.outcome === "win" ? "Victory" : detail?.outcome === "loss" ? "Defeat" : "Draw"}
                                        </p>
                                        <p className="text-xl font-bold text-slate-100">{detail?.result_time_text ?? "--:--.---"}</p>
                                      </div>
                                      <div>
                                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Opponent</p>
                                        <p className="font-semibold text-slate-100">{detail?.opponent.nickname ?? match.opponent.nickname ?? "-"}</p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedMatchIds((prev) => prev.filter((id) => id !== matchId))}
                                      className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                                    >
                                      Close
                                    </button>
                                  </div>

                                  <div className="px-4 py-3">
                                    {isLoadingDetail ? (
                                      <p className="text-sm text-slate-400">Loading match details...</p>
                                    ) : detailError ? (
                                      <p className="text-sm text-red-300">{detailError}</p>
                                    ) : detail ? (
                                      <>
                                        <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                                          <p>Season {detail.season ?? "-"}</p>
                                          <p>Match #{detail.match_id ?? "-"}</p>
                                        </div>
                                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-slate-800 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                          <div className="flex items-center gap-2 text-slate-200 normal-case tracking-normal">
                                            {detail.opponent.head_url ? (
                                              <img src={detail.opponent.head_url} alt={detail.opponent.nickname ?? "opponent"} className="h-7 w-7 rounded-sm [image-rendering:pixelated]" />
                                            ) : null}
                                            <span>{detail.opponent.nickname ?? "Opponent"}</span>
                                          </div>
                                          <span className="text-center">Split</span>
                                          <div className="flex items-center justify-end gap-2 text-slate-200 normal-case tracking-normal">
                                            <span>{detail.player.nickname ?? stats.username}</span>
                                            {detail.player.head_url ? (
                                              <img src={detail.player.head_url} alt={detail.player.nickname ?? "player"} className="h-7 w-7 rounded-sm [image-rendering:pixelated]" />
                                            ) : null}
                                          </div>
                                        </div>

                                        <div className="mt-1">
                                          {detail.splits.map((row) => {
                                            const opponentClass =
                                              row.faster === "opponent" ? "text-green-400" : row.faster === "player" ? "text-red-400" : "text-slate-200";
                                            const playerClass =
                                              row.faster === "player" ? "text-green-400" : row.faster === "opponent" ? "text-red-400" : "text-slate-200";

                                            return (
                                              <div key={row.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-slate-800/60 py-2 text-sm last:border-b-0">
                                                <div className="justify-self-start">
                                                  <p className={`font-semibold ${opponentClass}`}>{row.opponent_time_text ?? "-"}</p>
                                                  <p className={`${row.faster === "player" ? "text-red-400" : "text-slate-500"} text-xs`}>
                                                    {row.delta_text && row.faster === "player" ? `(+${row.delta_text})` : row.delta_text && row.faster === "opponent" ? `(-${row.delta_text})` : ""}
                                                  </p>
                                                </div>
                                                <div className="text-center">
                                                  <p className="font-semibold text-slate-100">{row.label}</p>
                                                </div>
                                                <div className="justify-self-end text-right">
                                                  <p className={`font-semibold ${playerClass}`}>{row.player_time_text ?? "-"}</p>
                                                  <p className={`${row.faster === "opponent" ? "text-red-400" : "text-slate-500"} text-xs`}>
                                                    {row.delta_text && row.faster === "opponent" ? `(+${row.delta_text})` : row.delta_text && row.faster === "player" ? `(-${row.delta_text})` : ""}
                                                  </p>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
