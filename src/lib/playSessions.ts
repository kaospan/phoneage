import { supabase } from "@/lib/supabaseClient";

/** Logs the start of a level attempt. Returns the session id to close out later, or null if unavailable. */
export async function startPlaySession(userId: string, levelId: number): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("play_sessions")
    .insert({ user_id: userId, level_id: levelId })
    .select("id")
    .single();
  if (error) {
    console.warn("[playSessions] start error:", error.message);
    return null;
  }
  return data?.id ?? null;
}

/** Closes out a previously-started session (completion, or the player left/reset before finishing). */
export async function endPlaySession(
  sessionId: string,
  outcome: { completed: boolean; moves: number | null },
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("play_sessions")
    .update({
      ended_at: new Date().toISOString(),
      completed: outcome.completed,
      moves: outcome.moves,
    })
    .eq("id", sessionId);
  if (error) console.warn("[playSessions] end error:", error.message);
}
