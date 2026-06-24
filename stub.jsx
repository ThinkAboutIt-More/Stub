import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  Ticket, Search, Sparkles, CalendarDays, Settings, X, Star, Pencil,
  Undo2, Trash2, Plus, Check, Heart, ChevronLeft, ChevronRight, Eye,
  Clapperboard, MapPin, Tv, Film, RefreshCw, ExternalLink, Info,
  Bookmark, SkipForward, Camera
} from "lucide-react";

/* ---------------------------------------------------------
   CONSTANTS
--------------------------------------------------------- */

const MOVIE_GENRES = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
};

const TV_GENRES = {
  10759: "Action & Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 10762: "Kids",
  9648: "Mystery", 10763: "News", 10764: "Reality", 10765: "Sci-Fi & Fantasy",
  10766: "Soap", 10767: "Talk", 10768: "War & Politics", 37: "Western"
};

const STORAGE_KEYS = {
  settings: "stub-settings",
  collection: "stub-collection",
  watchlist: "stub-watchlist",
  feedback: "stub-discover-feedback"
};

const DEFAULT_SETTINGS = { tmdbKey: "", omdbKey: "", zip: "", country: "US" };

const PROXY_URL = "https://watchlist-proxy.xphazemusic.workers.dev";

async function callProxy(body) {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Proxy ${res.status}`);
  return data;
}

/* ---------------------------------------------------------
   STORAGE
   This build runs on its own hosted URL, not inside a Claude
   artifact, so it talks to Supabase for cross device sync.
   If no Supabase connection has been set up yet, it falls
   back to this browser only, via localStorage, so the app
   still works before you've connected anything.
--------------------------------------------------------- */

const CONNECTION_KEY = "stub-connection";

function getConnection() {
  try {
    const raw = localStorage.getItem(CONNECTION_KEY);
    return raw ? JSON.parse(raw) : { supabaseUrl: "", supabaseKey: "" };
  } catch (e) {
    return { supabaseUrl: "", supabaseKey: "" };
  }
}

function saveConnection(conn) {
  try {
    localStorage.setItem(CONNECTION_KEY, JSON.stringify(conn));
    return true;
  } catch (e) {
    return false;
  }
}

function hasCloud(conn) {
  return !!(conn && conn.supabaseUrl && conn.supabaseKey);
}

async function loadKey(key, fallback, conn) {
  if (hasCloud(conn)) {
    try {
      const url = `${conn.supabaseUrl}/rest/v1/app_state?id=eq.${encodeURIComponent(key)}&select=value`;
      const res = await fetch(url, {
        headers: { apikey: conn.supabaseKey, Authorization: `Bearer ${conn.supabaseKey}` }
      });
      if (!res.ok) throw new Error(`Supabase ${res.status}`);
      const rows = await res.json();
      if (rows.length) return rows[0].value;
      return fallback;
    } catch (e) {
      // fall through to local copy below if the cloud read fails
    }
  }
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

async function saveKey(key, value, conn) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // local cache is best effort, cloud write below is what actually matters
  }
  if (!hasCloud(conn)) return true;
  try {
    const url = `${conn.supabaseUrl}/rest/v1/app_state?on_conflict=id`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: conn.supabaseKey,
        Authorization: `Bearer ${conn.supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({ id: key, value, updated_at: new Date().toISOString() })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

/* ---------------------------------------------------------
   GENERAL HELPERS
--------------------------------------------------------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function tmdbImg(path, size = "w500") {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function genreNames(ids, mediaType) {
  const map = mediaType === "tv" ? TV_GENRES : MOVIE_GENRES;
  return (ids || []).map((id) => map[id]).filter(Boolean);
}

function buildAmcLink(title, zip) {
  const q = encodeURIComponent(title);
  return zip
    ? `https://www.amctheatres.com/showtimes/${q}?zip=${encodeURIComponent(zip)}`
    : `https://www.amctheatres.com/movie-theatres?q=${q}`;
}

function buildRegalLink(title, zip) {
  const q = encodeURIComponent(title);
  return `https://www.regmovies.com/movies/${q}${zip ? `?zip=${encodeURIComponent(zip)}` : ""}`;
}

function buildBelcourtLink(title) {
  return `https://www.belcourt.org/?s=${encodeURIComponent(title)}`;
}

function buildBalthazarLink(title) {
  return `https://www.google.com/search?q=${encodeURIComponent("Hero Balthazar " + title + " showtimes")}`;
}

function buildRedditLink(title, year) {
  const q = `${title}${year ? " " + year : ""} official discussion`;
  return `https://www.reddit.com/r/movies/search/?q=${encodeURIComponent(q)}&restrict_sr=1&sort=relevance`;
}

/* ---------------------------------------------------------
   TMDB API
--------------------------------------------------------- */

function makeTmdb(apiKey) {
  async function call(path, params = {}) {
    if (!apiKey) throw new Error("No TMDB key set");
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    url.searchParams.set("api_key", apiKey);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    return res.json();
  }
  return {
    trendingWeek: () => call("/trending/all/week"),
    popularMovies: (page = 1) => call("/movie/popular", { page }),
    popularTv: (page = 1) => call("/tv/popular", { page }),
    topRatedMovies: (page = 1) => call("/movie/top_rated", { page }),
    topRatedTv: (page = 1) => call("/tv/top_rated", { page }),
    nowPlaying: (page = 1, region = "US") => call("/movie/now_playing", { page, region }),
    upcoming: (page = 1, region = "US") => call("/movie/upcoming", { page, region }),
    onTheAir: (page = 1) => call("/tv/on_the_air", { page }),
    discoverMovie: (params) => call("/discover/movie", params),
    discoverTv: (params) => call("/discover/tv", params),
    searchMulti: (query) => call("/search/multi", { query }),
    watchProviders: (mediaType, id) => call(`/${mediaType}/${id}/watch/providers`),
    details: (mediaType, id) => call(`/${mediaType}/${id}`),
    detailsFull: (mediaType, id) =>
      call(`/${mediaType}/${id}`, { append_to_response: "credits" })
  };
}

function normalize(item) {
  const mediaType = item.media_type === "tv" || item.first_air_date ? "tv" : "movie";
  return {
    tmdbId: item.id,
    mediaType,
    title: item.title || item.name || "Untitled",
    year: (item.release_date || item.first_air_date || "").slice(0, 4),
    posterPath: item.poster_path || null,
    genreIds: item.genre_ids || []
  };
}

/* ---------------------------------------------------------
   TASTE ENGINE
   weighted scoring from ratings + swipe feedback.
   genres come free on every item; people (cast/director/
   writer) come from credits we cache as you collect things.
--------------------------------------------------------- */

function buildTasteProfile(collection, feedback) {
  const weights = {};
  const bump = (genreIds, amount) => {
    (genreIds || []).forEach((g) => {
      weights[g] = (weights[g] || 0) + amount;
    });
  };
  collection.forEach((t) => {
    const lastRating = t.viewings.length ? t.viewings[t.viewings.length - 1].rating : 0;
    const amount = (lastRating - 2.5) * 2; // -5..+5
    bump(t.genreIds, amount);
  });
  (feedback.wantedIds || []).forEach((w) => bump(w.genreIds, 1.5));
  (feedback.skippedIds || []).forEach((s) => bump(s.genreIds, -1.5));
  return weights;
}

/* builds weighted maps of the people you gravitate toward,
   pulled from the credits cached on collected tickets */
function buildPeopleProfile(collection) {
  const directors = {};
  const writers = {};
  const actors = {};
  const add = (map, person, amount) => {
    if (!person || !person.id) return;
    if (!map[person.id]) map[person.id] = { id: person.id, name: person.name, score: 0 };
    map[person.id].score += amount;
  };
  collection.forEach((t) => {
    if (!t.credits) return;
    const lastRating = t.viewings.length ? t.viewings[t.viewings.length - 1].rating : 2.5;
    const amount = lastRating - 2; // 0.5..3
    (t.credits.directors || []).forEach((p) => add(directors, p, amount));
    (t.credits.writers || []).forEach((p) => add(writers, p, amount * 0.8));
    (t.credits.cast || []).slice(0, 5).forEach((p) => add(actors, p, amount * 0.5));
  });
  const top = (map) => Object.values(map).sort((a, b) => b.score - a.score);
  return { directors: top(directors), writers: top(writers), actors: top(actors) };
}

/* condense a full TMDB credits payload into just what we store */
function slimCredits(credits) {
  if (!credits) return null;
  const crew = credits.crew || [];
  const directors = crew.filter((c) => c.job === "Director").map((c) => ({ id: c.id, name: c.name }));
  const writers = crew
    .filter((c) => c.department === "Writing" || c.job === "Writer" || c.job === "Screenplay")
    .map((c) => ({ id: c.id, name: c.name }));
  const producers = crew.filter((c) => c.job === "Producer").map((c) => ({ id: c.id, name: c.name }));
  const cast = (credits.cast || []).slice(0, 8).map((c) => ({ id: c.id, name: c.name, character: c.character }));
  return { directors, writers, producers, cast };
}

function scoreItem(item, tasteWeights) {
  if (!item.genreIds || !item.genreIds.length) return 0;
  const total = item.genreIds.reduce((sum, g) => sum + (tasteWeights[g] || 0), 0);
  return total / item.genreIds.length;
}

/* 0..100 match percentage, normalized against the strongest
   genre signal you've got so the number means something */
function matchPercent(item, tasteWeights) {
  const keys = Object.keys(tasteWeights);
  if (!keys.length || !item.genreIds || !item.genreIds.length) return null;
  const maxAbs = Math.max(...keys.map((k) => Math.abs(tasteWeights[k])), 1);
  const raw = scoreItem(item, tasteWeights); // roughly -max..+max
  const norm = (raw / maxAbs + 1) / 2; // 0..1
  return Math.max(1, Math.min(99, Math.round(norm * 100)));
}

/* enough signal to start trusting the percentages */
function hasEnoughTaste(collection, feedback) {
  const rated = collection.filter((c) => c.viewings.some((v) => v.rating)).length;
  const swipes = (feedback.wantedIds || []).length + (feedback.skippedIds || []).length;
  return rated + Math.floor(swipes / 3) >= 5;
}

/* smart badges: surface why something is being recommended,
   tied to the specific people/genres you've rated highly */
function badgesFor(item, people, tasteWeights) {
  const out = [];
  const dirNames = new Set((people.directors || []).slice(0, 8).map((d) => d.id));
  const actNames = new Set((people.actors || []).slice(0, 12).map((a) => a.id));
  if (item.credits) {
    if ((item.credits.directors || []).some((d) => dirNames.has(d.id))) {
      const d = item.credits.directors.find((x) => dirNames.has(x.id));
      out.push({ kind: "director", text: `From ${d.name}` });
    }
    const sharedActor = (item.credits.cast || []).find((c) => actNames.has(c.id));
    if (sharedActor) out.push({ kind: "actor", text: `Stars ${sharedActor.name}` });
  }
  if (tasteWeights && item.genreIds) {
    const topGenre = item.genreIds
      .map((g) => ({ g, w: tasteWeights[g] || 0 }))
      .sort((a, b) => b.w - a.w)[0];
    if (topGenre && topGenre.w > 4) {
      const name = MOVIE_GENRES[topGenre.g] || TV_GENRES[topGenre.g];
      if (name) out.push({ kind: "genre", text: `Your kind of ${name}` });
    }
  }
  return out.slice(0, 2);
}

/* ---------------------------------------------------------
   STARS
--------------------------------------------------------- */

function Stars({ value = 0, onChange, size = 18 }) {
  const slots = [1, 2, 3, 4, 5];
  return (
    <div className="stars" style={{ height: size }}>
      {slots.map((n) => {
        const clip =
          value >= n ? "inset(0 0 0 0)" : value >= n - 0.5 ? "inset(0 50% 0 0)" : "inset(0 100% 0 0)";
        return (
          <div className="star-slot" key={n} style={{ width: size, height: size }}>
            <Star className="star-bg" size={size} strokeWidth={1.5} />
            <div className="star-fill" style={{ clipPath: clip }}>
              <Star className="star-fg" size={size} fill="currentColor" strokeWidth={1.5} />
            </div>
            {onChange && (
              <>
                <button
                  type="button"
                  className="star-hit star-hit-left"
                  aria-label={`Rate ${n - 0.5} of 5`}
                  onClick={() => onChange(n - 0.5)}
                />
                <button
                  type="button"
                  className="star-hit star-hit-right"
                  aria-label={`Rate ${n} of 5`}
                  onClick={() => onChange(n)}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------
   GENERIC MODAL SHELL
--------------------------------------------------------- */

function Modal({ onClose, children, wide }) {
  return (
    <div className="modal-veil" onClick={onClose}>
      <div className={"modal-card" + (wide ? " modal-wide" : "")} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   DETAIL MODAL
   full info for any title: synopsis, cast, director,
   producer, release date, plus the recommendation badges
--------------------------------------------------------- */

function DetailModal({ item, tmdb, badges, settings, onClose, onAddToWatchlist, onLogNew, redditAfter }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [logging, setLogging] = useState(false);
  const { imdb, providers } = useExtraInfo(item, settings || {}, tmdb);

  useEffect(() => {
    let active = true;
    async function run() {
      try {
        const full = await tmdb.detailsFull(item.mediaType, item.tmdbId);
        if (active) setData(full);
      } catch (e) {
        if (active) setErr(e.message);
      }
      if (active) setLoading(false);
    }
    run();
    return () => { active = false; };
  }, [item.tmdbId, item.mediaType]);

  const slim = data ? slimCredits(data.credits) : null;
  const director = slim && slim.directors[0];
  const producer = slim && slim.producers[0];
  const release = data ? (data.release_date || data.first_air_date || "") : item.year;
  const runtime = data ? (data.runtime || (data.episode_run_time && data.episode_run_time[0])) : null;

  return (
    <Modal onClose={onClose} wide>
      <div className="detail-modal">
        <div className="detail-head">
          {item.posterPath ? (
            <img src={tmdbImg(item.posterPath, "w342")} alt="" className="detail-head-poster" />
          ) : (
            <div className="detail-head-poster detail-poster-fallback">
              {item.mediaType === "tv" ? <Tv size={36} /> : <Film size={36} />}
            </div>
          )}
          <div className="detail-head-info">
            <h2 className="detail-title">{item.title}</h2>
            <div className="detail-genres">
              {genreNames(item.genreIds, item.mediaType).join(" · ") || (item.mediaType === "tv" ? "TV" : "Film")}
            </div>
            {imdb && <div className="detail-imdb"><span className="imdb-badge">{imdb} IMDb</span></div>}
            {badges && badges.length > 0 && (
              <div className="badge-row">
                {badges.map((b, i) => (
                  <span key={i} className={"badge badge-" + b.kind}>{b.text}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading && <div className="detail-loading"><RefreshCw size={20} className="spin" /> Loading details</div>}
        {err && <div className="detail-loading">Couldn't load full details ({err}).</div>}

        {data && (
          <div className="detail-body">
            {data.overview && <p className="detail-overview">{data.overview}</p>}
            <div className="detail-facts">
              {release && <div><span>Release</span>{formatDate(release.slice(0, 10)) || release}</div>}
              {runtime ? <div><span>Runtime</span>{runtime} min</div> : null}
              {director && <div><span>Director</span>{director.name}</div>}
              {producer && <div><span>Producer</span>{producer.name}</div>}
              {data.vote_average ? <div><span>TMDB</span>{data.vote_average.toFixed(1)} / 10</div> : null}
            </div>
            {slim && slim.cast.length > 0 && (
              <div className="detail-cast">
                <div className="detail-cast-label">Cast</div>
                <div className="detail-cast-list">
                  {slim.cast.slice(0, 6).map((c) => (
                    <span key={c.id} className="cast-chip">{c.name}</span>
                  ))}
                </div>
              </div>
            )}
            {providers && (
              <div className="detail-cast">
                <div className="detail-cast-label">Where to watch</div>
                <div className="suggest-links">
                  {providers.names.map((name) => (
                    <a key={name} className="link-pill link-pill-stream" href={providers.link} target="_blank" rel="noreferrer">{name}</a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="detail-actions">
          {onAddToWatchlist && (
            <button className="btn btn-outline btn-sm" onClick={() => { onAddToWatchlist(item); onClose(); }}>
              <Eye size={14} /> Want to see
            </button>
          )}
          {onLogNew && (
            <button className="btn btn-primary btn-sm" onClick={() => setLogging(true)}>
              <Check size={14} /> Seen it
            </button>
          )}
          <a className="btn btn-outline btn-sm" href={buildRedditLink(item.title, item.year)} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Reddit
          </a>
        </div>

        {logging && (
          <Modal onClose={() => setLogging(false)}>
            <h3 className="modal-title">{item.title}</h3>
            <LogForm
              saveLabel="Add to collection"
              onCancel={() => setLogging(false)}
              onSave={(entry) => {
                onLogNew(item, entry, slim);
                setLogging(false);
                onClose();
              }}
            />
          </Modal>
        )}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------
   LOG FORM, used for first viewing, rewatch, and edits
--------------------------------------------------------- */

const WHERE_PRESETS = ["AMC", "Regal", "Belcourt", "Home", "Plane", "Other"];

function LogForm({ initial, onSave, onCancel, saveLabel }) {
  const [date, setDate] = useState(initial?.date || todayISO());
  const initLoc = initial?.location || "";
  const isPreset = WHERE_PRESETS.includes(initLoc);
  const [location, setLocation] = useState(initLoc);
  const [selectedPreset, setSelectedPreset] = useState(isPreset ? initLoc : (initLoc ? "Other" : ""));
  const [customLoc, setCustomLoc] = useState(!isPreset ? initLoc : "");
  const [rating, setRating] = useState(initial?.rating ?? 4);
  const [notes, setNotes] = useState(initial?.notes || "");

  function pickPreset(p) {
    setSelectedPreset(p);
    if (p !== "Other") setLocation(p);
    else setLocation(customLoc);
  }

  return (
    <div className="log-form">
      <label className="field-label">Date watched</label>
      <input className="field-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      <label className="field-label">Where</label>
      <div className="where-presets">
        {WHERE_PRESETS.map((p) => (
          <button
            key={p} type="button"
            className={"where-chip" + (selectedPreset === p ? " where-chip-active" : "")}
            onClick={() => pickPreset(p)}
          >{p}</button>
        ))}
      </div>
      {selectedPreset === "Other" && (
        <input
          className="field-input"
          style={{ marginTop: 8 }}
          type="text"
          placeholder="Where did you watch it?"
          value={customLoc}
          onChange={(e) => { setCustomLoc(e.target.value); setLocation(e.target.value); }}
        />
      )}

      <label className="field-label">Your rating</label>
      <Stars value={rating} onChange={setRating} size={28} />

      <label className="field-label">Notes</label>
      <textarea
        className="field-input field-textarea"
        placeholder="First reaction, what stuck with you, anything you want future-you to remember..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button
          className="btn btn-primary"
          onClick={() => onSave({ id: initial?.id || uid(), date, location, rating, notes, loggedAt: Date.now() })}
        >
          {saveLabel || "Save"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   TICKET STUB, the collectible card
--------------------------------------------------------- */

function TicketStub({ ticket, onOpen }) {
  const last = ticket.viewings[ticket.viewings.length - 1];
  return (
    <button className="stub" onClick={() => onOpen(ticket)}>
      <div className="stub-poster">
        {ticket.posterPath ? (
          <img src={tmdbImg(ticket.posterPath, "w342")} alt="" loading="lazy" />
        ) : (
          <div className="stub-poster-fallback">
            {ticket.mediaType === "tv" ? <Tv size={28} /> : <Film size={28} />}
          </div>
        )}
        <div className="stub-perf" />
        {ticket.viewings.length > 1 && (
          <div className="stub-rewatch-badge">{ticket.viewings.length}×</div>
        )}
      </div>
      <div className="stub-tab">
        <div className="stub-title">{ticket.title}</div>
        <Stars value={last.rating} size={13} />
      </div>
      <span className="stub-shine" />
    </button>
  );
}

/* ---------------------------------------------------------
   TICKET DETAIL, flip card with history, edit, undo
--------------------------------------------------------- */

function TicketDetail({ ticket, onClose, onUpdate, onDelete }) {
  const [flipped, setFlipped] = useState(true);
  const [editingViewingId, setEditingViewingId] = useState(null);
  const [logging, setLogging] = useState(false);

  function pushHistory(t) {
    const snap = JSON.parse(JSON.stringify({ viewings: t.viewings, log: t.log }));
    const history = [...(t.history || []), snap].slice(-8);
    return history;
  }

  function withLog(t, text) {
    return { ...t, log: [...(t.log || []), { at: Date.now(), text }] };
  }

  function handleSaveViewing(entry) {
    let t = { ...ticket, history: pushHistory(ticket) };
    const exists = t.viewings.find((v) => v.id === entry.id);
    if (exists) {
      t.viewings = t.viewings.map((v) => (v.id === entry.id ? entry : v));
      t = withLog(t, `Edited the ${formatDate(entry.date)} entry`);
    } else {
      t.viewings = [...t.viewings, entry];
      t = withLog(t, `Logged a rewatch on ${formatDate(entry.date)}`);
    }
    onUpdate(t);
    setEditingViewingId(null);
    setLogging(false);
  }

  function handleRemoveViewing(id) {
    if (ticket.viewings.length <= 1) return;
    let t = { ...ticket, history: pushHistory(ticket) };
    t.viewings = t.viewings.filter((v) => v.id !== id);
    t = withLog(t, "Removed a viewing entry");
    onUpdate(t);
  }

  function handleUndo() {
    if (!ticket.history || !ticket.history.length) return;
    const prev = ticket.history[ticket.history.length - 1];
    const t = {
      ...ticket,
      viewings: prev.viewings,
      log: [...prev.log, { at: Date.now(), text: "Undid the last change" }],
      history: ticket.history.slice(0, -1)
    };
    onUpdate(t);
  }

  const editingViewing = editingViewingId ? ticket.viewings.find((v) => v.id === editingViewingId) : null;

  return (
    <Modal onClose={onClose} wide>
      <div className="ticket-detail">
        <div className={"flip-stage" + (flipped ? " is-flipped" : "")}>
          <div className="flip-front">
            {ticket.posterPath ? (
              <img src={tmdbImg(ticket.posterPath, "w500")} alt="" className="detail-poster" />
            ) : (
              <div className="detail-poster detail-poster-fallback">
                {ticket.mediaType === "tv" ? <Tv size={48} /> : <Film size={48} />}
              </div>
            )}
            <button className="btn btn-ghost flip-hint" onClick={() => setFlipped(true)}>
              Back to details <ChevronRight size={14} />
            </button>
          </div>
          <div className="flip-back">
            <button className="btn btn-ghost flip-hint flip-hint-back" onClick={() => setFlipped(false)}>
              <ChevronLeft size={14} /> View poster
            </button>

            <h2 className="detail-title">{ticket.title}</h2>
            <div className="detail-genres">
              {genreNames(ticket.genreIds, ticket.mediaType).join(" · ") || (ticket.mediaType === "tv" ? "TV" : "Film")}
            </div>

            <div className="detail-toolbar">
              <button
                className="btn btn-outline btn-sm"
                disabled={!ticket.history || !ticket.history.length}
                onClick={handleUndo}
              >
                <Undo2 size={14} /> Undo last change
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setLogging(true)}>
                <Plus size={14} /> Log a rewatch
              </button>
              <button className="btn btn-outline btn-sm btn-danger" onClick={() => onDelete(ticket.id)}>
                <Trash2 size={14} /> Remove ticket
              </button>
            </div>

            <div className="viewing-list">
              {ticket.viewings
                .slice()
                .sort((a, b) => (a.date < b.date ? 1 : -1))
                .map((v) => (
                  <div className="viewing-row" key={v.id}>
                    {editingViewingId === v.id ? (
                      <LogForm
                        initial={v}
                        saveLabel="Save changes"
                        onSave={handleSaveViewing}
                        onCancel={() => setEditingViewingId(null)}
                      />
                    ) : (
                      <>
                        <div className="viewing-top">
                          <div className="viewing-date">{formatDate(v.date)}</div>
                          <Stars value={v.rating} size={14} />
                        </div>
                        {v.location && (
                          <div className="viewing-loc">
                            <MapPin size={12} /> {v.location}
                          </div>
                        )}
                        {v.notes && <div className="viewing-notes">{v.notes}</div>}
                        <div className="viewing-actions">
                          <button className="icon-btn" onClick={() => setEditingViewingId(v.id)} aria-label="Edit">
                            <Pencil size={13} />
                          </button>
                          {ticket.viewings.length > 1 && (
                            <button
                              className="icon-btn"
                              onClick={() => handleRemoveViewing(v.id)}
                              aria-label="Remove this entry"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}

              {logging && (
                <div className="viewing-row viewing-row-new">
                  <div className="field-label" style={{ marginTop: 0 }}>New viewing</div>
                  <LogForm saveLabel="Add to ticket" onSave={handleSaveViewing} onCancel={() => setLogging(false)} />
                </div>
              )}
            </div>

            {!!(ticket.log && ticket.log.length) && (
              <details className="edit-log">
                <summary>Edit history ({ticket.log.length})</summary>
                {ticket.log
                  .slice()
                  .reverse()
                  .map((l, i) => (
                    <div className="edit-log-row" key={i}>
                      <span>{l.text}</span>
                      <span className="edit-log-time">{new Date(l.at).toLocaleString()}</span>
                    </div>
                  ))}
              </details>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------
   TICKET SCANNER
   reads an AMC / Regal screenshot with OCR, guesses the
   title + date, finds it on TMDB, prefills the log form.
   OCR is best effort: you can always correct before saving.
--------------------------------------------------------- */

function TicketScanner({ tmdb, onClose, onLogNew }) {
  const [stage, setStage] = useState("upload"); // upload | reading | confirm | manual | error
  const [statusText, setStatusText] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [guessedDate, setGuessedDate] = useState(todayISO());
  const [manualQuery, setManualQuery] = useState("");
  const [manualSearching, setManualSearching] = useState(false);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setStage("reading");
    setStatusText("Reading ticket with AI...");
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const mimeType = file.type || "image/jpeg";
      const data = await callProxy({
        model: "claude-haiku-4-5",
        max_tokens: 150,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
            { type: "text", text: 'This is a movie ticket or purchase confirmation. Extract the movie title and the date of the screening or purchase. Reply with only valid JSON: {"title": "movie title here", "date": "YYYY-MM-DD"}. Use null if you cannot find the field.' }
          ]
        }]
      });
      const text = data.content?.[0]?.text?.trim() || "";
      let parsed = {};
      try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch { /* ignore parse error, use fallback */ }

      const date = parsed.date || todayISO();
      setGuessedDate(date);
      const title = parsed.title;
      if (!title) { setStage("manual"); return; }
      setStatusText("Matching to a movie...");
      const res = await tmdb.searchMulti(title);
      const hits = (res.results || []).filter((r) => r.media_type === "movie" || r.media_type === "tv").map(normalize);
      setCandidates(hits.slice(0, 5));
      setChosen(hits[0] || null);
      setStage("confirm");
    } catch (err) {
      setStatusText(err.message || "Scan failed");
      setStage("manual");
    }
  }

  async function runManualSearch(q) {
    if (!q.trim()) return;
    setManualSearching(true);
    try {
      const res = await tmdb.searchMulti(q.trim());
      const hits = (res.results || []).filter((r) => r.media_type === "movie" || r.media_type === "tv").map(normalize);
      setCandidates(hits.slice(0, 6));
      setChosen(hits[0] || null);
      setStage("confirm");
    } catch { /* ignore */ }
    setManualSearching(false);
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="modal-title">Add from ticket</h3>

      {stage === "upload" && (
        <div>
          <p className="sync-note">Upload a screenshot of your AMC or Regal confirmation — AI will read the title and date.</p>
          <button className="btn btn-primary" style={{ width: "100%", marginTop: 12 }} onClick={() => fileRef.current && fileRef.current.click()}>
            <Camera size={16} /> Choose screenshot
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
          <button className="btn btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => setStage("manual")}>
            Type the title instead
          </button>
        </div>
      )}

      {stage === "reading" && (
        <div className="detail-loading"><RefreshCw size={20} className="spin" /> {statusText}</div>
      )}

      {stage === "manual" && (
        <div>
          {statusText && <p className="sync-note" style={{ marginBottom: 10 }}>Couldn't read the screenshot automatically. Search for the title below.</p>}
          <div className="search-bar" style={{ marginBottom: 10 }}>
            <Search size={15} />
            <input
              className="search-input"
              placeholder="Type movie title..."
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runManualSearch(manualQuery)}
              autoFocus
            />
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={manualSearching || !manualQuery.trim()} onClick={() => runManualSearch(manualQuery)}>
            {manualSearching ? <RefreshCw size={14} className="spin" /> : <Search size={14} />} Search
          </button>
        </div>
      )}

      {stage === "confirm" && (
        <div>
          {candidates.length > 0 ? (
            <>
              <label className="field-label">Which movie?</label>
              <div className="scan-candidates">
                {candidates.map((c) => (
                  <button
                    key={c.tmdbId + c.mediaType}
                    className={"scan-cand" + (chosen && chosen.tmdbId === c.tmdbId ? " scan-cand-active" : "")}
                    onClick={() => setChosen(c)}
                  >
                    {c.posterPath ? <img src={tmdbImg(c.posterPath, "w92")} alt="" /> : <div className="scan-cand-fallback"><Film size={16} /></div>}
                    <span>{c.title} {c.year ? `(${c.year})` : ""}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="sync-note">No results. Try a different title.</p>
          )}

          <label className="field-label">Date watched</label>
          <input className="field-input" type="date" value={guessedDate} onChange={(e) => setGuessedDate(e.target.value)} />

          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setStage("upload")}>Back</button>
            <button
              className="btn btn-primary"
              disabled={!chosen}
              onClick={() => {
                if (!chosen) return;
                onLogNew(chosen, { id: uid(), date: guessedDate, location: "", rating: 4, notes: "", loggedAt: Date.now() });
                onClose();
              }}
            >
              <Check size={14} /> Add to collection
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------
   COLLECTION TAB
--------------------------------------------------------- */

function CollectionView({ collection, watchlist, tmdb, taste, settings, people, onUpdateTicket, onDeleteTicket, onLogFromWatchlist, onAddToWatchlist, onLogNew, onRemoveFromWatchlist }) {
  const [open, setOpen] = useState(null);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [detail, setDetail] = useState(null);
  const [sort, setSort] = useState("recent");
  const [genreFilter, setGenreFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [searching, setSearching] = useState(false);

  const genreOptions = useMemo(() => {
    const ids = new Set();
    collection.forEach((c) => (c.genreIds || []).forEach((g) => ids.add(g)));
    return Array.from(ids)
      .map((id) => ({ id, name: MOVIE_GENRES[id] || TV_GENRES[id] }))
      .filter((x) => x.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [collection]);

  const visibleCollection = useMemo(() => {
    let list = collection.slice();
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((c) => c.title.toLowerCase().includes(q));
    }
    if (genreFilter !== "all") {
      list = list.filter((c) => (c.genreIds || []).includes(Number(genreFilter)));
    }
    const lastDate = (t) => t.viewings[t.viewings.length - 1].date;
    const lastRating = (t) => t.viewings[t.viewings.length - 1].rating || 0;
    list.sort((a, b) => {
      if (sort === "recent") return lastDate(a) < lastDate(b) ? 1 : -1;
      if (sort === "oldest") return lastDate(a) > lastDate(b) ? 1 : -1;
      if (sort === "highest") return lastRating(b) - lastRating(a);
      if (sort === "lowest") return lastRating(a) - lastRating(b);
      return 0;
    });
    return list;
  }, [collection, query, genreFilter, sort]);

  if (open) {
    return (
      <TicketDetail
        ticket={open}
        onClose={() => setOpen(null)}
        onUpdate={(t) => { onUpdateTicket(t); setOpen(t); }}
        onDelete={(id) => { onDeleteTicket(id); setOpen(null); }}
      />
    );
  }

  const showControls = collection.length >= 4 || searching;

  return (
    <div className="view">
      {detail && (
        <DetailModal
          item={detail}
          tmdb={tmdb}
          badges={[]}
          settings={settings}
          onClose={() => setDetail(null)}
          onAddToWatchlist={null}
          onLogNew={(it, entry, credits) => { onLogNew(it, entry, credits); onRemoveFromWatchlist(it); }}
        />
      )}

      {scanning && (
        <TicketScanner
          tmdb={tmdb}
          onClose={() => setScanning(false)}
          onLogNew={(it, entry) => { onLogNew(it, entry); }}
        />
      )}

      {showFavorites && (
        <Modal onClose={() => setShowFavorites(false)} wide>
          <h3 className="modal-title">Favorites</h3>
          <FavoritesView collection={collection} people={people} tmdb={tmdb} onUpdateTicket={onUpdateTicket} />
        </Modal>
      )}

      <div className="collection-header-row">
        <div className="view-toggle" style={{ flex: 1, margin: 0 }}>
          <button className={!showWatchlist ? "toggle-pill active" : "toggle-pill"} onClick={() => setShowWatchlist(false)}>
            Collected ({collection.length})
          </button>
          <button className={showWatchlist ? "toggle-pill active" : "toggle-pill"} onClick={() => setShowWatchlist(true)}>
            Want to see ({watchlist.length})
          </button>
        </div>
        <button className="icon-btn" onClick={() => setShowFavorites(true)} aria-label="Favorites">
          <Heart size={17} />
        </button>
      </div>

      <div className="collection-actions">
        <button className="collection-action-btn" onClick={() => setScanning(true)}>
          <Camera size={20} />
          <span>Scan ticket</span>
        </button>
        <button className="collection-action-btn" onClick={() => setSearching(true)}>
          <Search size={20} />
          <span>Search</span>
        </button>
      </div>

      {!showWatchlist && (
        collection.length === 0 ? (
          <EmptyState
            icon={<Ticket size={32} />}
            title="Your binder is empty"
            body="Log the next thing you watch and it'll show up here as a ticket stub you can flip open any time."
          />
        ) : (
          <>
            {showControls && (
              <div className="collection-controls">
                <div className="search-bar collection-search">
                  <Search size={15} />
                  <input
                    className="search-input"
                    placeholder="Search your collection"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="filter-row">
                  <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="recent">Recently collected</option>
                    <option value="oldest">Oldest first</option>
                    <option value="highest">Highest rated</option>
                    <option value="lowest">Lowest rated</option>
                  </select>
                  <select className="filter-select" value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
                    <option value="all">All genres</option>
                    {genreOptions.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {visibleCollection.length === 0 ? (
              <EmptyState icon={<Search size={28} />} title="No matches" body="Nothing in your collection fits that filter." />
            ) : (
              <div className="stub-grid stub-grid-compact">
                {visibleCollection.map((t) => (
                  <TicketStub ticket={t} key={t.id} onOpen={setOpen} />
                ))}
              </div>
            )}
          </>
        )
      )}

      {showWatchlist && (
        watchlist.length === 0 ? (
          <EmptyState
            icon={<Heart size={32} />}
            title="Nothing saved yet"
            body="Swipe right on something in Discover, or add it from Search, and it'll wait here until you've watched it."
          />
        ) : (
          <div className="watchlist-rows">
            {watchlist.map((w) => (
              <div className="watch-row" key={w.tmdbId + w.mediaType}>
                <button className="watch-tap" onClick={() => setDetail(w)} aria-label={`Details for ${w.title}`}>
                  {w.posterPath ? (
                    <img src={tmdbImg(w.posterPath, "w154")} alt="" className="watch-thumb" />
                  ) : (
                    <div className="watch-thumb watch-thumb-fallback">
                      {w.mediaType === "tv" ? <Tv size={18} /> : <Film size={18} />}
                    </div>
                  )}
                  <div className="watch-info">
                    <div className="watch-title">{w.title}</div>
                    <div className="watch-sub">{w.year} · tap for details</div>
                  </div>
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => onLogFromWatchlist(w)}>
                  <Check size={14} /> Watched
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function EmptyState({ icon, title, body }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      <div className="empty-body">{body}</div>
    </div>
  );
}

/* ---------------------------------------------------------
   DISCOVER TAB, swipe deck
--------------------------------------------------------- */

function SwipeCard({ item, matchPct, onSkip, onWant, onSeen, onSwipeRight, onTapInfo }) {
  const [drag, setDrag] = useState({ x: 0, active: false });
  const startX = useRef(0);
  const moved = useRef(false);

  function down(e) {
    startX.current = e.touches ? e.touches[0].clientX : e.clientX;
    moved.current = false;
    setDrag({ x: 0, active: true });
  }
  function move(e) {
    if (!drag.active) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - startX.current;
    if (Math.abs(x) > 6) moved.current = true;
    setDrag({ x, active: true });
  }
  function up() {
    if (drag.x > 100) onSwipeRight();
    else if (drag.x < -100) onSkip();
    setDrag({ x: 0, active: false });
  }

  const rotate = drag.x / 18;

  return (
    <div
      className="swipe-card"
      style={{ transform: `translateX(${drag.x}px) rotate(${rotate}deg)` }}
      onMouseDown={down}
      onMouseMove={move}
      onMouseUp={up}
      onMouseLeave={() => drag.active && up()}
      onTouchStart={down}
      onTouchMove={move}
      onTouchEnd={up}
    >
      {drag.x > 40 && <div className="swipe-flag swipe-flag-want">SAVE IT</div>}
      {drag.x < -40 && <div className="swipe-flag swipe-flag-skip">SKIP</div>}
      {matchPct != null && (
        <div className={"match-badge " + (matchPct >= 70 ? "match-high" : matchPct >= 40 ? "match-mid" : "match-low")}>
          {matchPct}% match
        </div>
      )}
      <button
        className="swipe-poster-btn"
        onClick={() => { if (!moved.current) onTapInfo(); }}
        aria-label="More info"
      >
        {item.posterPath ? (
          <img src={tmdbImg(item.posterPath, "w500")} alt="" className="swipe-poster" draggable={false} />
        ) : (
          <div className="swipe-poster swipe-poster-fallback">
            {item.mediaType === "tv" ? <Tv size={40} /> : <Film size={40} />}
          </div>
        )}
        <span className="swipe-info-hint"><Info size={13} /> Tap for info</span>
      </button>
      <div className="swipe-meta">
        <div className="swipe-title">{item.title} {item.year ? `(${item.year})` : ""}</div>
        <div className="swipe-genres">{genreNames(item.genreIds, item.mediaType).slice(0, 3).join(" · ") || (item.mediaType === "tv" ? "TV series" : "Film")}</div>
      </div>
      <div className="swipe-buttons">
        <button className="round-btn round-btn-skip" onClick={onSkip} aria-label="Skip">
          <SkipForward size={20} />
        </button>
        <button className="round-btn round-btn-seen" onClick={onSeen} aria-label="Already seen it">
          <Eye size={26} />
        </button>
        <button className="round-btn round-btn-want" onClick={onWant} aria-label="Save to want-to-see">
          <Bookmark size={20} />
        </button>
      </div>
    </div>
  );
}

function DiscoverView({ tmdb, feedback, setFeedback, taste, people, settings, collection, watchlist, onAddToWatchlist, onLogNew }) {
  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingLog, setPendingLog] = useState(null);
  const [infoItem, setInfoItem] = useState(null);
  const [swipeChoice, setSwipeChoice] = useState(null);
  const [mode, setMode] = useState("swipe");
  const [lastSkipped, setLastSkipped] = useState(null);

  const seenIdSet = useMemo(
    () => new Set([...feedback.skippedIds, ...feedback.wantedIds, ...feedback.seenIds].map((x) => x.tmdbId + x.mediaType)),
    [feedback]
  );
  const ownedSet = useMemo(
    () => new Set([...collection.map((c) => c.tmdbId + c.mediaType), ...watchlist.map((w) => w.tmdbId + w.mediaType)]),
    [collection, watchlist]
  );

  const loadPool = useCallback(async (includeSkipped = false) => {
    setLoading(true);
    setError(null);
    try {
      const topGenres = Object.entries(taste).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g).join(",");
      const calls = [
        tmdb.trendingWeek(),
        tmdb.popularMovies(1),
        tmdb.popularMovies(2),
        tmdb.popularTv(1),
        tmdb.topRatedMovies(1),
        tmdb.nowPlaying(1)
      ];
      if (topGenres) {
        calls.push(tmdb.discoverMovie({ with_genres: topGenres, sort_by: "popularity.desc", page: 1 }));
        calls.push(tmdb.discoverTv({ with_genres: topGenres, sort_by: "popularity.desc", page: 1 }));
      }
      const pages = await Promise.all(calls);
      const all = pages.flatMap((p) => p.results || []).map(normalize);
      const skipSet = includeSkipped
        ? new Set([...feedback.wantedIds, ...feedback.seenIds].map((x) => x.tmdbId + x.mediaType))
        : seenIdSet;
      const fresh = all.filter((a) => !skipSet.has(a.tmdbId + a.mediaType) && !ownedSet.has(a.tmdbId + a.mediaType));
      const dedup = Array.from(new Map(fresh.map((f) => [f.tmdbId + f.mediaType, f])).values());
      const scored = dedup.map((x) => ({ ...x, _pct: matchPercent(x, taste) }));
      // Shuffle with mild bias toward high match — avoids showing same movie on every refresh
      const shuffled = scored.sort((a, b) => {
        const bias = ((b._pct || 50) - (a._pct || 50)) * 0.3;
        return bias + (Math.random() - 0.5) * 100;
      });
      setPool(shuffled);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [tmdb, seenIdSet, ownedSet, taste, feedback]);

  useEffect(() => {
    loadPool();
    // eslint-disable-next-line
  }, []);

  function recordFeedback(bucket, item) {
    setFeedback((f) => ({ ...f, [bucket]: [...f[bucket], { tmdbId: item.tmdbId, mediaType: item.mediaType, genreIds: item.genreIds }] }));
  }

  function advance() { setPool((p) => p.slice(1)); }

  function skip(item) {
    recordFeedback("skippedIds", item);
    setLastSkipped(item);
    advance();
  }
  function undoSkip() {
    if (!lastSkipped) return;
    setFeedback((f) => ({
      ...f,
      skippedIds: f.skippedIds.filter((s) => !(s.tmdbId === lastSkipped.tmdbId && s.mediaType === lastSkipped.mediaType))
    }));
    setPool((p) => [lastSkipped, ...p]);
    setLastSkipped(null);
  }
  function want(item) {
    recordFeedback("wantedIds", item);
    onAddToWatchlist(item);
    advance();
  }
  function seen(item) {
    recordFeedback("seenIds", item);
    setPendingLog(item);
  }

  const enough = hasEnoughTaste(collection, feedback);
  const current = pool[0];

  return (
    <div className="view">
      <div className="view-toggle">
        <button className={mode === "swipe" ? "toggle-pill active" : "toggle-pill"} onClick={() => setMode("swipe")}>
          Swipe
        </button>
        <button className={mode === "list" ? "toggle-pill active" : "toggle-pill"} onClick={() => setMode("list")}>
          For you list
        </button>
      </div>

      {infoItem && (
        <DetailModal
          item={infoItem}
          tmdb={tmdb}
          badges={badgesFor(infoItem, people, taste)}
          settings={settings}
          onClose={() => setInfoItem(null)}
          onAddToWatchlist={(it) => { want(it); }}
          onLogNew={(it, entry, credits) => { onLogNew(it, entry, credits); recordFeedback("seenIds", it); advance(); }}
        />
      )}

      {swipeChoice && (
        <Modal onClose={() => setSwipeChoice(null)}>
          <h3 className="modal-title">{swipeChoice.title}</h3>
          <p className="sync-note" style={{ marginBottom: 18 }}>Have you already seen this, or do you want to watch it?</p>
          <div className="choice-grid">
            <button className="btn btn-outline" onClick={() => { want(swipeChoice); setSwipeChoice(null); }}>
              <Eye size={16} /> Want to watch
            </button>
            <button className="btn btn-primary" onClick={() => { const it = swipeChoice; setSwipeChoice(null); seen(it); }}>
              <Check size={16} /> Already seen it
            </button>
          </div>
        </Modal>
      )}

      {pendingLog && (
        <Modal onClose={() => setPendingLog(null)}>
          <h3 className="modal-title">{pendingLog.title}</h3>
          <LogForm
            saveLabel="Add to collection"
            onCancel={() => setPendingLog(null)}
            onSave={(entry) => { onLogNew(pendingLog, entry); setPendingLog(null); advance(); }}
          />
        </Modal>
      )}

      {mode === "swipe" && (
        <div className="view-discover">
          {loading && <EmptyState icon={<RefreshCw size={32} className="spin" />} title="Shuffling the deck" body="Pulling titles you haven't seen yet." />}
          {!loading && error && (
            <EmptyState icon={<Info size={32} />} title="Couldn't load new titles" body={`TMDB said: ${error}. Check your API key in settings, then tap refresh.`} />
          )}
          {!loading && !error && !current && (
            <EmptyState icon={<Sparkles size={32} />} title="That's everything for now" body="You've been through the pool. Refresh, or pull back skipped titles." />
          )}
          {!loading && current && (
            <div className="swipe-stack">
              <SwipeCard
                item={current}
                matchPct={enough ? current._pct : null}
                onSkip={() => skip(current)}
                onWant={() => want(current)}
                onSeen={() => seen(current)}
                onSwipeRight={() => setSwipeChoice(current)}
                onTapInfo={() => setInfoItem(current)}
              />
            </div>
          )}
          <div className="discover-foot">
            {lastSkipped && (
              <button className="btn btn-ghost btn-sm" onClick={undoSkip}>
                <Undo2 size={14} /> Bring back last skip
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => loadPool(false)}>
              <RefreshCw size={14} /> Refresh deck
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => loadPool(true)}>
              <Undo2 size={14} /> Replay skipped
            </button>
          </div>
        </div>
      )}

      {mode === "list" && (
        <>
          {!enough && (
            <div className="hint-banner">
              <Sparkles size={14} /> Rate a few films or swipe through and these match scores sharpen up.
            </div>
          )}
          {loading && <EmptyState icon={<RefreshCw size={32} className="spin" />} title="Reading your taste" body="Ranking titles against what you've rated." />}
          {!loading && !error && (
            <div className="suggest-list">
              {pool.slice(0, 25).map((item) => (
                <SuggestionRow
                  key={item.tmdbId + item.mediaType}
                  item={item}
                  matchPct={enough ? item._pct : null}
                  settings={settings}
                  tmdb={tmdb}
                  onAddToWatchlist={want}
                  onLogNew={onLogNew}
                  onInfo={() => setInfoItem(item)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   FOR YOU TAB
--------------------------------------------------------- */

/* ---------------------------------------------------------
   EXTRA INFO
   IMDb rating (via OMDb if a key is set) + real streaming
   availability (via TMDB watch/providers) for one title.
   Fails silently: these are nice to have, a missing key or
   an API miss should never block or clutter the row.
--------------------------------------------------------- */

function useExtraInfo(item, settings, tmdb) {
  const [imdb, setImdb] = useState(null);
  const [providers, setProviders] = useState(null);

  useEffect(() => {
    let active = true;

    if (settings.omdbKey) {
      const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(settings.omdbKey)}&t=${encodeURIComponent(item.title)}${item.year ? `&y=${item.year}` : ""}`;
      fetch(url)
        .then((r) => r.json())
        .then((d) => {
          if (active && d && d.imdbRating && d.imdbRating !== "N/A") setImdb(d.imdbRating);
        })
        .catch(() => {});
    }

    tmdb
      .watchProviders(item.mediaType, item.tmdbId)
      .then((d) => {
        if (!active) return;
        const region = (settings.country || "US").toUpperCase();
        const entry = d.results && d.results[region];
        if (entry && entry.flatrate && entry.flatrate.length) {
          setProviders({ names: entry.flatrate.slice(0, 3).map((p) => p.provider_name), link: entry.link });
        }
      })
      .catch(() => {});

    return () => { active = false; };
    // eslint-disable-next-line
  }, [item.tmdbId, item.mediaType, settings.omdbKey, settings.country]);

  return { imdb, providers };
}

function SuggestionRow({ item, matchPct, settings, tmdb, onAddToWatchlist, onLogNew, onInfo }) {
  const [logging, setLogging] = useState(false);
  const { imdb, providers } = useExtraInfo(item, settings, tmdb);

  return (
    <div className="suggest-row">
      <button className="suggest-thumb-btn" onClick={onInfo} aria-label={`Details for ${item.title}`}>
        {item.posterPath ? (
          <img src={tmdbImg(item.posterPath, "w154")} alt="" className="suggest-thumb" />
        ) : (
          <div className="suggest-thumb suggest-thumb-fallback">{item.mediaType === "tv" ? <Tv size={18} /> : <Film size={18} />}</div>
        )}
      </button>
      <div className="suggest-info">
        <div className="suggest-title-row">
          <button className="suggest-title-btn" onClick={onInfo}>{item.title} {item.year ? `· ${item.year}` : ""}</button>
          {imdb && <span className="imdb-badge">{imdb} IMDb</span>}
          {matchPct != null && <span className={"match-pill " + (matchPct >= 70 ? "match-high" : matchPct >= 40 ? "match-mid" : "match-low")}>{matchPct}%</span>}
        </div>
        <div className="suggest-genres">{genreNames(item.genreIds, item.mediaType).slice(0, 3).join(" · ")}</div>
        {providers && (
          <div className="suggest-links">
            {providers.names.map((name) => (
              <a key={name} className="link-pill link-pill-stream" href={providers.link} target="_blank" rel="noreferrer">{name}</a>
            ))}
          </div>
        )}
        <div className="suggest-links">
          <a className="link-pill" href={buildAmcLink(item.title, settings.zip)} target="_blank" rel="noreferrer">AMC</a>
          <a className="link-pill" href={buildRegalLink(item.title, settings.zip)} target="_blank" rel="noreferrer">Regal</a>
          <a className="link-pill" href={buildRedditLink(item.title, item.year)} target="_blank" rel="noreferrer">Reddit</a>
        </div>
      </div>
      <div className="suggest-actions">
        <button className="icon-btn" onClick={() => onAddToWatchlist(item)} aria-label="Want to see"><Eye size={16} /></button>
        <button className="icon-btn" onClick={() => setLogging(true)} aria-label="Seen it"><Check size={16} /></button>
      </div>
      {logging && (
        <Modal onClose={() => setLogging(false)}>
          <h3 className="modal-title">{item.title}</h3>
          <LogForm saveLabel="Add to collection" onCancel={() => setLogging(false)} onSave={(entry) => { onLogNew(item, entry); setLogging(false); }} />
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   FAVORITES TAB
   surfaces the people you gravitate toward, computed from the
   credits cached on the movies you've collected and rated
--------------------------------------------------------- */

function FavoritesView({ collection, people, tmdb, onUpdateTicket }) {
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const missingCredits = useMemo(
    () => collection.filter((c) => !c.credits),
    [collection]
  );

  async function enrich() {
    setEnriching(true);
    setProgress({ done: 0, total: missingCredits.length });
    for (let i = 0; i < missingCredits.length; i++) {
      const t = missingCredits[i];
      try {
        const full = await tmdb.detailsFull(t.mediaType, t.tmdbId);
        const slim = slimCredits(full.credits);
        onUpdateTicket({ ...t, credits: slim });
      } catch (e) {
        // skip ones that fail, keep going
      }
      setProgress({ done: i + 1, total: missingCredits.length });
    }
    setEnriching(false);
  }

  const topMovies = useMemo(
    () =>
      collection
        .map((c) => ({ ...c, rating: c.viewings[c.viewings.length - 1].rating || 0 }))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 6),
    [collection]
  );

  if (collection.length === 0) {
    return (
      <div className="view">
        <EmptyState
          icon={<Heart size={32} />}
          title="No favorites yet"
          body="Once you collect and rate a few films, this tab learns your go-to directors, writers, and actors."
        />
      </div>
    );
  }

  const Section = ({ title, list, suffix }) =>
    list && list.length > 0 ? (
      <div className="fav-section">
        <div className="fav-section-title">{title}</div>
        <div className="fav-chips">
          {list.slice(0, 8).map((p) => (
            <span key={p.id} className="fav-chip">{p.name}{suffix ? ` ${suffix}` : ""}</span>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="view">
      {topMovies.length > 0 && (
        <div className="fav-section">
          <div className="fav-section-title">Top rated in your collection</div>
          <div className="fav-poster-row">
            {topMovies.map((m) => (
              <div className="fav-poster" key={m.id}>
                {m.posterPath ? (
                  <img src={tmdbImg(m.posterPath, "w185")} alt={m.title} />
                ) : (
                  <div className="fav-poster-fallback">{m.mediaType === "tv" ? <Tv size={20} /> : <Film size={20} />}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(people.directors.length === 0 && people.actors.length === 0) && (
        <div className="hint-banner" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <span><Info size={14} /> To learn your favorite directors and actors, the app needs to pull credits for what you've collected.</span>
          {missingCredits.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={enrich} disabled={enriching}>
              {enriching ? `Scanning ${progress.done}/${progress.total}` : `Scan ${missingCredits.length} titles`}
            </button>
          )}
        </div>
      )}

      <Section title="Favorite directors" list={people.directors} />
      <Section title="Favorite writers" list={people.writers} />
      <Section title="Actors you keep watching" list={people.actors} />

      {(people.directors.length > 0 || people.actors.length > 0) && missingCredits.length > 0 && (
        <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={enrich} disabled={enriching}>
          {enriching ? `Scanning ${progress.done}/${progress.total}` : `Update from ${missingCredits.length} newer titles`}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   COMING SOON TAB
--------------------------------------------------------- */

function ComingSoonView({ tmdb, settings, taste, people, collection, feedback, onAddToWatchlist, onLogNew }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState({});
  const [window, setWindow] = useState("all");
  const [sort, setSort] = useState("soonest");
  const [infoItem, setInfoItem] = useState(null);

  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const region = (settings.country || "US").toUpperCase();
        const [p1, p2] = await Promise.all([tmdb.upcoming(1, region), tmdb.upcoming(2, region)]);
        const raw = [...(p1.results || []), ...(p2.results || [])];
        const sorted = raw
          .map((r) => ({ ...normalize(r), releaseDate: r.release_date, overview: r.overview }))
          .filter((x) => x.releaseDate)
          .filter((x, i, arr) => arr.findIndex((y) => y.tmdbId === x.tmdbId) === i)
          .sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : 1));
        if (active) setItems(sorted);
      } catch (e) {
        if (active) setError(e.message);
      }
      if (active) setLoading(false);
    }
    run();
    return () => { active = false; };
    // eslint-disable-next-line
  }, [settings.country]);

  function daysOut(dateStr) {
    const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
    if (diff <= 0) return "Out now";
    if (diff === 1) return "Tomorrow";
    if (diff <= 7) return `In ${diff} days`;
    return formatDate(dateStr);
  }

  function inWindow(dateStr) {
    const now = new Date();
    const d = new Date(dateStr);
    const days = Math.ceil((d - now) / 86400000);
    const thisYear = now.getFullYear();
    const yr = d.getFullYear();
    if (window === "all") return true;
    if (window === "week") return days >= 0 && days <= 7;
    if (window === "nextweek") return days > 7 && days <= 14;
    if (window === "month") return days >= 0 && days <= 31;
    if (window === "thisyear") return yr === thisYear;
    if (window === "nextyear") return yr === thisYear + 1;
    return true;
  }

  const enough = hasEnoughTaste(collection, feedback);

  const note = (item, pct) => {
    if (pct == null) return null;
    const topUserGenres = Object.entries(taste).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => Number(g));
    const overlaps = (item.genreIds || []).some((g) => topUserGenres.includes(g));
    if (pct >= 70) return { tone: "hot", text: "Right in your lane" };
    if (!overlaps && pct >= 35) return { tone: "stretch", text: "Outside your usual genres, might be worth the stretch" };
    if (pct < 30) return { tone: "cool", text: "A departure from what you usually rate highly" };
    return null;
  };

  const processed = useMemo(() => {
    let list = items
      .map((x) => ({ ...x, _pct: matchPercent(x, taste) }))
      .filter((x) => inWindow(x.releaseDate));
    if (sort === "soonest") list.sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : 1));
    if (sort === "highest") list.sort((a, b) => (b._pct || 0) - (a._pct || 0));
    if (sort === "lowest") list.sort((a, b) => (a._pct || 0) - (b._pct || 0));
    return list;
  }, [items, window, sort, taste]);

  const WINDOWS = [
    { id: "all", label: "All" },
    { id: "week", label: "This week" },
    { id: "nextweek", label: "Next week" },
    { id: "month", label: "This month" },
    { id: "thisyear", label: "This year" },
    { id: "nextyear", label: "Next year" }
  ];

  return (
    <div className="view">
      {infoItem && (
        <DetailModal
          item={infoItem}
          tmdb={tmdb}
          badges={badgesFor(infoItem, people, taste)}
          settings={settings}
          onClose={() => setInfoItem(null)}
          onAddToWatchlist={(it) => { onAddToWatchlist(it); setAdded((a) => ({ ...a, [it.tmdbId]: true })); }}
          onLogNew={onLogNew}
        />
      )}

      <div className="chip-scroll">
        {WINDOWS.map((w) => (
          <button key={w.id} className={"chip" + (window === w.id ? " chip-active" : "")} onClick={() => setWindow(w.id)}>
            {w.label}
          </button>
        ))}
      </div>

      {enough && (
        <div className="filter-row" style={{ marginBottom: 12 }}>
          <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="soonest">Soonest first</option>
            <option value="highest">Highest match</option>
            <option value="lowest">Lowest match</option>
          </select>
        </div>
      )}

      {loading && <EmptyState icon={<RefreshCw size={32} className="spin" />} title="Checking the calendar" body="Pulling what's headed to theaters." />}
      {!loading && error && <EmptyState icon={<Info size={32} />} title="Couldn't load release dates" body={`TMDB said: ${error}`} />}
      {!loading && !error && processed.length === 0 && (
        <EmptyState icon={<CalendarDays size={32} />} title="Nothing in that window" body="Try a wider time range." />
      )}

      {!loading && !error && (
        <div className="coming-list">
          {processed.map((item) => {
            const badges = badgesFor(item, people, taste);
            const n = enough ? note(item, item._pct) : null;
            return (
              <div className="coming-row" key={item.tmdbId}>
                <button className="coming-thumb-btn" onClick={() => setInfoItem(item)} aria-label={`Details for ${item.title}`}>
                  {item.posterPath ? (
                    <img src={tmdbImg(item.posterPath, "w154")} alt="" className="coming-thumb" />
                  ) : (
                    <div className="coming-thumb coming-thumb-fallback"><Film size={18} /></div>
                  )}
                </button>
                <div className="coming-info">
                  <div className="suggest-title-row">
                    <button className="suggest-title-btn" onClick={() => setInfoItem(item)}>{item.title}</button>
                    {enough && item._pct != null && (
                      <span className={"match-pill " + (item._pct >= 70 ? "match-high" : item._pct >= 40 ? "match-mid" : "match-low")}>{item._pct}%</span>
                    )}
                  </div>
                  <div className="coming-date">{daysOut(item.releaseDate)}</div>
                  {badges.length > 0 && (
                    <div className="badge-row">
                      {badges.map((b, i) => <span key={i} className={"badge badge-" + b.kind}>{b.text}</span>)}
                    </div>
                  )}
                  {n && <div className={"proactive-note note-" + n.tone}>{n.text}</div>}
                  <div className="suggest-links">
                    <a className="link-pill" href={buildAmcLink(item.title, settings.zip)} target="_blank" rel="noreferrer">AMC</a>
                    <a className="link-pill" href={buildRegalLink(item.title, settings.zip)} target="_blank" rel="noreferrer">Regal</a>
                    <a className="link-pill" href={buildBelcourtLink(item.title)} target="_blank" rel="noreferrer">Belcourt</a>
                  </div>
                </div>
                <button
                  className={"icon-btn" + (added[item.tmdbId] ? " icon-btn-active" : "")}
                  onClick={() => { onAddToWatchlist(item); setAdded((a) => ({ ...a, [item.tmdbId]: true })); }}
                  aria-label="Want to see"
                >
                  <Eye size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   OUT NOW TAB  — movies currently in theaters
--------------------------------------------------------- */

function OutNowView({ tmdb, settings, taste, people, collection, feedback, onAddToWatchlist, onLogNew }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState({});
  const [infoItem, setInfoItem] = useState(null);

  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const region = (settings.country || "US").toUpperCase();
        const [p1, p2] = await Promise.all([tmdb.nowPlaying(1, region), tmdb.nowPlaying(2, region)]);
        const raw = [...(p1.results || []), ...(p2.results || [])];
        const dedup = Array.from(new Map(raw.map((r) => [r.id, r])).values());
        const sorted = dedup
          .map((r) => ({ ...normalize(r), overview: r.overview }))
          .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        if (active) setItems(sorted);
      } catch (e) {
        if (active) setError(e.message);
      }
      if (active) setLoading(false);
    }
    run();
    return () => { active = false; };
  }, [settings.country]);

  const enough = hasEnoughTaste(collection, feedback);

  const processed = useMemo(
    () => items.map((x) => ({ ...x, _pct: matchPercent(x, taste) })),
    [items, taste]
  );

  const ownedSet = useMemo(
    () => new Set([...collection.map((c) => c.tmdbId + c.mediaType), ...[]]),
    [collection]
  );

  return (
    <div className="view">
      {infoItem && (
        <DetailModal
          item={infoItem}
          tmdb={tmdb}
          badges={badgesFor(infoItem, people, taste)}
          settings={settings}
          onClose={() => setInfoItem(null)}
          onAddToWatchlist={(it) => { onAddToWatchlist(it); setAdded((a) => ({ ...a, [it.tmdbId]: true })); }}
          onLogNew={onLogNew}
        />
      )}

      {loading && <EmptyState icon={<RefreshCw size={32} className="spin" />} title="Loading theaters" body="Pulling what's playing right now." />}
      {!loading && error && <EmptyState icon={<Info size={32} />} title="Couldn't load" body={`TMDB said: ${error}`} />}
      {!loading && !error && processed.length === 0 && (
        <EmptyState icon={<Clapperboard size={32} />} title="Nothing found" body="No current releases found for your region." />
      )}

      {!loading && !error && (
        <div className="coming-list">
          {processed.map((item) => {
            const badges = badgesFor(item, people, taste);
            const isOwned = ownedSet.has(item.tmdbId + item.mediaType);
            return (
              <div className="coming-row" key={item.tmdbId}>
                <button className="coming-thumb-btn" onClick={() => setInfoItem(item)} aria-label={`Details for ${item.title}`}>
                  {item.posterPath ? (
                    <img src={tmdbImg(item.posterPath, "w154")} alt="" className="coming-thumb" />
                  ) : (
                    <div className="coming-thumb coming-thumb-fallback"><Film size={18} /></div>
                  )}
                </button>
                <div className="coming-info">
                  <div className="suggest-title-row">
                    <button className="suggest-title-btn" onClick={() => setInfoItem(item)}>{item.title}</button>
                    {enough && item._pct != null && (
                      <span className={"match-pill " + (item._pct >= 70 ? "match-high" : item._pct >= 40 ? "match-mid" : "match-low")}>{item._pct}%</span>
                    )}
                  </div>
                  <div className="coming-date" style={{ color: "var(--brass-bright)" }}>In theaters now</div>
                  {badges.length > 0 && (
                    <div className="badge-row">
                      {badges.map((b, i) => <span key={i} className={"badge badge-" + b.kind}>{b.text}</span>)}
                    </div>
                  )}
                  <div className="suggest-links">
                    <a className="link-pill" href={buildAmcLink(item.title, settings.zip)} target="_blank" rel="noreferrer">AMC</a>
                    <a className="link-pill" href={buildRegalLink(item.title, settings.zip)} target="_blank" rel="noreferrer">Regal</a>
                  </div>
                </div>
                <button
                  className={"icon-btn" + (added[item.tmdbId] || isOwned ? " icon-btn-active" : "")}
                  onClick={() => { onAddToWatchlist(item); setAdded((a) => ({ ...a, [item.tmdbId]: true })); }}
                  aria-label="Want to see"
                >
                  <Bookmark size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   SEARCH TAB
--------------------------------------------------------- */

function SearchView({ tmdb, onAddToWatchlist, onLogNew }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [logging, setLogging] = useState(null);
  const [detail, setDetail] = useState(null);

  async function runSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await tmdb.searchMulti(query.trim());
      const filtered = (data.results || []).filter((r) => r.media_type === "movie" || r.media_type === "tv").map(normalize);
      setResults(filtered);
    } catch (e2) {
      setError(e2.message);
    }
    setLoading(false);
  }

  return (
    <div className="view">
      {detail && (
        <DetailModal
          item={detail}
          tmdb={tmdb}
          badges={[]}
          settings={{}}
          onClose={() => setDetail(null)}
          onAddToWatchlist={onAddToWatchlist}
          onLogNew={onLogNew}
        />
      )}

      <form className="search-bar" onSubmit={runSearch}>
        <Search size={16} />
        <input
          className="search-input"
          placeholder="Search any movie or show"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>

      {loading && <EmptyState icon={<RefreshCw size={32} className="spin" />} title="Searching" body="One second." />}
      {error && <EmptyState icon={<Info size={32} />} title="Search failed" body={`TMDB said: ${error}`} />}

      {!loading && !error && (
        <div className="suggest-list">
          {results.map((item) => (
            <div className="suggest-row" key={item.tmdbId + item.mediaType}>
              <button className="suggest-thumb-btn" onClick={() => setDetail(item)} aria-label={`Details for ${item.title}`}>
                {item.posterPath ? (
                  <img src={tmdbImg(item.posterPath, "w154")} alt="" className="suggest-thumb" />
                ) : (
                  <div className="suggest-thumb suggest-thumb-fallback">{item.mediaType === "tv" ? <Tv size={18} /> : <Film size={18} />}</div>
                )}
              </button>
              <div className="suggest-info">
                <button className="suggest-title-btn" onClick={() => setDetail(item)}>{item.title} {item.year ? `· ${item.year}` : ""}</button>
                <div className="suggest-genres">{genreNames(item.genreIds, item.mediaType).slice(0, 3).join(" · ")}</div>
              </div>
              <div className="suggest-actions">
                <button className="icon-btn" onClick={() => onAddToWatchlist(item)} aria-label="Want to see"><Eye size={16} /></button>
                <button className="icon-btn" onClick={() => setLogging(item)} aria-label="Seen it"><Check size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {logging && (
        <Modal onClose={() => setLogging(null)}>
          <h3 className="modal-title">{logging.title}</h3>
          <LogForm saveLabel="Add to collection" onCancel={() => setLogging(null)} onSave={(entry) => { onLogNew(logging, entry); setLogging(null); }} />
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   SETTINGS
--------------------------------------------------------- */

function SettingsPanel({ settings, conn, onSave, onClose, onSaveConnection }) {
  const [tmdbKey, setTmdbKey] = useState(settings.tmdbKey);
  const [omdbKey, setOmdbKey] = useState(settings.omdbKey);
  const [zip, setZip] = useState(settings.zip);
  const [country, setCountry] = useState(settings.country || "US");
  const [supabaseUrl, setSupabaseUrl] = useState(conn.supabaseUrl);
  const [supabaseKey, setSupabaseKey] = useState(conn.supabaseKey);

  return (
    <Modal onClose={onClose}>
      <h3 className="modal-title">Settings</h3>

      <label className="field-label">TMDB API key</label>
      <input className="field-input" value={tmdbKey} onChange={(e) => setTmdbKey(e.target.value)} placeholder="Required" />
      <a className="settings-link" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
        Get a free key <ExternalLink size={12} />
      </a>

      <label className="field-label" style={{ marginTop: 14 }}>OMDb API key (optional, for IMDb ratings)</label>
      <input className="field-input" value={omdbKey} onChange={(e) => setOmdbKey(e.target.value)} placeholder="Optional" />
      <a className="settings-link" href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noreferrer">
        Get a free key <ExternalLink size={12} />
      </a>

      <label className="field-label" style={{ marginTop: 14 }}>Country, for release dates where you actually are</label>
      <input
        className="field-input"
        value={country}
        onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
        placeholder="US, GB, IE, etc"
      />
      <p className="sync-note">Two letter code. Changes which Coming Soon dates and streaming options you see. Doesn't affect AMC/Regal links below, those use zip.</p>

      <label className="field-label" style={{ marginTop: 14 }}>Zip or city, for ticket links</label>
      <input className="field-input" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="e.g. 37064 or wherever you are" />

      <label className="field-label" style={{ marginTop: 18 }}>Sync across devices</label>
      <p className="sync-note">
        Paste your Supabase project URL and key here, once per device, and your collection stays the same on your phone and your computer.
        Leave this blank and it just stays on this device.
      </p>
      <input className="field-input" value={supabaseUrl} onChange={(e) => setSupabaseUrl(e.target.value)} placeholder="https://yourproject.supabase.co" />
      <input className="field-input" style={{ marginTop: 8 }} value={supabaseKey} onChange={(e) => setSupabaseKey(e.target.value)} placeholder="Supabase publishable or anon key" />

      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary"
          onClick={() => {
            onSave({ tmdbKey, omdbKey, zip, country: country || "US" });
            onSaveConnection({ supabaseUrl: supabaseUrl.trim(), supabaseKey: supabaseKey.trim() });
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

function Onboarding({ onSave }) {
  const [tmdbKey, setTmdbKey] = useState("");
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <Ticket size={36} className="onboarding-icon" />
        <h1 className="onboarding-title">Welcome to Watchlist</h1>
        <p className="onboarding-body">
          One free key from TMDB powers everything here: posters, release dates, and where to watch.
          Takes about a minute to grab.
        </p>
        <a className="settings-link" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
          Get your free TMDB key <ExternalLink size={12} />
        </a>
        <input
          className="field-input"
          style={{ marginTop: 16 }}
          placeholder="Paste your TMDB API key"
          value={tmdbKey}
          onChange={(e) => setTmdbKey(e.target.value)}
        />
        <button className="btn btn-primary" style={{ marginTop: 14, width: "100%" }} disabled={!tmdbKey.trim()} onClick={() => onSave(tmdbKey.trim())}>
          Start collecting
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   APP SHELL
--------------------------------------------------------- */

const TABS = [
  { id: "collection", label: "Collection", icon: Ticket },
  { id: "discover", label: "Discover", icon: Sparkles },
  { id: "outnow", label: "Out Now", icon: Clapperboard },
  { id: "soon", label: "Coming Soon", icon: CalendarDays },
  { id: "search", label: "Search", icon: Search }
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [conn, setConn] = useState(() => getConnection());
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [collection, setCollection] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [feedback, setFeedback] = useState({ skippedIds: [], wantedIds: [], seenIds: [] });
  const [tab, setTab] = useState("collection");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    async function load() {
      const [s, c, w, f] = await Promise.all([
        loadKey(STORAGE_KEYS.settings, DEFAULT_SETTINGS, conn),
        loadKey(STORAGE_KEYS.collection, [], conn),
        loadKey(STORAGE_KEYS.watchlist, [], conn),
        loadKey(STORAGE_KEYS.feedback, { skippedIds: [], wantedIds: [], seenIds: [] }, conn)
      ]);
      setSettings(s);
      setCollection(c);
      setWatchlist(w);
      setFeedback(f);
      setReady(true);
    }
    load();
    // eslint-disable-next-line
  }, []);

  useEffect(() => { if (ready) saveKey(STORAGE_KEYS.settings, settings, conn); }, [settings, ready, conn]);
  useEffect(() => { if (ready) saveKey(STORAGE_KEYS.collection, collection, conn); }, [collection, ready, conn]);
  useEffect(() => { if (ready) saveKey(STORAGE_KEYS.watchlist, watchlist, conn); }, [watchlist, ready, conn]);
  useEffect(() => { if (ready) saveKey(STORAGE_KEYS.feedback, feedback, conn); }, [feedback, ready, conn]);

  function updateConnection(next) {
    saveConnection(next);
    setConn(next);
  }

  const tmdb = useMemo(() => makeTmdb(settings.tmdbKey), [settings.tmdbKey]);
  const taste = useMemo(() => buildTasteProfile(collection, feedback), [collection, feedback]);
  const people = useMemo(() => buildPeopleProfile(collection), [collection]);
  const [redditPrompt, setRedditPrompt] = useState(null);
  const [burst, setBurst] = useState(null);

  function fireBurst(kind) {
    setBurst({ kind, key: Date.now() });
    setTimeout(() => setBurst(null), 850);
  }

  function addToWatchlist(item) {
    setWatchlist((w) => {
      if (w.find((x) => x.tmdbId === item.tmdbId && x.mediaType === item.mediaType)) return w;
      return [...w, { ...item, addedAt: Date.now() }];
    });
    fireBurst("want");
  }

  function logNew(item, viewing, credits) {
    const ticket = {
      id: uid(),
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      title: item.title,
      year: item.year,
      posterPath: item.posterPath,
      genreIds: item.genreIds,
      credits: credits || item.credits || null,
      viewings: [viewing],
      log: [{ at: Date.now(), text: "Added to your collection" }],
      history: []
    };
    setCollection((c) => [...c, ticket]);
    setWatchlist((w) => w.filter((x) => !(x.tmdbId === item.tmdbId && x.mediaType === item.mediaType)));
    setRedditPrompt({ title: item.title, year: item.year });
    fireBurst("collect");
  }

  function updateTicket(t) {
    setCollection((c) => c.map((x) => (x.id === t.id ? t : x)));
  }

  function deleteTicket(id) {
    setCollection((c) => c.filter((x) => x.id !== id));
  }

  function logFromWatchlist(w) {
    logNew(w, { id: uid(), date: todayISO(), location: "", rating: 4, notes: "", loggedAt: Date.now() });
  }

  function removeFromWatchlist(item) {
    setWatchlist((w) => w.filter((x) => !(x.tmdbId === item.tmdbId && x.mediaType === item.mediaType)));
  }

  if (!ready) return <div className="boot-screen"><Ticket size={28} className="spin" /></div>;

  if (!settings.tmdbKey) {
    return (
      <div className="app">
        <GlobalStyle />
        <Onboarding onSave={(key) => setSettings((s) => ({ ...s, tmdbKey: key }))} />
      </div>
    );
  }

  return (
    <div className="app">
      <GlobalStyle />
      {burst && (
        <div className="burst-overlay" key={burst.key}>
          <div className={"burst-icon burst-" + burst.kind}>
            {burst.kind === "collect" ? <Ticket size={46} /> : <Eye size={46} />}
          </div>
        </div>
      )}
      <header className="app-header">
        <div className="wordmark">WATCH<span className="wordmark-dot">LIST</span></div>
        <div className="header-right">
          <span className={"sync-pill" + (hasCloud(conn) ? " sync-on" : "")}>
            {hasCloud(conn) ? "Synced" : "This device only"}
          </span>
          <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings"><Settings size={18} /></button>
        </div>
      </header>

      <main className="app-main">
        {tab === "collection" && (
          <CollectionView
            collection={collection}
            watchlist={watchlist}
            tmdb={tmdb}
            taste={taste}
            people={people}
            settings={settings}
            onUpdateTicket={updateTicket}
            onDeleteTicket={deleteTicket}
            onLogFromWatchlist={logFromWatchlist}
            onAddToWatchlist={addToWatchlist}
            onLogNew={logNew}
            onRemoveFromWatchlist={removeFromWatchlist}
          />
        )}
        {tab === "discover" && (
          <DiscoverView
            tmdb={tmdb}
            feedback={feedback}
            setFeedback={setFeedback}
            taste={taste}
            people={people}
            settings={settings}
            collection={collection}
            watchlist={watchlist}
            onAddToWatchlist={addToWatchlist}
            onLogNew={logNew}
          />
        )}
        {tab === "outnow" && (
          <OutNowView
            tmdb={tmdb}
            settings={settings}
            taste={taste}
            people={people}
            collection={collection}
            feedback={feedback}
            onAddToWatchlist={addToWatchlist}
            onLogNew={logNew}
          />
        )}
        {tab === "soon" && (
          <ComingSoonView
            tmdb={tmdb}
            settings={settings}
            taste={taste}
            people={people}
            collection={collection}
            feedback={feedback}
            onAddToWatchlist={addToWatchlist}
            onLogNew={logNew}
          />
        )}
        {tab === "search" && <SearchView tmdb={tmdb} onAddToWatchlist={addToWatchlist} onLogNew={logNew} />}
      </main>

      {redditPrompt && (
        <Modal onClose={() => setRedditPrompt(null)}>
          <h3 className="modal-title">Logged: {redditPrompt.title}</h3>
          <p className="sync-note" style={{ marginBottom: 16 }}>
            Want to see what everyone else thought? Here's the official Reddit discussion thread.
          </p>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setRedditPrompt(null)}>No thanks</button>
            <a
              className="btn btn-primary"
              href={buildRedditLink(redditPrompt.title, redditPrompt.year)}
              target="_blank"
              rel="noreferrer"
              onClick={() => setRedditPrompt(null)}
            >
              <ExternalLink size={14} /> Open discussion
            </a>
          </div>
        </Modal>
      )}

      <nav className="tab-bar">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} className={"tab-btn" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
              <Icon size={19} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          conn={conn}
          onClose={() => setShowSettings(false)}
          onSave={(s) => setSettings(s)}
          onSaveConnection={(c) => { updateConnection(c); setShowSettings(false); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   STYLES
--------------------------------------------------------- */

function GlobalStyle() {
  return <style>{CSS}</style>;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

:root {
  --curtain: #0a0708;
  --velvet: #15100f;
  --velvet-2: #221615;
  --brass: #e2a836;
  --brass-bright: #f0c668;
  --marquee-red: #e23636;
  --stub-cream: #f3eeec;
  --ink: #1a1210;
  --cream-text: #f5f0f0;
  --muted: #9a8a8a;
  --line: rgba(226,54,54,0.16);
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
button { font-family: inherit; cursor: pointer; }
input, textarea { font-family: inherit; }

.app {
  background: radial-gradient(circle at 50% -10%, #1a0606 0%, var(--curtain) 55%);
  color: var(--cream-text);
  font-family: 'Inter', system-ui, sans-serif;
  min-height: 100vh;
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow-x: hidden;
}

.boot-screen { display:flex; align-items:center; justify-content:center; height:100vh; color: var(--brass); }
.spin { animation: spin 1.1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.app-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: calc(18px + env(safe-area-inset-top)) 18px 14px;
  position: sticky; top: 0; z-index: 5;
  background: linear-gradient(180deg, var(--curtain) 78%, transparent);
}
.header-right { display: flex; align-items: center; gap: 10px; }
.sync-pill {
  font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--muted); border: 1px solid var(--line); padding: 4px 9px; border-radius: 999px;
}
.sync-pill.sync-on { color: var(--brass); border-color: rgba(226,168,54,0.4); }
.sync-note { font-size: 12px; color: var(--muted); line-height: 1.45; margin: 4px 0 10px; }
.wordmark {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 28px;
  letter-spacing: 0.06em;
  color: var(--cream-text);
  text-shadow: none;
}
.wordmark-dot { color: var(--marquee-red); }

.app-main { flex: 1; padding: 4px 16px 90px; }

.tab-bar {
  position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
  width: 100%; max-width: 480px;
  display: flex; background: var(--velvet);
  border-top: 1px solid var(--line);
  padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
  z-index: 10;
}
.tab-btn {
  flex: 1; background: none; border: none; color: var(--muted);
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  font-size: 10.5px; letter-spacing: 0.02em; padding: 6px 2px; border-radius: 10px;
  transition: color 0.15s, background 0.15s;
}
.tab-btn.active { color: #ff6b6b; background: rgba(226,54,54,0.14); }

.view { padding-top: 6px; }
.view-toggle { display: flex; gap: 8px; margin-bottom: 16px; }
.toggle-pill {
  flex: 1; background: var(--velvet); border: 1px solid var(--line); color: var(--muted);
  padding: 9px 0; border-radius: 999px; font-size: 13px; font-weight: 600;
  transition: all 0.15s;
}
.toggle-pill.active { background: var(--marquee-red); color: #fff; border-color: var(--marquee-red); }

.empty-state { text-align: center; padding: 60px 24px; color: var(--muted); }
.empty-icon { color: var(--brass); margin-bottom: 14px; display: flex; justify-content: center; }
.empty-title { font-family: 'Bebas Neue', sans-serif; font-size: 20px; letter-spacing: 0.03em; color: var(--cream-text); margin-bottom: 8px; }
.empty-body { font-size: 13.5px; line-height: 1.5; max-width: 280px; margin: 0 auto; }

.hint-banner {
  display: flex; align-items: center; gap: 8px;
  background: rgba(226,168,54,0.12); border: 1px solid rgba(226,168,54,0.3);
  color: var(--brass-bright); font-size: 12.5px; padding: 10px 12px; border-radius: 10px; margin-bottom: 14px;
}

/* ---- collection header ---- */
.collection-header-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.collection-actions { display: flex; gap: 10px; margin-bottom: 16px; }
.collection-action-btn {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px;
  background: rgba(226,54,54,0.08); border: 1px solid rgba(226,54,54,0.25);
  color: #ff6b6b; padding: 14px 0; border-radius: 14px; font-size: 11.5px; font-weight: 600;
}
.collection-action-btn:active { opacity: 0.7; }

/* ---- ticket stub grid ---- */
.stub-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;
}
.stub {
  background: var(--stub-cream); border: none; border-radius: 12px; padding: 0;
  display: flex; flex-direction: column; overflow: hidden; position: relative;
  text-align: left; box-shadow: 0 6px 16px rgba(0,0,0,0.35);
  transition: transform 0.15s;
}
.stub:active { transform: scale(0.97); }
.stub-num {
  position: absolute; top: 6px; right: 8px; z-index: 2;
  font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 0.03em;
  color: var(--brass); background: rgba(21,12,20,0.55); padding: 2px 6px; border-radius: 4px;
}
.stub-poster { position: relative; aspect-ratio: 2/3; background: var(--velvet); }
.stub-poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
.stub-poster-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--brass); }
.stub-perf {
  position: absolute; left: 0; right: 0; bottom: 0; height: 10px;
  background-image: radial-gradient(circle, var(--curtain) 3px, transparent 3.5px);
  background-size: 14px 14px; background-position: 0 center;
  background-color: var(--stub-cream);
}
.stub-tab { padding: 9px 10px 11px; color: var(--ink); }
.stub-title { font-size: 12.5px; font-weight: 700; line-height: 1.25; margin-bottom: 4px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.stub-rewatch-badge {
  position: absolute; bottom: 14px; left: 6px; z-index: 2;
  font-family: 'Space Mono', monospace; font-size: 9px; font-weight: 700;
  color: #fff; background: var(--marquee-red); padding: 2px 7px; border-radius: 999px;
}
.stub-shine {
  position: absolute; top: 0; left: -60%; width: 40%; height: 100%;
  background: linear-gradient(115deg, transparent, rgba(255,255,255,0.5), transparent);
  transform: skewX(-20deg); pointer-events: none; opacity: 0; transition: opacity 0.2s;
}
.stub:hover .stub-shine, .stub:focus .stub-shine { opacity: 1; animation: shine 0.9s ease forwards; }
@keyframes shine { from { left: -60%; } to { left: 130%; } }

/* stars */
.stars { display: flex; gap: 1px; position: relative; }
.star-slot { position: relative; }
.star-bg { color: rgba(0,0,0,0.25); position: absolute; top: 0; left: 0; }
.star-fill { position: absolute; top: 0; left: 0; color: var(--brass); overflow: hidden; }
.star-fg { display: block; }
.star-hit { position: absolute; top: 0; bottom: 0; width: 50%; background: none; border: none; padding: 0; }
.star-hit-left { left: 0; }
.star-hit-right { right: 0; }

/* watchlist rows */
.watchlist-rows { display: flex; flex-direction: column; gap: 10px; }
.watch-row { display: flex; align-items: center; gap: 12px; background: var(--velvet); border-radius: 12px; padding: 10px 12px; }
.watch-thumb { width: 44px; height: 66px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: var(--velvet-2); }
.watch-thumb-fallback { display: flex; align-items: center; justify-content: center; color: var(--brass); }
.watch-info { flex: 1; min-width: 0; }
.watch-title { font-weight: 600; font-size: 13.5px; }
.watch-sub { color: var(--muted); font-size: 11.5px; }

/* buttons */
.btn { border-radius: 999px; padding: 10px 18px; font-size: 13.5px; font-weight: 600; border: none; display: inline-flex; align-items: center; gap: 6px; justify-content: center; }
.btn-primary { background: var(--marquee-red); color: #fff; }
.btn-ghost { background: none; color: var(--muted); }
.btn-outline { background: none; border: 1px solid var(--line); color: var(--cream-text); }
.btn-sm { padding: 7px 12px; font-size: 12px; }
.btn-danger { color: #e98b85; border-color: rgba(233,139,133,0.4); }
.btn:disabled { opacity: 0.4; }
.icon-btn { background: var(--velvet); border: 1px solid var(--line); color: var(--cream-text); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.icon-btn-active { background: var(--marquee-red); border-color: var(--marquee-red); }

/* modal */
.modal-veil { position: fixed; inset: 0; background: rgba(10,5,9,0.72); backdrop-filter: blur(2px); display: flex; align-items: flex-end; justify-content: center; z-index: 50; }
.modal-card { background: var(--velvet); width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto; border-radius: 20px 20px 0 0; padding: 22px 18px 28px; position: relative; }
.modal-wide { max-height: 92vh; }
.modal-close { position: absolute; top: 14px; right: 14px; background: rgba(0,0,0,0.25); border: none; color: var(--cream-text); width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.modal-title { font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: 0.02em; margin: 0 0 14px; padding-right: 30px; }

/* forms */
.field-label { display: block; font-size: 11.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 12px 0 6px; }
.field-input { width: 100%; background: var(--curtain); border: 1px solid var(--line); color: var(--cream-text); padding: 10px 12px; border-radius: 10px; font-size: 14px; }
.field-textarea { min-height: 80px; resize: vertical; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.settings-link { color: var(--brass-bright); font-size: 12px; display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; text-decoration: none; }

/* ticket detail / flip */
.ticket-detail { perspective: 1600px; }
.flip-stage { position: relative; transform-style: preserve-3d; transition: transform 0.55s cubic-bezier(.4,.2,.2,1); }
.flip-front, .flip-back { backface-visibility: hidden; }
.flip-front { }
.flip-back { position: absolute; top: 0; left: 0; width: 100%; transform: rotateY(180deg); }
.flip-stage.is-flipped { transform: rotateY(180deg); }
.flip-stage:not(.is-flipped) .flip-back { visibility: hidden; }
.flip-stage.is-flipped .flip-front { visibility: hidden; }
.detail-poster { width: 100%; border-radius: 14px; aspect-ratio: 2/3; object-fit: cover; background: var(--curtain); }
.detail-poster-fallback { display: flex; align-items: center; justify-content: center; color: var(--brass); }
.flip-hint { margin-top: 12px; width: 100%; }
.flip-hint-back { margin-top: 0; margin-bottom: 10px; }
.detail-title { font-family: 'Bebas Neue', sans-serif; font-size: 24px; letter-spacing: 0.02em; margin: 0 0 4px; }
.detail-genres { color: var(--muted); font-size: 12px; margin-bottom: 14px; }
.detail-toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }

.viewing-list { display: flex; flex-direction: column; gap: 10px; }
.viewing-row { background: var(--curtain); border-radius: 12px; padding: 12px; position: relative; }
.viewing-row-new { border: 1px dashed var(--brass); }
.viewing-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.viewing-date { font-family: 'Space Mono', monospace; font-size: 12px; color: var(--brass-bright); }
.viewing-loc { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.viewing-notes { font-size: 13px; line-height: 1.45; color: var(--cream-text); }
.viewing-actions { display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px; }
.viewing-actions .icon-btn { width: 26px; height: 26px; }

.edit-log { margin-top: 16px; font-size: 12px; color: var(--muted); }
.edit-log summary { cursor: pointer; color: var(--brass-bright); }
.edit-log-row { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--line); }
.edit-log-time { font-family: 'Space Mono', monospace; font-size: 10.5px; flex-shrink: 0; }

/* discover swipe */
.view-discover { display: flex; flex-direction: column; align-items: center; }
.swipe-stack { width: 100%; max-width: 340px; }
.swipe-card {
  background: var(--velvet); border-radius: 18px; overflow: hidden; position: relative;
  touch-action: none; user-select: none; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  border: 1px solid rgba(226,54,54,0.1);
}
.swipe-poster { width: 100%; aspect-ratio: 2/3; object-fit: cover; display: block; }
.swipe-poster-fallback { display: flex; align-items: center; justify-content: center; color: var(--brass); background: var(--velvet-2); }
.swipe-meta { padding: 14px 14px 6px; }
.swipe-title { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
.swipe-genres { color: var(--muted); font-size: 12px; }
.swipe-buttons { display: flex; justify-content: center; gap: 16px; padding: 14px 0 18px; }
.round-btn { width: 50px; height: 50px; border-radius: 50%; border: none; display: flex; align-items: center; justify-content: center; transition: transform 0.12s; }
.round-btn:active { transform: scale(0.88); }
.round-btn-skip { background: #2a1818; border: 1px solid rgba(226,54,54,0.3); color: #e2685f; }
.round-btn-seen { background: var(--marquee-red); color: #fff; width: 60px; height: 60px; border: none; }
.round-btn-want { background: var(--marquee-red); color: #fff; }
.swipe-flag { position: absolute; top: 20px; font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: 0.05em; padding: 6px 14px; border-radius: 6px; z-index: 3; transform: rotate(-8deg); }
.swipe-flag-want { left: 16px; border: 3px solid #6fbf73; color: #6fbf73; }
.swipe-flag-skip { right: 16px; border: 3px solid #e9695f; color: #e9695f; transform: rotate(8deg); }
.refresh-btn { margin-top: 18px; }

/* suggestions / search / coming soon shared rows */
.suggest-list, .coming-list { display: flex; flex-direction: column; gap: 10px; }
.suggest-row, .coming-row { display: flex; gap: 12px; background: var(--velvet); border-radius: 12px; padding: 10px 12px; position: relative; }
.suggest-thumb, .coming-thumb { width: 46px; height: 69px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: var(--velvet-2); }
.suggest-thumb-fallback, .coming-thumb-fallback { display: flex; align-items: center; justify-content: center; color: var(--brass); }
.suggest-info, .coming-info { flex: 1; min-width: 0; }
.suggest-title, .coming-title { font-weight: 600; font-size: 13.5px; margin-bottom: 2px; }
.suggest-genres { color: var(--muted); font-size: 11.5px; margin-bottom: 6px; }
.coming-date { color: var(--brass-bright); font-size: 11.5px; font-family: 'Space Mono', monospace; margin-bottom: 6px; }
.suggest-links { display: flex; gap: 6px; flex-wrap: wrap; }
.link-pill { font-size: 10.5px; color: var(--cream-text); background: var(--velvet-2); padding: 3px 9px; border-radius: 999px; text-decoration: none; }
.suggest-actions { display: flex; flex-direction: column; gap: 6px; justify-content: center; }

/* search bar */
.search-bar { display: flex; align-items: center; gap: 8px; background: var(--velvet); border-radius: 999px; padding: 10px 16px; margin-bottom: 16px; color: var(--muted); }
.search-input { flex: 1; background: none; border: none; color: var(--cream-text); font-size: 14px; outline: none; }

/* onboarding */
.onboarding { flex: 1; display: flex; align-items: center; justify-content: center; padding: 30px; }
.onboarding-card { text-align: center; max-width: 320px; }
.onboarding-icon { color: var(--brass); margin-bottom: 14px; }
.onboarding-title { font-family: 'Bebas Neue', sans-serif; font-size: 32px; letter-spacing: 0.04em; color: var(--cream-text); margin: 0 0 10px; }
.onboarding-body { font-size: 13.5px; color: var(--muted); line-height: 1.5; margin-bottom: 10px; }

/* ---- new feature styles ---- */

/* imdb rating + streaming providers */
.imdb-badge { font-size: 9.5px; font-weight: 700; color: #f5c518; border: 1px solid rgba(245,197,24,0.5); padding: 1px 6px; border-radius: 4px; white-space: nowrap; }
.link-pill-stream { background: var(--marquee-red); color: #fff; border-color: var(--marquee-red); }
.detail-imdb { margin: 6px 0; }

/* compact collection grid: smaller posters, 3 across */
.stub-grid-compact { grid-template-columns: repeat(3, 1fr); gap: 10px; }
.stub-grid-compact .stub-title { font-size: 11px; }
.stub-grid-compact .stub-tab { padding: 7px 8px 9px; }

/* collection controls */
.collection-controls { margin-bottom: 14px; }
.collection-search { margin-bottom: 10px; }
.filter-row { display: flex; gap: 8px; }
.filter-select {
  flex: 1; background: var(--velvet); border: 1px solid var(--line); color: var(--cream-text);
  padding: 9px 10px; border-radius: 10px; font-size: 12.5px; appearance: none;
}
.scan-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
  background: rgba(226,54,54,0.1); border: 1px dashed rgba(226,54,54,0.4); color: #ff6b6b;
  padding: 11px; border-radius: 12px; font-size: 13px; font-weight: 600; margin-bottom: 16px;
}

/* tappable watchlist row */
.watch-tap { display: flex; align-items: center; gap: 12px; background: none; border: none; padding: 0; flex: 1; min-width: 0; text-align: left; color: inherit; }

/* detail modal */
.detail-modal { padding-top: 4px; }
.detail-head { display: flex; gap: 14px; margin-bottom: 16px; }
.detail-head-poster { width: 92px; height: 138px; border-radius: 10px; object-fit: cover; flex-shrink: 0; background: var(--velvet-2); }
.detail-head-info { flex: 1; min-width: 0; }
.detail-loading { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; padding: 14px 0; }
.detail-body { margin-bottom: 16px; }
.detail-overview { font-size: 13.5px; line-height: 1.55; color: var(--cream-text); margin: 0 0 14px; }
.detail-facts { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.detail-facts > div { font-size: 13px; color: var(--cream-text); display: flex; gap: 8px; }
.detail-facts span { color: var(--muted); min-width: 72px; display: inline-block; }
.detail-cast-label { font-size: 11.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
.detail-cast-list { display: flex; flex-wrap: wrap; gap: 6px; }
.cast-chip { font-size: 11.5px; background: var(--velvet-2); color: var(--cream-text); padding: 4px 9px; border-radius: 999px; }
.detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* badges */
.badge-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.badge { font-size: 10.5px; font-weight: 600; padding: 3px 9px; border-radius: 999px; letter-spacing: 0.02em; }
.badge-director { background: rgba(226,54,54,0.18); color: #ff8080; }
.badge-actor { background: rgba(226,168,54,0.18); color: var(--brass-bright); }
.badge-genre { background: rgba(226,54,54,0.12); color: #ff9a9a; }

/* match scores */
.match-badge { position: absolute; top: 14px; right: 14px; z-index: 3; font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 999px; backdrop-filter: blur(4px); }
.match-pill { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; flex-shrink: 0; }
.match-high { background: rgba(47,184,107,0.2); color: #5fd99a; }
.match-mid { background: rgba(226,168,54,0.2); color: var(--brass-bright); }
.match-low { background: rgba(154,138,138,0.2); color: var(--muted); }

/* swipe poster tap */
.swipe-poster-btn { display: block; width: 100%; padding: 0; border: none; background: none; position: relative; cursor: pointer; }
.swipe-info-hint { position: absolute; bottom: 10px; right: 10px; display: flex; align-items: center; gap: 4px; font-size: 11px; color: #fff; background: rgba(10,7,8,0.6); padding: 4px 8px; border-radius: 999px; }
.discover-foot { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 16px; }

/* suggestion rows */
.suggest-thumb-btn, .coming-thumb-btn { padding: 0; border: none; background: none; flex-shrink: 0; cursor: pointer; }
.suggest-title-row { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.suggest-title-btn { background: none; border: none; color: var(--cream-text); font-weight: 600; font-size: 13.5px; padding: 0; text-align: left; cursor: pointer; }

/* choice grid */
.choice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.choice-grid .btn { width: 100%; }

/* favorites tab */
.fav-section { margin-bottom: 22px; }
.fav-section-title { font-family: 'Bebas Neue', sans-serif; font-size: 17px; letter-spacing: 0.03em; color: var(--cream-text); margin-bottom: 10px; }
.fav-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.fav-chip { font-size: 13px; background: var(--velvet); border: 1px solid var(--line); color: var(--cream-text); padding: 7px 12px; border-radius: 999px; }
.fav-poster-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.fav-poster { width: 72px; flex-shrink: 0; }
.fav-poster img { width: 72px; height: 108px; border-radius: 8px; object-fit: cover; }
.fav-poster-fallback { width: 72px; height: 108px; border-radius: 8px; background: var(--velvet-2); display: flex; align-items: center; justify-content: center; color: var(--marquee-red); }

/* coming soon chips + notes */
.chip-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; margin-bottom: 6px; }
.chip { flex-shrink: 0; background: var(--velvet); border: 1px solid var(--line); color: var(--muted); padding: 7px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.chip-active { background: var(--marquee-red); color: #fff; border-color: var(--marquee-red); }
.proactive-note { font-size: 11.5px; margin: 6px 0; padding: 5px 9px; border-radius: 8px; line-height: 1.35; }
.note-hot { background: rgba(47,184,107,0.12); color: #5fd99a; }
.note-stretch { background: rgba(226,168,54,0.12); color: var(--brass-bright); }
.note-cool { background: rgba(154,138,138,0.1); color: var(--muted); }

/* where presets */
.where-presets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.where-chip {
  background: var(--velvet); border: 1px solid var(--line); color: var(--muted);
  padding: 7px 14px; border-radius: 999px; font-size: 13px; font-weight: 600;
}
.where-chip-active { background: var(--marquee-red); color: #fff; border-color: var(--marquee-red); }

/* ticket scanner */
.scan-candidates { display: flex; flex-direction: column; gap: 8px; margin-bottom: 6px; }
.scan-cand { display: flex; align-items: center; gap: 10px; background: var(--velvet); border: 1px solid var(--line); border-radius: 10px; padding: 8px; color: var(--cream-text); text-align: left; font-size: 13px; }
.scan-cand img { width: 36px; height: 54px; border-radius: 5px; object-fit: cover; }
.scan-cand-fallback { width: 36px; height: 54px; border-radius: 5px; background: var(--velvet-2); display: flex; align-items: center; justify-content: center; color: var(--marquee-red); }
.scan-cand-active { border-color: var(--marquee-red); background: rgba(226,54,54,0.1); }
.scan-raw { font-size: 10.5px; color: var(--muted); white-space: pre-wrap; max-height: 140px; overflow-y: auto; font-family: 'Space Mono', monospace; }

/* action burst animation */
.burst-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 100; }
.burst-icon { animation: burstPop 0.85s cubic-bezier(.2,.8,.3,1) forwards; }
.burst-collect { color: var(--marquee-red); }
.burst-want { color: #2fb86b; }
@keyframes burstPop {
  0% { transform: scale(0.3) rotate(-12deg); opacity: 0; }
  30% { transform: scale(1.25) rotate(4deg); opacity: 1; }
  60% { transform: scale(1) rotate(0deg); opacity: 1; }
  100% { transform: scale(0.9) translateY(-30px); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .burst-icon { animation: none !important; }
  .stub-shine, .spin, .flip-stage { animation: none !important; transition: none !important; }
}
`;

/* ---------------------------------------------------------
   MOUNT
--------------------------------------------------------- */

createRoot(document.getElementById("root")).render(<App />);
