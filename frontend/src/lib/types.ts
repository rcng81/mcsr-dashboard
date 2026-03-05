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
