import { supabase } from "@/lib/supabaseClient";
import type { CampaignLevelRecord, CampaignProgressState } from "@/lib/campaignProgress";

interface ProgressRow {
  level_id: number;
  completed: boolean;
  clear_count: number;
  best_moves: number | null;
  last_moves: number | null;
  best_time_left_seconds: number | null;
  last_time_left_seconds: number | null;
  last_completed_at: string | null;
}

const rowToRecord = (row: ProgressRow): CampaignLevelRecord => ({
  completed: row.completed,
  clearCount: row.clear_count,
  bestMoves: row.best_moves,
  lastMoves: row.last_moves,
  bestTimeLeftSeconds: row.best_time_left_seconds,
  lastTimeLeftSeconds: row.last_time_left_seconds,
  lastCompletedAt: row.last_completed_at ? new Date(row.last_completed_at).getTime() : null,
});

/** Loads a player's full campaign progress from the cloud. Null if unavailable/not signed in. */
export async function fetchCloudProgress(userId: string): Promise<CampaignProgressState | null> {
  if (!supabase) return null;
  const [{ data: rows, error: progressError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.from("player_progress").select("*").eq("user_id", userId),
    supabase.from("profiles").select("highest_unlocked_level_id, last_played_level_id").eq("id", userId).maybeSingle(),
  ]);
  if (progressError || profileError) {
    console.warn("[cloudProgress] fetch error:", progressError?.message ?? profileError?.message);
    return null;
  }

  const levels: Record<string, CampaignLevelRecord> = {};
  for (const row of (rows ?? []) as ProgressRow[]) {
    levels[String(row.level_id)] = rowToRecord(row);
  }

  return {
    version: 1,
    highestUnlockedLevelId: profile?.highest_unlocked_level_id ?? 1,
    lastPlayedLevelId: profile?.last_played_level_id ?? null,
    levels,
  };
}

/** True if the player has no cloud progress rows yet — i.e. a first-time login. */
export async function hasCloudProgress(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { count, error } = await supabase
    .from("player_progress")
    .select("level_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return false;
  return (count ?? 0) > 0;
}

/** Upserts a single level's record to the cloud (fire-and-forget from the caller's perspective). */
export async function pushLevelProgress(
  userId: string,
  levelId: number,
  record: CampaignLevelRecord,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("player_progress").upsert({
    user_id: userId,
    level_id: levelId,
    completed: record.completed,
    clear_count: record.clearCount,
    best_moves: record.bestMoves,
    last_moves: record.lastMoves,
    best_time_left_seconds: record.bestTimeLeftSeconds,
    last_time_left_seconds: record.lastTimeLeftSeconds,
    last_completed_at: record.lastCompletedAt ? new Date(record.lastCompletedAt).toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("[cloudProgress] push level error:", error.message);
}

/** Updates the account-level bookkeeping (unlock progress / last played level). */
export async function pushProfileMeta(
  userId: string,
  meta: { highestUnlockedLevelId: number; lastPlayedLevelId: number | null },
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("profiles")
    .update({
      highest_unlocked_level_id: meta.highestUnlockedLevelId,
      last_played_level_id: meta.lastPlayedLevelId,
    })
    .eq("id", userId);
  if (error) console.warn("[cloudProgress] push profile meta error:", error.message);
}

/** One-time upload of whatever's in localStorage into a freshly-created account. */
export async function migrateLocalProgressToCloud(
  userId: string,
  local: CampaignProgressState,
): Promise<void> {
  if (!supabase) return;
  const entries = Object.entries(local.levels);
  if (entries.length > 0) {
    const rows = entries.map(([levelId, record]) => ({
      user_id: userId,
      level_id: Number(levelId),
      completed: record.completed,
      clear_count: record.clearCount,
      best_moves: record.bestMoves,
      last_moves: record.lastMoves,
      best_time_left_seconds: record.bestTimeLeftSeconds,
      last_time_left_seconds: record.lastTimeLeftSeconds,
      last_completed_at: record.lastCompletedAt ? new Date(record.lastCompletedAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("player_progress").upsert(rows);
    if (error) console.warn("[cloudProgress] migrate error:", error.message);
  }
  await pushProfileMeta(userId, {
    highestUnlockedLevelId: local.highestUnlockedLevelId,
    lastPlayedLevelId: local.lastPlayedLevelId,
  });
}

/** Touches last_seen_at so the CRM can show a meaningful "last seen" even when offline. */
export async function touchLastSeen(userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) console.warn("[cloudProgress] touch last_seen error:", error.message);
}
