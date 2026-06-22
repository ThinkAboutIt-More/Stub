import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  Ticket, Search, Sparkles, CalendarDays, Settings, X, Star, Pencil,
  Undo2, Trash2, Plus, Check, Heart, ChevronLeft, ChevronRight, Eye,
  Clapperboard, MapPin, Tv, Film, RefreshCw, ExternalLink, Info
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

function buildFandangoLink(title, zip) {
  const q = encodeURIComponent(title);
  return `https://www.fandango.com/search?q=${q}${zip ? `&loc=${encodeURIComponent(zip)}` : ""}`;
}

function buildRedditLink(title) {
  return `https://www.reddit.com/search/?q=${encodeURIComponent(title)}`;
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
    upcoming: (page = 1) => call("/movie/upcoming", { page, region: "US" }),
    onTheAir: (page = 1) => call("/tv/on_the_air", { page }),
    discoverMovie: (params) => call("/discover/movie", params),
    discoverTv: (params) => call("/discover/tv", params),
    searchMulti: (query) => call("/search/multi", { query }),
    watchProviders: (mediaType, id) => call(`/${mediaType}/${id}/watch/providers`),
    details: (mediaType, id) => call(`/${mediaType}/${id}`)
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
   simple weighted genre scoring from ratings + swipe feedback
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

function scoreItem(item, tasteWeights) {
  if (!item.genreIds || !item.genreIds.length) return 0;
  const total = item.genreIds.reduce((sum, g) => sum + (tasteWeights[g] || 0), 0);
  return total / item.genreIds.length;
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
   LOG FORM, used for first viewing, rewatch, and edits
--------------------------------------------------------- */

function LogForm({ initial, onSave, onCancel, saveLabel }) {
  const [date, setDate] = useState(initial?.date || todayISO());
  const [location, setLocation] = useState(initial?.location || "");
  const [rating, setRating] = useState(initial?.rating ?? 4);
  const [notes, setNotes] = useState(initial?.notes || "");

  return (
    <div className="log-form">
      <label className="field-label">Date watched</label>
      <input className="field-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      <label className="field-label">Where</label>
      <input
        className="field-input"
        type="text"
        placeholder="AMC Thoroughbred, Netflix, friend's couch..."
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />

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

function TicketStub({ ticket, onOpen, index }) {
  const last = ticket.viewings[ticket.viewings.length - 1];
  return (
    <button className="stub" onClick={() => onOpen(ticket)}>
      <div className="stub-num">No. {String(index + 1).padStart(4, "0")}</div>
      <div className="stub-poster">
        {ticket.posterPath ? (
          <img src={tmdbImg(ticket.posterPath, "w342")} alt="" loading="lazy" />
        ) : (
          <div className="stub-poster-fallback">
            {ticket.mediaType === "tv" ? <Tv size={28} /> : <Film size={28} />}
          </div>
        )}
        <div className="stub-perf" />
      </div>
      <div className="stub-tab">
        <div className="stub-title">{ticket.title}</div>
        <Stars value={last.rating} size={13} />
        {ticket.viewings.length > 1 && <div className="stub-rewatch">{ticket.viewings.length}x watched</div>}
      </div>
      <span className="stub-shine" />
    </button>
  );
}

/* ---------------------------------------------------------
   TICKET DETAIL, flip card with history, edit, undo
--------------------------------------------------------- */

function TicketDetail({ ticket, onClose, onUpdate, onDelete }) {
  const [flipped, setFlipped] = useState(false);
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
              Turn ticket over <ChevronRight size={14} />
            </button>
          </div>
          <div className="flip-back">
            <button className="btn btn-ghost flip-hint flip-hint-back" onClick={() => setFlipped(false)}>
              <ChevronLeft size={14} /> Back to poster
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
   COLLECTION TAB
--------------------------------------------------------- */

function CollectionView({ collection, watchlist, onUpdateTicket, onDeleteTicket, onLogFromWatchlist }) {
  const [open, setOpen] = useState(null);
  const [showWatchlist, setShowWatchlist] = useState(false);

  if (open) {
    return (
      <TicketDetail
        ticket={open}
        onClose={() => setOpen(null)}
        onUpdate={(t) => {
          onUpdateTicket(t);
          setOpen(t);
        }}
        onDelete={(id) => {
          onDeleteTicket(id);
          setOpen(null);
        }}
      />
    );
  }

  return (
    <div className="view">
      <div className="view-toggle">
        <button className={!showWatchlist ? "toggle-pill active" : "toggle-pill"} onClick={() => setShowWatchlist(false)}>
          Collected ({collection.length})
        </button>
        <button className={showWatchlist ? "toggle-pill active" : "toggle-pill"} onClick={() => setShowWatchlist(true)}>
          Want to see ({watchlist.length})
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
          <div className="stub-grid">
            {collection
              .slice()
              .sort((a, b) => {
                const aLast = a.viewings[a.viewings.length - 1].date;
                const bLast = b.viewings[b.viewings.length - 1].date;
                return aLast < bLast ? 1 : -1;
              })
              .map((t, i) => (
                <TicketStub ticket={t} index={i} key={t.id} onOpen={setOpen} />
              ))}
          </div>
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
                {w.posterPath ? (
                  <img src={tmdbImg(w.posterPath, "w154")} alt="" className="watch-thumb" />
                ) : (
                  <div className="watch-thumb watch-thumb-fallback">
                    {w.mediaType === "tv" ? <Tv size={18} /> : <Film size={18} />}
                  </div>
                )}
                <div className="watch-info">
                  <div className="watch-title">{w.title}</div>
                  <div className="watch-sub">{w.year}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => onLogFromWatchlist(w)}>
                  <Check size={14} /> Watched it
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

function SwipeCard({ item, onSkip, onWant, onSeen }) {
  const [drag, setDrag] = useState({ x: 0, active: false });
  const startX = useRef(0);

  function down(e) {
    startX.current = e.touches ? e.touches[0].clientX : e.clientX;
    setDrag({ x: 0, active: true });
  }
  function move(e) {
    if (!drag.active) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - startX.current;
    setDrag({ x, active: true });
  }
  function up() {
    if (drag.x > 100) onWant();
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
      {drag.x > 40 && <div className="swipe-flag swipe-flag-want">WANT TO SEE</div>}
      {drag.x < -40 && <div className="swipe-flag swipe-flag-skip">SKIP</div>}
      {item.posterPath ? (
        <img src={tmdbImg(item.posterPath, "w500")} alt="" className="swipe-poster" draggable={false} />
      ) : (
        <div className="swipe-poster swipe-poster-fallback">
          {item.mediaType === "tv" ? <Tv size={40} /> : <Film size={40} />}
        </div>
      )}
      <div className="swipe-meta">
        <div className="swipe-title">{item.title} {item.year ? `(${item.year})` : ""}</div>
        <div className="swipe-genres">{genreNames(item.genreIds, item.mediaType).slice(0, 3).join(" · ") || (item.mediaType === "tv" ? "TV series" : "Film")}</div>
      </div>
      <div className="swipe-buttons">
        <button className="round-btn round-btn-skip" onClick={onSkip} aria-label="Skip">
          <X size={22} />
        </button>
        <button className="round-btn round-btn-seen" onClick={onSeen} aria-label="Already seen it">
          <Eye size={20} />
        </button>
        <button className="round-btn round-btn-want" onClick={onWant} aria-label="Want to see">
          <Heart size={22} />
        </button>
      </div>
    </div>
  );
}

function DiscoverView({ tmdb, feedback, setFeedback, onAddToWatchlist, onLogNew }) {
  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingLog, setPendingLog] = useState(null);

  const seenIdSet = useMemo(
    () => new Set([...feedback.skippedIds, ...feedback.wantedIds, ...feedback.seenIds].map((x) => x.tmdbId + x.mediaType)),
    [feedback]
  );

  const loadPool = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pages = await Promise.all([tmdb.trendingWeek(), tmdb.popularMovies(2), tmdb.popularTv(2)]);
      const all = pages.flatMap((p) => p.results || []).map(normalize);
      const fresh = all.filter((a) => !seenIdSet.has(a.tmdbId + a.mediaType));
      const dedup = Array.from(new Map(fresh.map((f) => [f.tmdbId + f.mediaType, f])).values());
      setPool(dedup);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [tmdb, seenIdSet]);

  useEffect(() => {
    loadPool();
    // eslint-disable-next-line
  }, []);

  function recordFeedback(bucket, item) {
    setFeedback((f) => ({ ...f, [bucket]: [...f[bucket], { tmdbId: item.tmdbId, mediaType: item.mediaType, genreIds: item.genreIds }] }));
  }

  function advance() {
    setPool((p) => p.slice(1));
  }

  function skip(item) {
    recordFeedback("skippedIds", item);
    advance();
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

  const current = pool[0];

  return (
    <div className="view view-discover">
      {pendingLog && (
        <Modal onClose={() => setPendingLog(null)}>
          <h3 className="modal-title">{pendingLog.title}</h3>
          <LogForm
            saveLabel="Add to collection"
            onCancel={() => setPendingLog(null)}
            onSave={(entry) => {
              onLogNew(pendingLog, entry);
              setPendingLog(null);
              advance();
            }}
          />
        </Modal>
      )}

      {loading && <EmptyState icon={<RefreshCw size={32} className="spin" />} title="Shuffling the deck" body="Pulling fresh titles you haven't seen yet." />}

      {!loading && error && (
        <EmptyState
          icon={<Info size={32} />}
          title="Couldn't load new titles"
          body={`TMDB said: ${error}. Check your API key in settings, then tap refresh.`}
        />
      )}

      {!loading && !error && !current && (
        <EmptyState icon={<Sparkles size={32} />} title="That's everything for now" body="You've been through the current pool. Refresh for another batch." />
      )}

      {!loading && current && (
        <div className="swipe-stack">
          <SwipeCard item={current} onSkip={() => skip(current)} onWant={() => want(current)} onSeen={() => seen(current)} />
        </div>
      )}

      <button className="btn btn-ghost refresh-btn" onClick={loadPool}>
        <RefreshCw size={14} /> Refresh deck
      </button>
    </div>
  );
}

/* ---------------------------------------------------------
   FOR YOU TAB
--------------------------------------------------------- */

function SuggestionRow({ item, settings, onAddToWatchlist, onLogNew }) {
  const [logging, setLogging] = useState(false);
  const [providers, setProviders] = useState(null);

  return (
    <div className="suggest-row">
      {item.posterPath ? (
        <img src={tmdbImg(item.posterPath, "w154")} alt="" className="suggest-thumb" />
      ) : (
        <div className="suggest-thumb suggest-thumb-fallback">{item.mediaType === "tv" ? <Tv size={18} /> : <Film size={18} />}</div>
      )}
      <div className="suggest-info">
        <div className="suggest-title">{item.title} {item.year ? `· ${item.year}` : ""}</div>
        <div className="suggest-genres">{genreNames(item.genreIds, item.mediaType).slice(0, 3).join(" · ")}</div>
        <div className="suggest-links">
          <a className="link-pill" href={buildAmcLink(item.title, settings.zip)} target="_blank" rel="noreferrer">AMC</a>
          <a className="link-pill" href={buildRegalLink(item.title, settings.zip)} target="_blank" rel="noreferrer">Regal</a>
          <a className="link-pill" href={buildFandangoLink(item.title, settings.zip)} target="_blank" rel="noreferrer">Fandango</a>
          <a className="link-pill" href={buildRedditLink(item.title)} target="_blank" rel="noreferrer">Reddit</a>
        </div>
      </div>
      <div className="suggest-actions">
        <button className="icon-btn" onClick={() => onAddToWatchlist(item)} aria-label="Want to see"><Heart size={16} /></button>
        <button className="icon-btn" onClick={() => setLogging(true)} aria-label="Seen it"><Eye size={16} /></button>
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

function ForYouView({ tmdb, taste, settings, collection, watchlist, onAddToWatchlist, onLogNew }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const topGenres = useMemo(
    () => Object.entries(taste).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g).join(","),
    [taste]
  );

  const excludeSet = useMemo(
    () => new Set([...collection.map((c) => c.tmdbId + c.mediaType), ...watchlist.map((w) => w.tmdbId + w.mediaType)]),
    [collection, watchlist]
  );

  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const params = topGenres ? { with_genres: topGenres, sort_by: "popularity.desc" } : { sort_by: "popularity.desc" };
        const [m, t] = await Promise.all([tmdb.discoverMovie(params), tmdb.discoverTv(params)]);
        const all = [...(m.results || []), ...(t.results || [])].map(normalize).filter((x) => !excludeSet.has(x.tmdbId + x.mediaType));
        const scored = all.map((x) => ({ ...x, score: scoreItem(x, taste) })).sort((a, b) => b.score - a.score);
        if (active) setItems(scored.slice(0, 20));
      } catch (e) {
        if (active) setError(e.message);
      }
      if (active) setLoading(false);
    }
    run();
    return () => { active = false; };
    // eslint-disable-next-line
  }, [topGenres]);

  const hasTaste = Object.keys(taste).length > 0;

  return (
    <div className="view">
      {!hasTaste && (
        <div className="hint-banner">
          <Sparkles size={14} /> Log a few ratings or swipe through Discover and this list gets sharper.
        </div>
      )}
      {loading && <EmptyState icon={<RefreshCw size={32} className="spin" />} title="Reading your taste" body="Matching genres against what you've rated highly." />}
      {!loading && error && <EmptyState icon={<Info size={32} />} title="Couldn't load suggestions" body={`TMDB said: ${error}`} />}
      {!loading && !error && (
        <div className="suggest-list">
          {items.map((item) => (
            <SuggestionRow key={item.tmdbId + item.mediaType} item={item} settings={settings} onAddToWatchlist={onAddToWatchlist} onLogNew={onLogNew} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   COMING SOON TAB
--------------------------------------------------------- */

function ComingSoonView({ tmdb, settings, onAddToWatchlist }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState({});

  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await tmdb.upcoming();
        const sorted = (data.results || [])
          .map(normalize)
          .map((x, i) => ({ ...x, releaseDate: data.results[i].release_date }))
          .filter((x) => x.releaseDate)
          .sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : 1));
        if (active) setItems(sorted);
      } catch (e) {
        if (active) setError(e.message);
      }
      if (active) setLoading(false);
    }
    run();
    return () => { active = false; };
  }, []);

  function daysOut(dateStr) {
    const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
    if (diff <= 0) return "Out now";
    if (diff === 1) return "Tomorrow";
    if (diff <= 7) return `In ${diff} days`;
    return formatDate(dateStr);
  }

  return (
    <div className="view">
      {loading && <EmptyState icon={<RefreshCw size={32} className="spin" />} title="Checking the calendar" body="Pulling what's headed to theaters." />}
      {!loading && error && <EmptyState icon={<Info size={32} />} title="Couldn't load release dates" body={`TMDB said: ${error}`} />}
      {!loading && !error && (
        <div className="coming-list">
          {items.map((item) => (
            <div className="coming-row" key={item.tmdbId}>
              {item.posterPath ? (
                <img src={tmdbImg(item.posterPath, "w154")} alt="" className="coming-thumb" />
              ) : (
                <div className="coming-thumb coming-thumb-fallback"><Film size={18} /></div>
              )}
              <div className="coming-info">
                <div className="coming-title">{item.title}</div>
                <div className="coming-date">{daysOut(item.releaseDate)}</div>
                <div className="suggest-links">
                  <a className="link-pill" href={buildAmcLink(item.title, settings.zip)} target="_blank" rel="noreferrer">AMC</a>
                  <a className="link-pill" href={buildFandangoLink(item.title, settings.zip)} target="_blank" rel="noreferrer">Fandango</a>
                </div>
              </div>
              <button
                className={"icon-btn" + (added[item.tmdbId] ? " icon-btn-active" : "")}
                onClick={() => { onAddToWatchlist(item); setAdded((a) => ({ ...a, [item.tmdbId]: true })); }}
                aria-label="Add to watchlist"
              >
                <Heart size={16} />
              </button>
            </div>
          ))}
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
              {item.posterPath ? (
                <img src={tmdbImg(item.posterPath, "w154")} alt="" className="suggest-thumb" />
              ) : (
                <div className="suggest-thumb suggest-thumb-fallback">{item.mediaType === "tv" ? <Tv size={18} /> : <Film size={18} />}</div>
              )}
              <div className="suggest-info">
                <div className="suggest-title">{item.title} {item.year ? `· ${item.year}` : ""}</div>
                <div className="suggest-genres">{genreNames(item.genreIds, item.mediaType).slice(0, 3).join(" · ")}</div>
              </div>
              <div className="suggest-actions">
                <button className="icon-btn" onClick={() => onAddToWatchlist(item)} aria-label="Want to see"><Heart size={16} /></button>
                <button className="icon-btn" onClick={() => setLogging(item)} aria-label="Seen it"><Eye size={16} /></button>
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
            onSave({ tmdbKey, omdbKey, zip, country: settings.country });
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
        <h1 className="onboarding-title">Welcome to Stub</h1>
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
  { id: "foryou", label: "For You", icon: Clapperboard },
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

  function addToWatchlist(item) {
    setWatchlist((w) => {
      if (w.find((x) => x.tmdbId === item.tmdbId && x.mediaType === item.mediaType)) return w;
      return [...w, { ...item, addedAt: Date.now() }];
    });
  }

  function logNew(item, viewing) {
    const ticket = {
      id: uid(),
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      title: item.title,
      year: item.year,
      posterPath: item.posterPath,
      genreIds: item.genreIds,
      viewings: [viewing],
      log: [{ at: Date.now(), text: "Added to your collection" }],
      history: []
    };
    setCollection((c) => [...c, ticket]);
    setWatchlist((w) => w.filter((x) => !(x.tmdbId === item.tmdbId && x.mediaType === item.mediaType)));
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
      <header className="app-header">
        <div className="wordmark">STUB<span className="wordmark-dot">.</span></div>
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
            onUpdateTicket={updateTicket}
            onDeleteTicket={deleteTicket}
            onLogFromWatchlist={logFromWatchlist}
          />
        )}
        {tab === "discover" && (
          <DiscoverView tmdb={tmdb} feedback={feedback} setFeedback={setFeedback} onAddToWatchlist={addToWatchlist} onLogNew={logNew} />
        )}
        {tab === "foryou" && (
          <ForYouView tmdb={tmdb} taste={taste} settings={settings} collection={collection} watchlist={watchlist} onAddToWatchlist={addToWatchlist} onLogNew={logNew} />
        )}
        {tab === "soon" && <ComingSoonView tmdb={tmdb} settings={settings} onAddToWatchlist={addToWatchlist} />}
        {tab === "search" && <SearchView tmdb={tmdb} onAddToWatchlist={addToWatchlist} onLogNew={logNew} />}
      </main>

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
  --curtain: #150c14;
  --velvet: #271521;
  --velvet-2: #38202f;
  --brass: #c9a24b;
  --brass-bright: #ecd08a;
  --marquee-red: #d6453a;
  --stub-cream: #f1e6cf;
  --ink: #2a1c14;
  --cream-text: #f4ecde;
  --muted: #b39d8a;
  --line: rgba(241,230,207,0.14);
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
button { font-family: inherit; cursor: pointer; }
input, textarea { font-family: inherit; }

.app {
  background: radial-gradient(circle at 50% -10%, #2c1726 0%, var(--curtain) 55%);
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
  padding: 18px 18px 14px;
  position: sticky; top: 0; z-index: 5;
  background: linear-gradient(180deg, var(--curtain) 70%, transparent);
}
.header-right { display: flex; align-items: center; gap: 10px; }
.sync-pill {
  font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--muted); border: 1px solid var(--line); padding: 4px 9px; border-radius: 999px;
}
.sync-pill.sync-on { color: #6fbf73; border-color: rgba(111,191,115,0.4); }
.sync-note { font-size: 12px; color: var(--muted); line-height: 1.45; margin: 4px 0 10px; }
.wordmark {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 28px;
  letter-spacing: 0.06em;
  color: var(--brass);
  text-shadow: 0 0 18px rgba(201,162,75,0.35);
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
.tab-btn.active { color: var(--brass-bright); background: rgba(201,162,75,0.1); }

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
  background: rgba(201,162,75,0.12); border: 1px solid rgba(201,162,75,0.3);
  color: var(--brass-bright); font-size: 12.5px; padding: 10px 12px; border-radius: 10px; margin-bottom: 14px;
}

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
.stub-rewatch { font-family: 'Space Mono', monospace; font-size: 9.5px; color: var(--marquee-red); margin-top: 3px; }
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
  touch-action: none; user-select: none; box-shadow: 0 10px 30px rgba(0,0,0,0.4);
}
.swipe-poster { width: 100%; aspect-ratio: 2/3; object-fit: cover; display: block; }
.swipe-poster-fallback { display: flex; align-items: center; justify-content: center; color: var(--brass); background: var(--velvet-2); }
.swipe-meta { padding: 14px 14px 6px; }
.swipe-title { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
.swipe-genres { color: var(--muted); font-size: 12px; }
.swipe-buttons { display: flex; justify-content: center; gap: 16px; padding: 14px 0 18px; }
.round-btn { width: 50px; height: 50px; border-radius: 50%; border: none; display: flex; align-items: center; justify-content: center; }
.round-btn-skip { background: var(--velvet-2); color: #e98b85; }
.round-btn-seen { background: var(--velvet-2); color: var(--brass-bright); width: 42px; height: 42px; }
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

@media (prefers-reduced-motion: reduce) {
  .stub-shine, .spin, .flip-stage { animation: none !important; transition: none !important; }
}
`;

/* ---------------------------------------------------------
   MOUNT
--------------------------------------------------------- */

createRoot(document.getElementById("root")).render(<App />);
