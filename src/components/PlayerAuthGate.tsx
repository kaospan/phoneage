import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { loadCampaignProgress } from "@/lib/campaignProgress";
import { hasCloudProgress, migrateLocalProgressToCloud } from "@/lib/cloudProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlayerSessionProvider } from "@/contexts/PlayerSessionContext";

type Mode = "signin" | "signup";

/**
 * Every player gets their own Supabase Auth account so progress can be synced to the cloud
 * and shown in the CRM. Whatever's in localStorage from before this shipped gets uploaded
 * once, on first login, then the cloud becomes the source of truth (see cloudProgress.ts).
 */
export function PlayerAuthGate({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    // The user id that has finished the one-time migration check/upload and is safe to render
    // children for. Kept separate from `session` itself so there is no render frame where a
    // freshly-signed-in session is present but migration hasn't been accounted for yet — that
    // gap previously let <PuzzleGame> mount once, then unmount/remount when migration kicked in.
    const [readyUserId, setReadyUserId] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>("signin");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!supabase) {
            setLoading(false);
            return;
        }
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setLoading(false);
        });
        const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession);
        });
        return () => subscription.subscription.unsubscribe();
    }, []);

    // First login on this account: upload whatever local progress exists, once.
    useEffect(() => {
        const userId = session?.user?.id;
        if (!userId) return;
        let cancelled = false;
        (async () => {
            const already = await hasCloudProgress(userId);
            if (!already && !cancelled) {
                const local = loadCampaignProgress();
                await migrateLocalProgressToCloud(userId, local);
            }
            if (!cancelled) setReadyUserId(userId);
        })();
        return () => { cancelled = true; };
    }, [session?.user?.id]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        setSubmitting(true);
        setError(null);
        setInfo(null);

        if (mode === "signup") {
            const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
            setSubmitting(false);
            if (signUpError) { setError(signUpError.message); return; }
            if (!data.session) {
                setInfo("Account created — check your email to confirm, then sign in.");
                setMode("signin");
            }
            return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        setSubmitting(false);
        if (signInError) setError(signInError.message);
    };

    if (loading) {
        return (
            <div className="flex h-full w-full items-center justify-center text-sm text-stone-300">
                Loading…
            </div>
        );
    }

    if (!supabase) {
        return (
            <div className="flex h-full w-full items-center justify-center px-6 text-center">
                <div className="max-w-sm rounded-2xl border border-red-300/30 bg-red-950/40 p-6 text-red-100">
                    <div className="text-sm font-black uppercase tracking-wide">Sign-in unavailable</div>
                    <div className="mt-2 text-sm text-red-200/80">
                        Supabase isn't configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
                    </div>
                </div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="flex h-full w-full items-center justify-center px-4">
                <form
                    onSubmit={handleSubmit}
                    className="w-full max-w-sm rounded-[24px] border border-white/10 bg-stone-950/90 p-6 shadow-2xl backdrop-blur-xl"
                >
                    <div className="text-center">
                        <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Stone Age</div>
                        <div className="mt-1 text-xl font-black text-stone-50">
                            {mode === "signin" ? "Sign In" : "Create Account"}
                        </div>
                    </div>

                    <div className="mt-5 space-y-3">
                        <div>
                            <Label htmlFor="player-email" className="text-xs text-stone-300">Email</Label>
                            <Input
                                id="player-email"
                                type="email"
                                autoComplete="username"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="mt-1 bg-white/5 text-stone-50"
                            />
                        </div>
                        <div>
                            <Label htmlFor="player-password" className="text-xs text-stone-300">Password</Label>
                            <Input
                                id="player-password"
                                type="password"
                                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                className="mt-1 bg-white/5 text-stone-50"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="mt-3 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                            {error}
                        </div>
                    )}
                    {info && (
                        <div className="mt-3 rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                            {info}
                        </div>
                    )}

                    <Button type="submit" disabled={submitting} className="mt-5 w-full bg-amber-300 text-stone-950 hover:bg-amber-200">
                        {submitting ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
                    </Button>

                    <button
                        type="button"
                        onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setInfo(null); }}
                        className="mt-3 w-full text-center text-xs text-stone-400 hover:text-stone-200"
                    >
                        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
                    </button>
                </form>
            </div>
        );
    }

    if (readyUserId !== session.user.id) {
        return (
            <div className="flex h-full w-full items-center justify-center text-sm text-stone-300">
                Syncing your progress…
            </div>
        );
    }

    // Sign-out lives inside the game's own HUD button cluster (via context) rather than as a
    // floating corner button — a fixed-position overlay here collided with the in-game HUD's
    // own top-right controls at normal desktop widths.
    return (
        <PlayerSessionProvider value={{ user: session.user, signOut: () => { void supabase.auth.signOut(); } }}>
            {children}
        </PlayerSessionProvider>
    );
}
