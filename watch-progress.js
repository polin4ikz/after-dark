/* AFTER DARK shared watch progress.
   Local cache keeps progress available offline; Supabase sync shares it between the two private accounts.
   Cross-origin players only expose exact time when their own player API sends playback events. */
(() => {
  "use strict";
  const STORAGE_KEY = "after-dark:watch-progress:v1";
  const SUPABASE_URL = "https://kwphiydboppdpmdihpca.supabase.co";
  const SUPABASE_KEY = "sb_publishable_epCYFzDjeCWaAJdzLeCVDA_rxcQEbnh";
  const records = new Map();
  let clientPromise = null;
  let signedInUser = null;

  const idOf = value => {
    const n = Number(value && typeof value === "object" ? (value.tmdbId ?? value.tmdb_id ?? value.id) : value);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  };
  const safeNumber = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
  const readLocal = () => {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      for (const row of Array.isArray(rows) ? rows : []) {
        const id = idOf(row);
        if (id) records.set(id, { ...row, tmdb_id: id });
      }
    } catch (_) {}
  };
  const writeLocal = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...records.values()])); } catch (_) {}
  };
  const emit = () => {
    window.dispatchEvent(new CustomEvent("afterdark:progress-updated"));
  };
  async function getClient() {
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      // On the archive page, reuse the app's authenticated Supabase client instead of
      // injecting a second SDK/client. The player page can initialize its own client.
      await new Promise(resolve => setTimeout(resolve, 0));
      if (window.afterDarkSupabaseReady) return window.afterDarkSupabaseReady;
      if (window.supabase?.createClient) return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Supabase SDK could not load"));
        document.head.appendChild(script);
      });
      if (!window.supabase?.createClient) throw new Error("Supabase SDK did not expose createClient");
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    })();
    return clientPromise;
  }
  async function syncFromCloud() {
    try {
      const client = await getClient();
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      const user = sessionData?.session?.user;
      if (!user) return false;
      signedInUser = user;
      const { data, error } = await client.from("watch_progress").select("*");
      if (error) throw error;
      for (const row of data || []) {
        const id = idOf(row);
        if (!id) continue;
        const local = records.get(id);
        if (!local || Date.parse(row.updated_at || 0) >= Date.parse(local.updated_at || 0)) {
          records.set(id, { ...row, tmdb_id: id });
        }
      }
      writeLocal();
      emit();
      return true;
    } catch (error) {
      // The local cache still works until the SQL migration is installed or when offline.
      console.info("AFTER DARK: shared progress sync unavailable; using local cache.", error?.message || error);
      return false;
    }
  }
  async function save(input) {
    const id = idOf(input);
    if (!id) return false;
    const previous = records.get(id) || {};
    const status = input.status === "completed" ? "completed" : "in_progress";
    const row = {
      ...previous,
      tmdb_id: id,
      title: String(input.title || previous.title || ""),
      media_type: String(input.media_type || previous.media_type || "movie"),
      position_seconds: Math.floor(safeNumber(input.position_seconds ?? input.positionSeconds ?? previous.position_seconds)),
      duration_seconds: Math.floor(safeNumber(input.duration_seconds ?? input.durationSeconds ?? previous.duration_seconds)),
      status,
      season_number: input.season_number == null ? (previous.season_number ?? null) : Math.max(1, Math.floor(safeNumber(input.season_number))),
      episode_number: input.episode_number == null ? (previous.episode_number ?? null) : Math.max(1, Math.floor(safeNumber(input.episode_number))),
      source_provider: String(input.source_provider || input.sourceProvider || previous.source_provider || "unknown").slice(0, 80),
      updated_at: new Date().toISOString()
    };
    if (row.media_type !== "tv" && row.duration_seconds > 0 && row.position_seconds >= row.duration_seconds * 0.96) row.status = "completed";
    records.set(id, row);
    writeLocal();
    emit();
    try {
      const client = await getClient();
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      const user = sessionData?.session?.user;
      if (!user) return true;
      signedInUser = user;
      const payload = {
        tmdb_id: row.tmdb_id,
        title: row.title || null,
        media_type: row.media_type,
        position_seconds: row.position_seconds,
        duration_seconds: row.duration_seconds,
        status: row.status,
        season_number: row.season_number,
        episode_number: row.episode_number,
        source_provider: row.source_provider,
        updated_by: user.id,
        updated_at: row.updated_at
      };
      const { error } = await client.from("watch_progress").upsert(payload, { onConflict: "tmdb_id" });
      if (error) throw error;
      if (row.status === "completed") {
        const { data: existingArchive, error: archiveReadError } = await client.from("archive")
          .select("tmdb_id").eq("tmdb_id", id).maybeSingle();
        if (archiveReadError) throw archiveReadError;
        if (existingArchive) {
          const { error: archiveError } = await client.from("archive").update({
            watched: true, in_watchlist: false, updated_at: row.updated_at
          }).eq("tmdb_id", id);
          if (archiveError) console.warn("Completed status saved, archive status sync failed:", archiveError.message);
        } else {
          const { error: archiveInsertError } = await client.from("archive").insert({
            tmdb_id: id, title: row.title || "Untitled", type: row.media_type === "tv" ? "series" : "film",
            watched: true, in_watchlist: false, added_by: user.id, updated_at: row.updated_at
          });
          if (archiveInsertError) console.warn("Completed title could not be added to history:", archiveInsertError.message);
        }
      }
    } catch (error) {
      console.info("AFTER DARK: progress saved locally; cloud sync will retry later.", error?.message || error);
    }
    return true;
  }

  readLocal();
  window.afterDarkProgress = {
    get: value => records.get(idOf(value)) || null,
    all: () => [...records.values()],
    save,
    sync: syncFromCloud,
    formatTime(seconds) {
      const n = Math.floor(safeNumber(seconds));
      const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60;
      return h ? h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0")
        : m + ":" + String(s).padStart(2, "0");
    }
  };
  window.afterDarkProgressReady = syncFromCloud();
  window.addEventListener("online", () => { syncFromCloud(); });
})();
