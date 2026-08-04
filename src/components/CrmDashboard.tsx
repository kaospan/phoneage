import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RefreshCw, Circle } from "lucide-react";

const PRESENCE_CHANNEL = "game-presence";

interface ProfileRow {
    id: string;
    email: string | null;
    display_name: string | null;
    highest_unlocked_level_id: number;
    last_played_level_id: number | null;
    created_at: string;
    last_seen_at: string;
}

interface ProgressRow {
    user_id: string;
    level_id: number;
    completed: boolean;
    clear_count: number;
    best_moves: number | null;
    last_moves: number | null;
    best_time_left_seconds: number | null;
    last_completed_at: string | null;
}

interface SessionRow {
    id: string;
    user_id: string;
    level_id: number;
    started_at: string;
    ended_at: string | null;
    completed: boolean;
    moves: number | null;
}

interface PresenceMeta {
    email?: string | null;
    level_id?: number | null;
    online_at?: string;
}

const timeAgo = (iso: string | null | undefined): string => {
    if (!iso) return "—";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return "just now";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
};

/** Full local date + time, e.g. "Aug 4, 2026, 3:45:12 PM" — used both as a visible timestamp and as a hover tooltip on the relative "time ago" text. */
const formatTimestamp = (iso: string | null | undefined): string => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
    });
};

export function CrmDashboard() {
    const [profiles, setProfiles] = useState<ProfileRow[]>([]);
    const [progress, setProgress] = useState<ProgressRow[]>([]);
    const [sessions, setSessions] = useState<SessionRow[]>([]);
    const [onlineIds, setOnlineIds] = useState<Map<string, PresenceMeta>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

    const load = async () => {
        if (!supabase) { setError("Supabase not configured"); setLoading(false); return; }
        setLoading(true);
        setError(null);
        const [profilesRes, progressRes, sessionsRes] = await Promise.all([
            supabase.from("profiles").select("*").order("last_seen_at", { ascending: false }),
            supabase.from("player_progress").select("*"),
            supabase.from("play_sessions").select("*").order("started_at", { ascending: false }).limit(2000),
        ]);
        if (profilesRes.error || progressRes.error || sessionsRes.error) {
            setError(profilesRes.error?.message ?? progressRes.error?.message ?? sessionsRes.error?.message ?? "Load failed");
            setLoading(false);
            return;
        }
        setProfiles((profilesRes.data ?? []) as ProfileRow[]);
        setProgress((progressRes.data ?? []) as ProgressRow[]);
        setSessions((sessionsRes.data ?? []) as SessionRow[]);
        setLoading(false);
    };

    useEffect(() => { void load(); }, []);

    // Live "who's online now" via the same presence channel players join.
    useEffect(() => {
        if (!supabase) return;
        const channel = supabase.channel(PRESENCE_CHANNEL, { config: { presence: { key: "crm-viewer" } } });
        const syncOnline = () => {
            const state = channel.presenceState<PresenceMeta>();
            const next = new Map<string, PresenceMeta>();
            for (const [key, metas] of Object.entries(state)) {
                const meta = metas[metas.length - 1] as unknown as PresenceMeta;
                next.set(key, meta ?? {});
            }
            setOnlineIds(next);
        };
        channel.on("presence", { event: "sync" }, syncOnline);
        channel.subscribe();
        return () => { void supabase.removeChannel(channel); };
    }, []);

    const statsByUser = useMemo(() => {
        const map = new Map<string, {
            levelsCompleted: number;
            totalClears: number;
            totalAttempts: number;
            totalMoves: number;
        }>();
        for (const p of progress) {
            const s = map.get(p.user_id) ?? { levelsCompleted: 0, totalClears: 0, totalAttempts: 0, totalMoves: 0 };
            if (p.completed) s.levelsCompleted += 1;
            s.totalClears += p.clear_count ?? 0;
            map.set(p.user_id, s);
        }
        for (const sess of sessions) {
            const s = map.get(sess.user_id) ?? { levelsCompleted: 0, totalClears: 0, totalAttempts: 0, totalMoves: 0 };
            s.totalAttempts += 1;
            s.totalMoves += sess.moves ?? 0;
            map.set(sess.user_id, s);
        }
        return map;
    }, [progress, sessions]);

    const selectedProgress = useMemo(
        () => progress.filter((p) => p.user_id === selectedUserId).sort((a, b) => a.level_id - b.level_id),
        [progress, selectedUserId],
    );
    const selectedSessions = useMemo(
        () => sessions.filter((s) => s.user_id === selectedUserId).slice(0, 100),
        [sessions, selectedUserId],
    );
    const selectedProfile = profiles.find((p) => p.id === selectedUserId) ?? null;

    return (
        <div className="flex h-full w-full flex-col overflow-hidden bg-stone-950 text-stone-50">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div>
                    <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Admin</div>
                    <div className="text-xl font-black">Player CRM</div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-200">
                        <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                        {onlineIds.size} online now
                    </div>
                    <Button onClick={() => void load()} variant="outline" size="sm" className="gap-1.5 border-white/15 bg-white/5 text-stone-100 hover:bg-white/10">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Refresh
                    </Button>
                </div>
            </div>

            {error && (
                <div className="mx-5 mt-4 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {error}
                </div>
            )}

            <div className="flex min-h-0 flex-1 overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {loading ? (
                        <div className="text-sm text-stone-400">Loading…</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-white/10 hover:bg-transparent">
                                    <TableHead className="text-stone-400">Player</TableHead>
                                    <TableHead className="text-stone-400">Status</TableHead>
                                    <TableHead className="text-stone-400">Levels Cleared</TableHead>
                                    <TableHead className="text-stone-400">Total Attempts</TableHead>
                                    <TableHead className="text-stone-400">Total Moves</TableHead>
                                    <TableHead className="text-stone-400">Last Seen</TableHead>
                                    <TableHead className="text-stone-400">Joined</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {profiles.map((p) => {
                                    const stats = statsByUser.get(p.id) ?? { levelsCompleted: 0, totalClears: 0, totalAttempts: 0, totalMoves: 0 };
                                    const online = onlineIds.get(p.id);
                                    return (
                                        <TableRow
                                            key={p.id}
                                            onClick={() => setSelectedUserId(p.id)}
                                            className={[
                                                "cursor-pointer border-white/5 hover:bg-white/5",
                                                selectedUserId === p.id ? "bg-white/10" : "",
                                            ].join(" ")}
                                        >
                                            <TableCell className="font-medium text-stone-100">{p.email ?? p.display_name ?? p.id.slice(0, 8)}</TableCell>
                                            <TableCell>
                                                {online ? (
                                                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-300">
                                                        <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                                                        Online · L{online.level_id ?? "?"}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-stone-500">Offline</span>
                                                )}
                                            </TableCell>
                                            <TableCell>{stats.levelsCompleted}</TableCell>
                                            <TableCell>{stats.totalAttempts}</TableCell>
                                            <TableCell>{stats.totalMoves}</TableCell>
                                            <TableCell className="text-stone-400" title={formatTimestamp(p.last_seen_at)}>
                                                <div>{timeAgo(p.last_seen_at)}</div>
                                                <div className="text-[10px] text-stone-600">{formatTimestamp(p.last_seen_at)}</div>
                                            </TableCell>
                                            <TableCell className="text-stone-400" title={formatTimestamp(p.created_at)}>
                                                <div>{timeAgo(p.created_at)}</div>
                                                <div className="text-[10px] text-stone-600">{formatTimestamp(p.created_at)}</div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {profiles.length === 0 && (
                                    <TableRow className="border-white/5">
                                        <TableCell colSpan={7} className="py-8 text-center text-stone-500">
                                            No players yet.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </div>

                {selectedProfile && (
                    <div className="w-[380px] shrink-0 overflow-y-auto border-l border-white/10 bg-stone-900/60 px-4 py-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-black text-stone-50">{selectedProfile.email}</div>
                            <button onClick={() => setSelectedUserId(null)} className="text-xs text-stone-400 hover:text-stone-200">Close</button>
                        </div>
                        <div className="mt-1 text-xs text-stone-500">
                            Joined {timeAgo(selectedProfile.created_at)} ({formatTimestamp(selectedProfile.created_at)})
                        </div>
                        <div className="text-xs text-stone-500">
                            Last seen {timeAgo(selectedProfile.last_seen_at)} ({formatTimestamp(selectedProfile.last_seen_at)})
                        </div>

                        <div className="mt-4 text-xs font-black uppercase tracking-wide text-stone-400">Per-level progress</div>
                        <div className="mt-2 space-y-1.5">
                            {selectedProgress.length === 0 && <div className="text-xs text-stone-500">No levels played yet.</div>}
                            {selectedProgress.map((row) => (
                                <div key={row.level_id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs">
                                    <span className="font-bold text-stone-200">L{row.level_id}</span>
                                    <span className={row.completed ? "text-emerald-300" : "text-stone-400"}>
                                        {row.completed ? "Cleared" : "In progress"}
                                    </span>
                                    <span className="text-stone-400">×{row.clear_count}</span>
                                    <span className="text-stone-400">best {row.best_moves ?? "—"} mv</span>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 text-xs font-black uppercase tracking-wide text-stone-400">Recent attempts</div>
                        <div className="mt-2 space-y-1.5">
                            {selectedSessions.length === 0 && <div className="text-xs text-stone-500">No sessions logged yet.</div>}
                            {selectedSessions.map((s) => (
                                <div key={s.id} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-stone-200">L{s.level_id}</span>
                                        <span className={s.completed ? "text-emerald-300" : s.ended_at ? "text-stone-500" : "text-amber-300"}>
                                            {s.completed ? "Cleared" : s.ended_at ? "Abandoned" : "In progress"}
                                        </span>
                                        <span className="text-stone-400">{s.moves ?? "—"} mv</span>
                                        <span className="text-stone-500" title={formatTimestamp(s.started_at)}>{timeAgo(s.started_at)}</span>
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-stone-600">{formatTimestamp(s.started_at)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
