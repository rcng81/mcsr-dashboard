export interface RecordBlock {
  window?: string;
  mode?: string;
  scope?: string;
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate_percent?: number;
  average_match_duration_seconds?: number | null;
  total_deaths?: number;
  average_deaths_per_match?: number | null;
  record_line?: string;
}

export interface StatsResponse {
  username: string;
  current_elo: number | null;
  peak_elo?: number | null;
  socials?: {
    twitch_url: string | null;
    youtube_url: string | null;
    discord_id: string | null;
    discord_username: string | null;
  };
  overall_win_rate_percent?: number | null;
  overall_average_time_seconds?: number | null;
  overall_average_time_mmss?: string | null;
  win_streak?: {
    best: number | null;
    current: number | null;
  };
  personal_best?: {
    time_ms: number | null;
    time_mmss: string | null;
  };
  overall_record: RecordBlock | null;
  season_record?: RecordBlock | null;
  synced_record: RecordBlock;
  synced_record_last_7_days: RecordBlock;
  synced_record_last_30_days: RecordBlock;
  average_match_duration_seconds: number | null;
  total_deaths: number;
  average_deaths_per_match: number | null;
}

export interface SplitAveragesResponse {
  username: string;
  player_uuid: string;
  applied_filters: {
    start: string;
    bastion: string;
  };
  available_filters: {
    starts: string[];
    bastions: string[];
  };
  windows: {
    all_time: SplitWindow;
    last_7_days: SplitWindow;
    last_30_days: SplitWindow;
  };
}

export interface SplitWindow {
  window: string;
  total_split_rows: number;
  averages_ms: Record<string, number | null>;
  averages_seconds: Record<string, number | null>;
  averages_mmss: Record<string, string | null>;
  samples: Record<string, number>;
}

export interface SyncResponse {
  inserted_matches: number;
  inserted_splits: number;
  window: string;
  fetched_ranked_matches_in_window: number;
}

export interface SyncDashboardResponse {
  created_player: boolean;
  first_time: boolean;
  up_to_date: boolean;
  sync_started?: boolean;
  message: string;
  sync?: SyncResponse;
}

export interface SyncStatusResponse {
  username: string;
  in_progress: boolean;
  ranked_synced: number;
  ranked_total: number;
  progress_percent: number;
  message: string;
}

export interface LeaderboardPlayer {
  uuid: string;
  nickname: string;
  elo_rate: number | null;
  elo_rank: number | null;
}

export interface LeaderboardSearchResponse {
  query: string;
  results: LeaderboardPlayer[];
}

export interface MatchHistoryOpponent {
  uuid: string | null;
  nickname: string | null;
  elo_rate: number | null;
  head_url: string | null;
}

export interface MatchHistoryItem {
  match_id: number | null;
  played_at_epoch: number | null;
  outcome: "win" | "loss" | "draw";
  elo_change: number | null;
  result_time_ms: number | null;
  opponent: MatchHistoryOpponent;
}

export interface MatchHistoryResponse {
  username: string;
  player_uuid: string;
  window: "current_season" | "last_7_days" | "last_30_days";
  count: number;
  matches: MatchHistoryItem[];
}

export interface MatchSplitDetailRow {
  key: string;
  label: string;
  player_time_ms: number | null;
  player_time_text: string | null;
  opponent_time_ms: number | null;
  opponent_time_text: string | null;
  delta_ms: number | null;
  delta_text: string | null;
  faster: "player" | "opponent" | "tie" | null;
}

export interface MatchHistoryDetailResponse {
  match_id: number | null;
  season: number | null;
  played_at_epoch: number | null;
  outcome: "win" | "loss" | "draw";
  result_time_ms: number | null;
  result_time_text: string | null;
  player: {
    uuid: string | null;
    nickname: string | null;
    head_url: string | null;
  };
  opponent: {
    uuid: string | null;
    nickname: string | null;
    head_url: string | null;
  };
  splits: MatchSplitDetailRow[];
}
