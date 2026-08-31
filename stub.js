import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Ticket, Search, Sparkles, CalendarDays, Settings, X, Star, Pencil, Undo2, Trash2, Plus, Check, Heart, ChevronLeft, ChevronRight, Eye, Clapperboard, MapPin, Tv, Film, RefreshCw, ExternalLink, Info, Bookmark, Camera, Download, Upload } from "lucide-react";

/* ---------------------------------------------------------
   CONSTANTS
--------------------------------------------------------- */
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
const MOVIE_GENRES = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western"
};
const TV_GENRES = {
  10759: "Action & Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  10762: "Kids",
  9648: "Mystery",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
  37: "Western"
};
const STORAGE_KEYS = {
  settings: "stub-settings",
  collection: "stub-collection",
  watchlist: "stub-watchlist",
  feedback: "stub-discover-feedback"
};
const DEFAULT_SETTINGS = {
  tmdbKey: "",
  omdbKey: "5f3a67c7",
  zip: "",
  country: "US"
};
const PROXY_URL = "https://watchlist-proxy.xphazemusic.workers.dev";
async function callProxy(body) {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
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
    return raw ? JSON.parse(raw) : {
      supabaseUrl: "https://pmgmtjmilcjrxsalnuxr.supabase.co",
      supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtZ210am1pbGNqcnhzYWxudXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTM1OTEsImV4cCI6MjA5NzcyOTU5MX0.TB-T0_LMG50z_jOfq1LwFWbwiYIvkAkgfPW7WwP5LmA"
    };
  } catch (e) {
    return {
      supabaseUrl: "https://pmgmtjmilcjrxsalnuxr.supabase.co",
      supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtZ210am1pbGNqcnhzYWxudXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTM1OTEsImV4cCI6MjA5NzcyOTU5MX0.TB-T0_LMG50z_jOfq1LwFWbwiYIvkAkgfPW7WwP5LmA"
    };
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
        headers: {
          apikey: conn.supabaseKey,
          Authorization: `Bearer ${conn.supabaseKey}`
        }
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
      body: JSON.stringify({
        id: key,
        value,
        updated_at: new Date().toISOString()
      })
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
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}
function tmdbImg(path, size = "w500") {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
function genreNames(ids, mediaType) {
  const map = mediaType === "tv" ? TV_GENRES : MOVIE_GENRES;
  return (ids || []).map(id => map[id]).filter(Boolean);
}
function buildAmcLink(title, zip) {
  const q = encodeURIComponent(title);
  return zip ? `https://www.amctheatres.com/showtimes/${q}?zip=${encodeURIComponent(zip)}` : `https://www.amctheatres.com/movie-theatres?q=${q}`;
}
function buildRegalLink(title, zip) {
  const q = encodeURIComponent(title);
  return `https://www.regmovies.com/movies/${q}${zip ? `?zip=${encodeURIComponent(zip)}` : ""}`;
}
function buildBelcourtLink(title) {
  return `https://www.belcourt.org/?s=${encodeURIComponent(title)}`;
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
    popularMovies: (page = 1) => call("/movie/popular", {
      page
    }),
    popularTv: (page = 1) => call("/tv/popular", {
      page
    }),
    topRatedMovies: (page = 1) => call("/movie/top_rated", {
      page
    }),
    topRatedTv: (page = 1) => call("/tv/top_rated", {
      page
    }),
    nowPlaying: (page = 1, region = "US") => call("/movie/now_playing", {
      page,
      region
    }),
    upcoming: (page = 1, region = "US") => call("/movie/upcoming", {
      page,
      region
    }),
    onTheAir: (page = 1) => call("/tv/on_the_air", {
      page
    }),
    discoverMovie: params => call("/discover/movie", params),
    discoverTv: params => call("/discover/tv", params),
    searchMulti: query => call("/search/multi", {
      query
    }),
    watchProviders: (mediaType, id) => call(`/${mediaType}/${id}/watch/providers`),
    details: (mediaType, id) => call(`/${mediaType}/${id}`),
    detailsFull: (mediaType, id) => call(`/${mediaType}/${id}`, {
      append_to_response: "credits,keywords"
    }),
    recommendations: (mediaType, id) => call(`/${mediaType}/${id}/recommendations`),
    keywords: (mediaType, id) => call(`/${mediaType}/${id}/keywords`)
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
    backdropPath: item.backdrop_path || null,
    genreIds: item.genre_ids || [],
    voteAverage: item.vote_average ?? null,
    voteCount: item.vote_count ?? 0
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
  const ratingDeltas = {}; // genreId -> {sum, n} for calibration
  const now = Date.now();
  const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
  const bump = (genreIds, amount) => {
    (genreIds || []).forEach(g => {
      weights[g] = (weights[g] || 0) + amount;
    });
  };
  collection.forEach(t => {
    t.viewings.forEach(v => {
      if (!v.rating) return;
      const age = now - (v.loggedAt || now);
      const decay = Math.max(0.35, 1 - age / TWO_YEARS_MS);
      bump(t.genreIds, (v.rating - 5) * decay);
      // track how your ratings compare to TMDB consensus per genre
      if (t.voteAverage != null && (t.voteCount ?? 0) > 50) {
        const yourScore = v.rating; // already on the 0-10 scale
        const delta = yourScore - t.voteAverage;
        (t.genreIds || []).forEach(g => {
          if (!ratingDeltas[g]) ratingDeltas[g] = {
            sum: 0,
            n: 0
          };
          ratingDeltas[g].sum += delta * decay;
          ratingDeltas[g].n += decay;
        });
      }
    });
  });
  (feedback.wantedIds || []).forEach(w => bump(w.genreIds, 1.5));
  (feedback.skippedIds || []).forEach(s => bump(s.genreIds, -1.5));
  const genreCalibration = {};
  Object.entries(ratingDeltas).forEach(([g, d]) => {
    if (d.n > 0) genreCalibration[g] = d.sum / d.n;
  });
  return {
    weights,
    genreCalibration
  };
}
function getWeights(taste) {
  return taste && taste.weights ? taste.weights : taste || {};
}

/* builds weighted maps of the people you gravitate toward,
   pulled from the credits cached on collected tickets */
function buildPeopleProfile(collection) {
  const directors = {};
  const writers = {};
  const actors = {};
  const add = (map, person, amount) => {
    if (!person || !person.id) return;
    if (!map[person.id]) map[person.id] = {
      id: person.id,
      name: person.name,
      score: 0
    };
    map[person.id].score += amount;
  };
  collection.forEach(t => {
    if (!t.credits) return;
    const lastRating = t.viewings.length ? t.viewings[t.viewings.length - 1].rating : 5;
    const amount = lastRating / 2 - 2; // 0.5..3 on the 0-10 scale
    (t.credits.directors || []).forEach(p => add(directors, p, amount));
    (t.credits.writers || []).forEach(p => add(writers, p, amount * 0.8));
    (t.credits.cast || []).slice(0, 5).forEach(p => add(actors, p, amount * 0.5));
  });
  const top = map => Object.values(map).sort((a, b) => b.score - a.score);
  return {
    directors: top(directors),
    writers: top(writers),
    actors: top(actors)
  };
}

/* condense a full TMDB credits payload into just what we store */
function slimCredits(credits) {
  if (!credits) return null;
  const crew = credits.crew || [];
  const directors = crew.filter(c => c.job === "Director").map(c => ({
    id: c.id,
    name: c.name
  }));
  const writers = crew.filter(c => c.department === "Writing" || c.job === "Writer" || c.job === "Screenplay").map(c => ({
    id: c.id,
    name: c.name
  }));
  const producers = crew.filter(c => c.job === "Producer").map(c => ({
    id: c.id,
    name: c.name
  }));
  const cast = (credits.cast || []).slice(0, 8).map(c => ({
    id: c.id,
    name: c.name,
    character: c.character
  }));
  return {
    directors,
    writers,
    producers,
    cast
  };
}
function scoreItem(item, tasteWeights) {
  if (!item.genreIds || !item.genreIds.length) return 0;
  const total = item.genreIds.reduce((sum, g) => sum + (tasteWeights[g] || 0), 0);
  return total / item.genreIds.length;
}

/* continuous red -> amber -> green scale for a match %, so adjacent
   percentages read differently (47% warm, 64% green). neutral sits ~55%. */
function matchStyle(pct) {
  const p = Math.max(30, Math.min(80, pct));
  let hue;
  if (p <= 55) hue = (p - 30) / 25 * 45; // 30% red(0) -> 55% amber(45)
  else hue = 45 + (p - 55) / 25 * 95; // 55% amber(45) -> 80% green(140)
  hue = Math.round(hue);
  return {
    background: `hsl(${hue}, 62%, 42%)`,
    border: `1px solid hsl(${hue}, 70%, 60%)`,
    color: `hsl(${hue}, 88%, 92%)`
  };
}

/* how much does the TMDB crowd average predict HIS ratings? learned from
   his own history - if the crowd never calls his taste, the model discounts it */
function learnCrowdWeight(collection) {
  const pairs = [];
  collection.forEach(t => {
    if (t.voteAverage == null || (t.voteCount ?? 0) < 50) return;
    t.viewings.forEach(v => {
      if (v.rating) pairs.push([t.voteAverage, v.rating]);
    });
  });
  if (pairs.length < 8) return {
    weight: 0.2,
    n: pairs.length
  };
  const mx = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
  const my = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  let cov = 0,
    vx = 0;
  pairs.forEach(([x, y]) => {
    cov += (x - mx) * (y - my);
    vx += (x - mx) * (x - mx);
  });
  const slope = vx > 0 ? cov / vx : 0;
  // slope ~0 (crowd useless for him) -> 0.12 floor; slope >= 2.5 (crowd tracks him) -> 0.45 cap
  const weight = Math.max(0.12, Math.min(0.45, 0.12 + slope / 2.5 * 0.33));
  return {
    weight,
    n: pairs.length
  };
}

/* how strongly does this item connect to the people HE has rated?
   the people profile was always built from his ratings - now it drives the score */
function peopleAffinity(item, people) {
  if (!people || !item.credits) return null;
  const find = (list, id) => (list || []).find(p => p.id === id);
  let best = null;
  (item.credits.directors || []).forEach(d => {
    const p = find(people.directors, d.id);
    if (p && (best === null || p.score > best)) best = p.score;
  });
  (item.credits.writers || []).forEach(w => {
    const p = find(people.writers, w.id);
    if (p && (best === null || p.score > best)) best = p.score;
  });
  (item.credits.cast || []).slice(0, 5).forEach(c => {
    const p = find(people.actors, c.id);
    if (p && (best === null || p.score > best)) best = p.score;
  });
  return best;
}

/* full match computation: his ratings anchor everything.
   people (directors/writers/cast he loves) > genre affinity > crowd average
   (weight learned from his history) + per-genre calibration vs consensus */
function matchMeta(item, taste, people, crowd) {
  const weights = getWeights(taste);
  const gc = taste?.genreCalibration || {};
  const keys = Object.keys(weights);
  if (!keys.length) return {
    pct: null,
    conf: "low"
  };
  const crowdW = crowd && crowd.weight || 0.2;

  // genre affinity (tiebreaker term)
  let genreScore = 50;
  if (item.genreIds && item.genreIds.length) {
    const maxAbs = Math.max(...keys.map(k => Math.abs(weights[k])), 1);
    const raw = scoreItem(item, weights);
    const norm = Math.max(-1, Math.min(1, raw / maxAbs));
    genreScore = Math.round(50 + norm * 49);
  }

  // people affinity (the anchor term)
  const aff = peopleAffinity(item, people);
  let peopleScore = null;
  if (aff != null) {
    const allScores = [...(people.directors || []), ...(people.writers || []), ...(people.actors || [])].map(p => p.score);
    const maxP = Math.max(...allScores.map(Math.abs), 1);
    const norm = Math.max(-1, Math.min(1, aff / maxP));
    peopleScore = Math.round(50 + norm * 49);
  }

  // crowd quality (weight learned, not hardwired)
  let qualityScore = 60;
  if (item.voteAverage != null && (item.voteCount ?? 0) > 50) {
    const clamped = Math.max(4.0, Math.min(9.0, item.voteAverage));
    qualityScore = Math.round((clamped - 4.0) / 5.0 * 100);
  }

  // per-genre calibration vs consensus
  let calibBonus = 0;
  if (item.genreIds && item.genreIds.length) {
    const deltas = item.genreIds.map(g => gc[g]).filter(d => d != null);
    if (deltas.length) {
      const avg = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
      calibBonus = Math.max(-12, Math.min(12, avg * 2));
    }
  }
  let blended, conf;
  if (peopleScore != null) {
    const wPeople = 0.5,
      wGenre = 0.5 - crowdW;
    blended = peopleScore * wPeople + genreScore * wGenre + qualityScore * crowdW + calibBonus;
    conf = "high";
  } else {
    const wGenre = 1 - crowdW;
    blended = genreScore * wGenre + qualityScore * crowdW + calibBonus;
    conf = crowd && crowd.n >= 20 ? "medium" : "low";
  }
  return {
    pct: Math.max(1, Math.min(99, Math.round(blended))),
    conf
  };
}
function matchPercent(item, taste, people, crowd) {
  return matchMeta(item, taste, people, crowd).pct;
}

/* enough signal to start trusting the percentages */
function hasEnoughTaste(collection, feedback) {
  const rated = collection.filter(c => c.viewings.some(v => v.rating)).length;
  const swipes = (feedback.wantedIds || []).length + (feedback.skippedIds || []).length;
  return rated + Math.floor(swipes / 3) >= 5;
}

/* smart badges: surface why something is being recommended,
   tied to the specific people/genres you've rated highly */
function badgesFor(item, people, tasteWeights) {
  const out = [];
  const dirNames = new Set((people.directors || []).slice(0, 8).map(d => d.id));
  const actNames = new Set((people.actors || []).slice(0, 12).map(a => a.id));
  if (item.credits) {
    if ((item.credits.directors || []).some(d => dirNames.has(d.id))) {
      const d = item.credits.directors.find(x => dirNames.has(x.id));
      out.push({
        kind: "director",
        text: `From ${d.name}`
      });
    }
    const sharedActor = (item.credits.cast || []).find(c => actNames.has(c.id));
    if (sharedActor) out.push({
      kind: "actor",
      text: `Stars ${sharedActor.name}`
    });
  }
  return out.slice(0, 2);
}

/* ---------------------------------------------------------
   STARS
--------------------------------------------------------- */

function Stars({
  value = 0,
  onChange,
  size = 18
}) {
  const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return /*#__PURE__*/_jsx("div", {
    className: "stars",
    style: {
      height: size
    },
    children: slots.map(n => {
      const clip = value >= n ? "inset(0 0 0 0)" : value >= n - 0.5 ? "inset(0 50% 0 0)" : "inset(0 100% 0 0)";
      return /*#__PURE__*/_jsxs("div", {
        className: "star-slot",
        style: {
          width: size,
          height: size
        },
        children: [/*#__PURE__*/_jsx(Star, {
          className: "star-bg",
          size: size,
          strokeWidth: 1.5
        }), /*#__PURE__*/_jsx("div", {
          className: "star-fill",
          style: {
            clipPath: clip
          },
          children: /*#__PURE__*/_jsx(Star, {
            className: "star-fg",
            size: size,
            fill: "currentColor",
            strokeWidth: 1.5
          })
        }), onChange && /*#__PURE__*/_jsxs(_Fragment, {
          children: [/*#__PURE__*/_jsx("button", {
            type: "button",
            className: "star-hit star-hit-left",
            "aria-label": `Rate ${n - 0.5} of 10`,
            onClick: () => onChange(n - 0.5)
          }), /*#__PURE__*/_jsx("button", {
            type: "button",
            className: "star-hit star-hit-right",
            "aria-label": `Rate ${n} of 10`,
            onClick: () => onChange(n)
          })]
        })]
      }, n);
    })
  });
}

/* ---------------------------------------------------------
   GENERIC MODAL SHELL
--------------------------------------------------------- */

function Modal({
  onClose,
  children,
  wide
}) {
  return /*#__PURE__*/_jsx("div", {
    className: "modal-veil",
    onClick: onClose,
    children: /*#__PURE__*/_jsxs("div", {
      className: "modal-card" + (wide ? " modal-wide" : ""),
      onClick: e => e.stopPropagation(),
      children: [/*#__PURE__*/_jsx("button", {
        className: "modal-close",
        onClick: onClose,
        "aria-label": "Close",
        children: /*#__PURE__*/_jsx(X, {
          size: 18
        })
      }), children]
    })
  });
}

/* ---------------------------------------------------------
   DETAIL MODAL
   full info for any title: synopsis, cast, director,
   producer, release date, plus the recommendation badges
--------------------------------------------------------- */

function DetailModal({
  item,
  tmdb,
  badges,
  settings,
  onClose,
  onAddToWatchlist,
  onLogNew,
  redditAfter
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [logging, setLogging] = useState(false);
  const {
    imdb,
    providers
  } = useExtraInfo(item, settings || {}, tmdb);
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
    return () => {
      active = false;
    };
  }, [item.tmdbId, item.mediaType]);
  const slim = data ? slimCredits(data.credits) : null;
  const director = slim && slim.directors[0];
  const producer = slim && slim.producers[0];
  const release = data ? data.release_date || data.first_air_date || "" : item.year;
  const runtime = data ? data.runtime || data.episode_run_time && data.episode_run_time[0] : null;
  const keywords = data ? data.keywords?.keywords || data.keywords?.results || [] : [];
  return /*#__PURE__*/_jsx(Modal, {
    onClose: onClose,
    wide: true,
    children: /*#__PURE__*/_jsxs("div", {
      className: "detail-modal",
      children: [/*#__PURE__*/_jsxs("div", {
        className: "detail-head",
        children: [item.posterPath ? /*#__PURE__*/_jsx("img", {
          src: tmdbImg(item.posterPath, "w342"),
          alt: "",
          className: "detail-head-poster"
        }) : /*#__PURE__*/_jsx("div", {
          className: "detail-head-poster detail-poster-fallback",
          children: item.mediaType === "tv" ? /*#__PURE__*/_jsx(Tv, {
            size: 36
          }) : /*#__PURE__*/_jsx(Film, {
            size: 36
          })
        }), /*#__PURE__*/_jsxs("div", {
          className: "detail-head-info",
          children: [/*#__PURE__*/_jsx("h2", {
            className: "detail-title",
            children: item.title
          }), /*#__PURE__*/_jsx("div", {
            className: "detail-genres",
            children: genreNames(item.genreIds, item.mediaType).join(" · ") || (item.mediaType === "tv" ? "TV" : "Film")
          }), badges && badges.length > 0 && /*#__PURE__*/_jsx("div", {
            className: "badge-row",
            children: badges.map((b, i) => /*#__PURE__*/_jsx("span", {
              className: "badge badge-" + b.kind,
              children: b.text
            }, i))
          })]
        })]
      }), loading && /*#__PURE__*/_jsxs("div", {
        className: "detail-loading",
        children: [/*#__PURE__*/_jsx(RefreshCw, {
          size: 20,
          className: "spin"
        }), " Loading details"]
      }), err && /*#__PURE__*/_jsxs("div", {
        className: "detail-loading",
        children: ["Couldn't load full details (", err, ")."]
      }), data && /*#__PURE__*/_jsxs("div", {
        className: "detail-body",
        children: [/*#__PURE__*/_jsxs("div", {
          className: "detail-facts",
          children: [release && /*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsx("span", {
              children: "Release"
            }), formatDate(release.slice(0, 10)) || release]
          }), director && /*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsx("span", {
              children: "Director"
            }), director.name]
          }), producer && /*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsx("span", {
              children: "Producer"
            }), producer.name]
          })]
        }), slim && slim.cast.length > 0 && /*#__PURE__*/_jsxs("div", {
          className: "detail-cast",
          children: [/*#__PURE__*/_jsx("div", {
            className: "detail-cast-label",
            children: "Cast"
          }), /*#__PURE__*/_jsx("div", {
            className: "detail-cast-list",
            children: slim.cast.slice(0, 6).map(c => /*#__PURE__*/_jsx("span", {
              className: "cast-chip",
              children: c.name
            }, c.id))
          })]
        }), providers && /*#__PURE__*/_jsxs("div", {
          className: "detail-cast",
          children: [/*#__PURE__*/_jsx("div", {
            className: "detail-cast-label",
            children: "Where to watch"
          }), /*#__PURE__*/_jsx("div", {
            className: "suggest-links",
            children: providers.names.map(name => /*#__PURE__*/_jsx("a", {
              className: "link-pill link-pill-stream",
              href: providers.link,
              target: "_blank",
              rel: "noreferrer",
              children: name
            }, name))
          })]
        })]
      }), /*#__PURE__*/_jsxs("div", {
        className: "detail-actions",
        children: [onAddToWatchlist && /*#__PURE__*/_jsxs("button", {
          className: "btn btn-outline btn-sm",
          onClick: () => {
            onAddToWatchlist(item);
            onClose();
          },
          children: [/*#__PURE__*/_jsx(Eye, {
            size: 14
          }), " Wishlist"]
        }), onLogNew && /*#__PURE__*/_jsxs("button", {
          className: "btn btn-primary btn-sm",
          onClick: () => setLogging(true),
          children: [/*#__PURE__*/_jsx(Check, {
            size: 14
          }), " Seen it"]
        }), /*#__PURE__*/_jsx("a", {
          className: "btn btn-outline btn-sm",
          href: buildAmcLink(item.title, settings?.zip || ""),
          target: "_blank",
          rel: "noreferrer",
          children: "AMC"
        }), /*#__PURE__*/_jsx("a", {
          className: "btn btn-outline btn-sm",
          href: buildRegalLink(item.title, settings?.zip || ""),
          target: "_blank",
          rel: "noreferrer",
          children: "Regal"
        }), /*#__PURE__*/_jsxs("a", {
          className: "btn btn-outline btn-sm",
          href: buildRedditLink(item.title, item.year),
          target: "_blank",
          rel: "noreferrer",
          children: [/*#__PURE__*/_jsx(ExternalLink, {
            size: 14
          }), " Reddit"]
        })]
      }), logging && /*#__PURE__*/_jsxs(Modal, {
        onClose: () => setLogging(false),
        children: [/*#__PURE__*/_jsx("h3", {
          className: "modal-title",
          children: item.title
        }), /*#__PURE__*/_jsx(LogForm, {
          saveLabel: "Add to collection",
          onCancel: () => setLogging(false),
          onSave: entry => {
            onLogNew(item, entry, slim, {
              runtime,
              keywords
            });
            setLogging(false);
            onClose();
          }
        })]
      })]
    })
  });
}

/* ---------------------------------------------------------
   LOG FORM, used for first viewing, rewatch, and edits
--------------------------------------------------------- */

const WHERE_PRESETS = ["AMC", "Regal", "Belcourt", "Home", "Plane", "Other"];
function LogForm({
  initial,
  onSave,
  onCancel,
  saveLabel
}) {
  const [date, setDate] = useState(initial?.date || todayISO());
  const [dateMode, setDateMode] = useState(initial?.undated ? "anytime" : "exact");
  const [approxYear, setApproxYear] = useState(String(new Date().getFullYear()));
  const initLoc = initial?.location || "";
  const isPreset = WHERE_PRESETS.includes(initLoc);
  const [location, setLocation] = useState(initLoc);
  const [selectedPreset, setSelectedPreset] = useState(isPreset ? initLoc : initLoc ? "Other" : "");
  const [customLoc, setCustomLoc] = useState(!isPreset ? initLoc : "");
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [notes, setNotes] = useState(initial?.notes || "");
  const effectiveDate = dateMode === "anytime" ? null : dateMode === "year" ? `${approxYear}-01-01` : date;
  function pickPreset(p) {
    setSelectedPreset(p);
    if (p !== "Other") setLocation(p);else setLocation(customLoc);
  }
  const yearOptions = [];
  for (let y = new Date().getFullYear(); y >= 1970; y--) yearOptions.push(y);
  return /*#__PURE__*/_jsxs("div", {
    className: "log-form",
    children: [/*#__PURE__*/_jsx("label", {
      className: "field-label",
      children: "Date watched"
    }), /*#__PURE__*/_jsxs("div", {
      className: "approx-toggle",
      children: [/*#__PURE__*/_jsx("button", {
        type: "button",
        className: "approx-chip" + (dateMode === "exact" ? " approx-chip-active" : ""),
        onClick: () => setDateMode("exact"),
        children: "Exact date"
      }), /*#__PURE__*/_jsx("button", {
        type: "button",
        className: "approx-chip" + (dateMode === "year" ? " approx-chip-active" : ""),
        onClick: () => setDateMode("year"),
        children: "Just the year"
      }), /*#__PURE__*/_jsx("button", {
        type: "button",
        className: "approx-chip" + (dateMode === "anytime" ? " approx-chip-active" : ""),
        onClick: () => setDateMode("anytime"),
        children: "Anytime"
      })]
    }), dateMode === "exact" ? /*#__PURE__*/_jsxs("div", {
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center"
      },
      children: [/*#__PURE__*/_jsx("input", {
        className: "field-input",
        type: "date",
        value: date,
        onChange: e => setDate(e.target.value),
        style: {
          flex: 1
        }
      }), /*#__PURE__*/_jsx("button", {
        type: "button",
        className: "approx-chip approx-chip-active",
        onClick: () => setDate(todayISO()),
        style: {
          whiteSpace: "nowrap",
          flexShrink: 0
        },
        children: "Today"
      })]
    }) : dateMode === "year" ? /*#__PURE__*/_jsx("select", {
      className: "field-input",
      value: approxYear,
      onChange: e => setApproxYear(e.target.value),
      children: yearOptions.map(y => /*#__PURE__*/_jsx("option", {
        value: y,
        children: y
      }, y))
    }) : /*#__PURE__*/_jsx("div", {
      className: "anytime-hint",
      children: "No specific date. Good for shows you've watched on and off, like a long-running series."
    }), /*#__PURE__*/_jsx("label", {
      className: "field-label",
      children: "Where"
    }), /*#__PURE__*/_jsx("div", {
      className: "where-presets",
      children: WHERE_PRESETS.map(p => /*#__PURE__*/_jsx("button", {
        type: "button",
        className: "where-chip" + (selectedPreset === p ? " where-chip-active" : ""),
        onClick: () => pickPreset(p),
        children: p
      }, p))
    }), selectedPreset === "Other" && /*#__PURE__*/_jsx("input", {
      className: "field-input",
      style: {
        marginTop: 8
      },
      type: "text",
      placeholder: "Where did you watch it?",
      value: customLoc,
      onChange: e => {
        setCustomLoc(e.target.value);
        setLocation(e.target.value);
      }
    }), /*#__PURE__*/_jsx("label", {
      className: "field-label",
      children: "Your rating"
    }), /*#__PURE__*/_jsx(Stars, {
      value: rating,
      onChange: setRating,
      size: 24
    }), /*#__PURE__*/_jsx("label", {
      className: "field-label",
      children: "Notes"
    }), /*#__PURE__*/_jsx("textarea", {
      className: "field-input field-textarea",
      placeholder: "First reaction, what stuck with you, anything you want future-you to remember...",
      value: notes,
      onChange: e => setNotes(e.target.value)
    }), /*#__PURE__*/_jsxs("div", {
      className: "form-actions",
      children: [/*#__PURE__*/_jsx("button", {
        className: "btn btn-ghost",
        onClick: onCancel,
        children: "Cancel"
      }), /*#__PURE__*/_jsx("button", {
        className: "btn btn-primary",
        onClick: () => onSave({
          id: initial?.id || uid(),
          date: effectiveDate,
          undated: dateMode === "anytime",
          location,
          rating,
          notes,
          loggedAt: Date.now()
        }),
        children: saveLabel || "Save"
      })]
    })]
  });
}

/* ---------------------------------------------------------
   TICKET STUB, the collectible card
--------------------------------------------------------- */

function TicketStub({
  ticket,
  onOpen
}) {
  const last = ticket.viewings[ticket.viewings.length - 1];
  return /*#__PURE__*/_jsxs("button", {
    className: "stub",
    onClick: () => onOpen(ticket),
    children: [/*#__PURE__*/_jsxs("div", {
      className: "stub-poster",
      children: [ticket.posterPath ? /*#__PURE__*/_jsx("img", {
        src: tmdbImg(ticket.posterPath, "w342"),
        alt: "",
        loading: "lazy"
      }) : /*#__PURE__*/_jsx("div", {
        className: "stub-poster-fallback",
        children: ticket.mediaType === "tv" ? /*#__PURE__*/_jsx(Tv, {
          size: 28
        }) : /*#__PURE__*/_jsx(Film, {
          size: 28
        })
      }), /*#__PURE__*/_jsx("div", {
        className: "stub-perf"
      })]
    }), /*#__PURE__*/_jsxs("div", {
      className: "stub-tab",
      children: [/*#__PURE__*/_jsxs("div", {
        className: "stub-tab-top",
        children: [/*#__PURE__*/_jsx("div", {
          className: "stub-title",
          children: ticket.title
        }), ticket.viewings.length > 1 && /*#__PURE__*/_jsxs("div", {
          className: "stub-rewatch-inline",
          children: [ticket.viewings.length, "×"]
        })]
      }), /*#__PURE__*/_jsx(Stars, {
        value: last.rating,
        size: 13
      })]
    }), /*#__PURE__*/_jsx("span", {
      className: "stub-shine"
    })]
  });
}

/* ---------------------------------------------------------
   WISHLIST STUB  — grid card for items saved but not watched
---------------------------------------------------------*/

function WatchlistStub({
  item,
  onClick,
  onLog,
  onRemove
}) {
  return /*#__PURE__*/_jsxs("div", {
    className: "stub",
    children: [/*#__PURE__*/_jsx("button", {
      className: "stub-poster-link",
      onClick: onClick,
      "aria-label": item.title,
      children: /*#__PURE__*/_jsxs("div", {
        className: "stub-poster",
        children: [item.posterPath ? /*#__PURE__*/_jsx("img", {
          src: tmdbImg(item.posterPath, "w342"),
          alt: "",
          loading: "lazy"
        }) : /*#__PURE__*/_jsx("div", {
          className: "stub-poster-fallback",
          children: item.mediaType === "tv" ? /*#__PURE__*/_jsx(Tv, {
            size: 28
          }) : /*#__PURE__*/_jsx(Film, {
            size: 28
          })
        }), /*#__PURE__*/_jsx("div", {
          className: "stub-perf"
        })]
      })
    }), /*#__PURE__*/_jsxs("div", {
      className: "stub-tab",
      children: [/*#__PURE__*/_jsx("div", {
        className: "stub-tab-top",
        children: /*#__PURE__*/_jsx("div", {
          className: "stub-title",
          children: item.title
        })
      }), /*#__PURE__*/_jsxs("div", {
        className: "wl-actions",
        children: [/*#__PURE__*/_jsxs("button", {
          className: "wl-watched-btn",
          onClick: e => {
            e.stopPropagation();
            onLog();
          },
          children: [/*#__PURE__*/_jsx(Check, {
            size: 12
          }), " Watched"]
        }), /*#__PURE__*/_jsx("button", {
          className: "wl-remove-btn",
          onClick: e => {
            e.stopPropagation();
            onRemove();
          },
          "aria-label": "Remove",
          children: /*#__PURE__*/_jsx(X, {
            size: 13
          })
        })]
      })]
    }), /*#__PURE__*/_jsx("span", {
      className: "stub-shine"
    })]
  });
}

/* ---------------------------------------------------------
   TICKET DETAIL, flip card with history, edit, undo
--------------------------------------------------------- */

function TicketDetail({
  ticket,
  onClose,
  onUpdate,
  onDelete,
  tmdb,
  settings
}) {
  const [showPoster, setShowPoster] = useState(false);
  const [editingViewingId, setEditingViewingId] = useState(null);
  const [logging, setLogging] = useState(false);
  const [tmdbData, setTmdbData] = useState(null);
  const [omdbData, setOmdbData] = useState(null);
  useEffect(() => {
    if (!tmdb || !ticket.tmdbId) return;
    let active = true;
    tmdb.detailsFull(ticket.mediaType, ticket.tmdbId).then(d => {
      if (active) setTmdbData(d);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [ticket.tmdbId]);
  useEffect(() => {
    if (!settings?.omdbKey || !ticket.title) return;
    let active = true;
    const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(settings.omdbKey)}&t=${encodeURIComponent(ticket.title)}${ticket.year ? `&y=${ticket.year}` : ""}`;
    fetch(url).then(r => r.json()).then(d => {
      if (active && d && d.Response === "True") setOmdbData(d);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [ticket.tmdbId, settings?.omdbKey]);
  const overview = tmdbData?.overview || null;
  const backdrop = ticket.backdropPath || (tmdbData?.backdrop_path ? tmdbData.backdrop_path : null);
  const tdCast = tmdbData?.credits?.cast?.slice(0, 8) || [];
  const tdDirector = tmdbData?.credits?.crew?.find(c => c.job === "Director");
  const tdRelease = tmdbData ? tmdbData.release_date || tmdbData.first_air_date || "" : "";
  const tdRuntime = tmdbData?.runtime || tmdbData?.episode_run_time && tmdbData.episode_run_time[0];
  const tdBoxOffice = omdbData?.BoxOffice;
  const tdImdb = omdbData?.imdbRating;
  function pushHistory(t) {
    const snap = JSON.parse(JSON.stringify({
      viewings: t.viewings,
      log: t.log
    }));
    return [...(t.history || []), snap].slice(-8);
  }
  function withLog(t, text) {
    return {
      ...t,
      log: [...(t.log || []), {
        at: Date.now(),
        text
      }]
    };
  }
  function handleSaveViewing(entry) {
    let t = {
      ...ticket,
      history: pushHistory(ticket)
    };
    const exists = t.viewings.find(v => v.id === entry.id);
    if (exists) {
      t.viewings = t.viewings.map(v => v.id === entry.id ? entry : v);
      t = withLog(t, entry.date ? `Edited the ${formatDate(entry.date)} entry` : "Edited an undated entry");
    } else {
      t.viewings = [...t.viewings, entry];
      t = withLog(t, entry.date ? `Logged a rewatch on ${formatDate(entry.date)}` : "Logged an undated rewatch");
    }
    onUpdate(t);
    setEditingViewingId(null);
    setLogging(false);
  }
  function handleRemoveViewing(id) {
    if (ticket.viewings.length <= 1) return;
    let t = {
      ...ticket,
      history: pushHistory(ticket)
    };
    t.viewings = t.viewings.filter(v => v.id !== id);
    t = withLog(t, "Removed a viewing entry");
    onUpdate(t);
  }
  function handleUndo() {
    if (!ticket.history || !ticket.history.length) return;
    const prev = ticket.history[ticket.history.length - 1];
    const t = {
      ...ticket,
      viewings: prev.viewings,
      log: [...prev.log, {
        at: Date.now(),
        text: "Undid the last change"
      }],
      history: ticket.history.slice(0, -1)
    };
    onUpdate(t);
  }
  return /*#__PURE__*/_jsx(Modal, {
    onClose: onClose,
    wide: true,
    children: /*#__PURE__*/_jsx("div", {
      className: "ticket-detail",
      children: showPoster ? /*#__PURE__*/_jsxs("div", {
        className: "td-poster-view",
        children: [ticket.posterPath ? /*#__PURE__*/_jsx("img", {
          src: tmdbImg(ticket.posterPath, "w500"),
          alt: "",
          className: "detail-poster"
        }) : /*#__PURE__*/_jsx("div", {
          className: "detail-poster detail-poster-fallback",
          children: ticket.mediaType === "tv" ? /*#__PURE__*/_jsx(Tv, {
            size: 48
          }) : /*#__PURE__*/_jsx(Film, {
            size: 48
          })
        }), /*#__PURE__*/_jsxs("button", {
          className: "btn btn-ghost flip-hint",
          onClick: () => setShowPoster(false),
          children: [/*#__PURE__*/_jsx(ChevronLeft, {
            size: 14
          }), " Back to details"]
        })]
      }) : /*#__PURE__*/_jsxs("div", {
        className: "td-back",
        children: [backdrop ? /*#__PURE__*/_jsxs("div", {
          className: "td-hero",
          onClick: () => setShowPoster(true),
          children: [/*#__PURE__*/_jsx("img", {
            src: tmdbImg(backdrop, "w780"),
            alt: "",
            className: "td-hero-img"
          }), /*#__PURE__*/_jsxs("div", {
            className: "td-hero-overlay",
            children: [/*#__PURE__*/_jsx("div", {
              className: "td-hero-title",
              children: ticket.title
            }), /*#__PURE__*/_jsx("div", {
              className: "td-hero-genres",
              children: genreNames(ticket.genreIds, ticket.mediaType).slice(0, 1).join(" · ")
            })]
          })]
        }) : null, /*#__PURE__*/_jsxs("div", {
          className: "td-back-header",
          style: backdrop ? {
            marginTop: 12
          } : {},
          children: [!backdrop && /*#__PURE__*/_jsx("button", {
            className: "td-thumb-btn",
            onClick: () => setShowPoster(true),
            "aria-label": "View poster",
            children: ticket.posterPath ? /*#__PURE__*/_jsx("img", {
              src: tmdbImg(ticket.posterPath, "w185"),
              alt: "",
              className: "td-back-thumb"
            }) : /*#__PURE__*/_jsx("div", {
              className: "td-back-thumb td-thumb-fallback",
              children: ticket.mediaType === "tv" ? /*#__PURE__*/_jsx(Tv, {
                size: 22
              }) : /*#__PURE__*/_jsx(Film, {
                size: 22
              })
            })
          }), /*#__PURE__*/_jsxs("div", {
            className: "td-back-meta",
            children: [!backdrop && /*#__PURE__*/_jsx("h2", {
              className: "td-back-title",
              children: ticket.title
            }), !backdrop && /*#__PURE__*/_jsx("div", {
              className: "td-back-genres",
              children: genreNames(ticket.genreIds, ticket.mediaType).join(" · ") || (ticket.mediaType === "tv" ? "TV" : "Film")
            }), ticket.viewings.length > 1 && /*#__PURE__*/_jsxs("div", {
              className: "td-rewatch-count",
              children: [/*#__PURE__*/_jsx(RefreshCw, {
                size: 12
              }), " Watched ", ticket.viewings.length, "×"]
            })]
          })]
        }), overview && /*#__PURE__*/_jsx("p", {
          className: "td-overview",
          children: overview
        }), (tdRelease || tdRuntime || tdDirector || tdImdb || tdBoxOffice || ticket.voteAverage > 0) && /*#__PURE__*/_jsxs("div", {
          className: "td-stats",
          children: [tdRelease && /*#__PURE__*/_jsxs("div", {
            className: "td-stat",
            children: [/*#__PURE__*/_jsx("span", {
              children: "Released"
            }), formatDate(tdRelease.slice(0, 10)) || tdRelease]
          }), tdRuntime && /*#__PURE__*/_jsxs("div", {
            className: "td-stat",
            children: [/*#__PURE__*/_jsx("span", {
              children: "Runtime"
            }), tdRuntime, " min"]
          }), tdDirector && /*#__PURE__*/_jsxs("div", {
            className: "td-stat",
            children: [/*#__PURE__*/_jsx("span", {
              children: "Director"
            }), tdDirector.name]
          }), tdImdb && tdImdb !== "N/A" && /*#__PURE__*/_jsxs("div", {
            className: "td-stat",
            children: [/*#__PURE__*/_jsx("span", {
              children: "IMDb"
            }), tdImdb, "/10"]
          }), ticket.voteAverage > 0 && /*#__PURE__*/_jsxs("div", {
            className: "td-stat",
            children: [/*#__PURE__*/_jsx("span", {
              children: "TMDB"
            }), ticket.voteAverage.toFixed(1), "/10"]
          }), tdBoxOffice && tdBoxOffice !== "N/A" && /*#__PURE__*/_jsxs("div", {
            className: "td-stat",
            children: [/*#__PURE__*/_jsx("span", {
              children: "Box Office"
            }), tdBoxOffice]
          })]
        }), tdCast.length > 0 && /*#__PURE__*/_jsxs("div", {
          className: "td-cast-section",
          children: [/*#__PURE__*/_jsx("div", {
            className: "td-cast-label",
            children: "Cast"
          }), /*#__PURE__*/_jsx("div", {
            className: "td-cast-list",
            children: tdCast.map(c => /*#__PURE__*/_jsx("span", {
              className: "cast-chip",
              children: c.name
            }, c.id))
          })]
        }), /*#__PURE__*/_jsxs("a", {
          className: "btn btn-outline btn-sm td-reddit-btn",
          href: buildRedditLink(ticket.title, ticket.year),
          target: "_blank",
          rel: "noreferrer",
          children: [/*#__PURE__*/_jsx(ExternalLink, {
            size: 13
          }), " Reddit discussion"]
        }), /*#__PURE__*/_jsxs("div", {
          className: "td-toolbar",
          children: [/*#__PURE__*/_jsxs("button", {
            className: "td-tool-btn",
            disabled: !ticket.history || !ticket.history.length,
            onClick: handleUndo,
            children: [/*#__PURE__*/_jsx(Undo2, {
              size: 14
            }), /*#__PURE__*/_jsx("span", {
              children: "Undo"
            })]
          }), /*#__PURE__*/_jsxs("button", {
            className: "td-tool-btn",
            onClick: () => setLogging(true),
            children: [/*#__PURE__*/_jsx(Plus, {
              size: 14
            }), /*#__PURE__*/_jsx("span", {
              children: "Rewatch"
            })]
          }), /*#__PURE__*/_jsxs("button", {
            className: "td-tool-btn td-tool-danger",
            onClick: () => onDelete(ticket.id),
            children: [/*#__PURE__*/_jsx(Trash2, {
              size: 14
            }), /*#__PURE__*/_jsx("span", {
              children: "Remove"
            })]
          })]
        }), /*#__PURE__*/_jsxs("div", {
          className: "viewing-list",
          children: [ticket.viewings.slice().sort((a, b) => (a.date || "") < (b.date || "") ? 1 : -1).map(v => /*#__PURE__*/_jsx("div", {
            className: "viewing-row",
            children: editingViewingId === v.id ? /*#__PURE__*/_jsx(LogForm, {
              initial: v,
              saveLabel: "Save changes",
              onSave: handleSaveViewing,
              onCancel: () => setEditingViewingId(null)
            }) : /*#__PURE__*/_jsxs(_Fragment, {
              children: [/*#__PURE__*/_jsxs("div", {
                className: "viewing-top",
                children: [/*#__PURE__*/_jsxs("div", {
                  className: "viewing-date",
                  children: [/*#__PURE__*/_jsx(CalendarDays, {
                    size: 12
                  }), " ", v.undated || !v.date ? "Anytime" : formatDate(v.date)]
                }), /*#__PURE__*/_jsx(Stars, {
                  value: v.rating,
                  size: 14
                })]
              }), v.location && /*#__PURE__*/_jsxs("div", {
                className: "viewing-loc",
                children: [/*#__PURE__*/_jsx(MapPin, {
                  size: 12
                }), " ", v.location]
              }), v.notes && /*#__PURE__*/_jsx("div", {
                className: "viewing-notes",
                children: v.notes
              }), /*#__PURE__*/_jsxs("div", {
                className: "viewing-actions",
                children: [/*#__PURE__*/_jsx("button", {
                  className: "icon-btn",
                  onClick: () => setEditingViewingId(v.id),
                  "aria-label": "Edit",
                  children: /*#__PURE__*/_jsx(Pencil, {
                    size: 13
                  })
                }), ticket.viewings.length > 1 && /*#__PURE__*/_jsx("button", {
                  className: "icon-btn",
                  onClick: () => handleRemoveViewing(v.id),
                  "aria-label": "Remove this entry",
                  children: /*#__PURE__*/_jsx(Trash2, {
                    size: 13
                  })
                })]
              })]
            })
          }, v.id)), logging && /*#__PURE__*/_jsxs("div", {
            className: "viewing-row viewing-row-new",
            children: [/*#__PURE__*/_jsx("div", {
              className: "field-label",
              style: {
                marginTop: 0
              },
              children: "New viewing"
            }), /*#__PURE__*/_jsx(LogForm, {
              saveLabel: "Add to ticket",
              onSave: handleSaveViewing,
              onCancel: () => setLogging(false)
            })]
          })]
        })]
      })
    })
  });
}

/* ---------------------------------------------------------
   TICKET SCANNER
   reads an AMC / Regal screenshot with OCR, guesses the
   title + date, finds it on TMDB, prefills the log form.
   OCR is best effort: you can always correct before saving.
--------------------------------------------------------- */

function TicketScanner({
  tmdb,
  onClose,
  onLogNew
}) {
  const [stage, setStage] = useState("upload"); // upload | reading | confirm | manual | error
  const [statusText, setStatusText] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [guessedDate, setGuessedDate] = useState(todayISO());
  const [scanRating, setScanRating] = useState(0);
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
          content: [{
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: base64
            }
          }, {
            type: "text",
            text: 'Look at this theater ticket or purchase confirmation. Find ONLY the movie or show title being purchased. Ignore seat numbers, food orders, prices, theater names, confirmation numbers, and showtimes. The movie title is usually the largest or most prominent text, or appears next to words like "Ticket", "Movie", or a seat row label. Reply with ONLY valid JSON: {"title": "exact movie title", "date": "YYYY-MM-DD or null"}. If you cannot confidently identify the movie title, set title to null.'
          }]
        }]
      });
      const text = data.content?.[0]?.text?.trim() || "";
      let parsed = {};
      try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch {/* ignore parse error, use fallback */}
      const date = parsed.date || todayISO();
      setGuessedDate(date);
      const title = parsed.title;
      if (!title) {
        setStage("manual");
        return;
      }
      setStatusText("Matching to a movie...");
      const res = await tmdb.searchMulti(title);
      const hits = (res.results || []).filter(r => r.media_type === "movie" || r.media_type === "tv").map(normalize);
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
      const hits = (res.results || []).filter(r => r.media_type === "movie" || r.media_type === "tv").map(normalize);
      setCandidates(hits.slice(0, 6));
      setChosen(hits[0] || null);
      setStage("confirm");
    } catch {/* ignore */}
    setManualSearching(false);
  }
  return /*#__PURE__*/_jsxs(Modal, {
    onClose: onClose,
    children: [/*#__PURE__*/_jsx("h3", {
      className: "modal-title",
      children: "Add from ticket"
    }), stage === "upload" && /*#__PURE__*/_jsxs("div", {
      children: [/*#__PURE__*/_jsx("p", {
        className: "sync-note",
        children: "Choose a photo from your Photo Library — a ticket stub, AMC/Regal confirmation, or any image with the movie title. AI reads it automatically."
      }), /*#__PURE__*/_jsxs("button", {
        className: "btn btn-primary",
        style: {
          width: "100%",
          marginTop: 12
        },
        onClick: () => fileRef.current && fileRef.current.click(),
        children: [/*#__PURE__*/_jsx(Camera, {
          size: 16
        }), " Choose from Photos"]
      }), /*#__PURE__*/_jsx("input", {
        ref: fileRef,
        type: "file",
        accept: "image/*",
        style: {
          display: "none"
        },
        onChange: handleFile
      }), /*#__PURE__*/_jsx("button", {
        className: "btn btn-ghost",
        style: {
          width: "100%",
          marginTop: 10
        },
        onClick: () => setStage("manual"),
        children: "Type the title instead"
      })]
    }), stage === "reading" && /*#__PURE__*/_jsxs("div", {
      className: "detail-loading",
      children: [/*#__PURE__*/_jsx(RefreshCw, {
        size: 20,
        className: "spin"
      }), " ", statusText]
    }), stage === "manual" && /*#__PURE__*/_jsxs("div", {
      children: [statusText && /*#__PURE__*/_jsx("p", {
        className: "sync-note",
        style: {
          marginBottom: 10
        },
        children: "Couldn't read the screenshot automatically. Search for the title below."
      }), /*#__PURE__*/_jsxs("div", {
        className: "search-bar",
        style: {
          marginBottom: 10
        },
        children: [/*#__PURE__*/_jsx(Search, {
          size: 15
        }), /*#__PURE__*/_jsx("input", {
          className: "search-input",
          placeholder: "Type movie title...",
          value: manualQuery,
          onChange: e => setManualQuery(e.target.value),
          onKeyDown: e => e.key === "Enter" && runManualSearch(manualQuery),
          autoFocus: true
        })]
      }), /*#__PURE__*/_jsxs("button", {
        className: "btn btn-primary",
        style: {
          width: "100%"
        },
        disabled: manualSearching || !manualQuery.trim(),
        onClick: () => runManualSearch(manualQuery),
        children: [manualSearching ? /*#__PURE__*/_jsx(RefreshCw, {
          size: 14,
          className: "spin"
        }) : /*#__PURE__*/_jsx(Search, {
          size: 14
        }), " Search"]
      })]
    }), stage === "confirm" && /*#__PURE__*/_jsxs("div", {
      children: [candidates.length > 0 ? /*#__PURE__*/_jsxs(_Fragment, {
        children: [/*#__PURE__*/_jsx("label", {
          className: "field-label",
          children: "Which movie?"
        }), /*#__PURE__*/_jsx("div", {
          className: "scan-candidates",
          children: candidates.map(c => /*#__PURE__*/_jsxs("button", {
            className: "scan-cand" + (chosen && chosen.tmdbId === c.tmdbId ? " scan-cand-active" : ""),
            onClick: () => setChosen(c),
            children: [c.posterPath ? /*#__PURE__*/_jsx("img", {
              src: tmdbImg(c.posterPath, "w92"),
              alt: ""
            }) : /*#__PURE__*/_jsx("div", {
              className: "scan-cand-fallback",
              children: /*#__PURE__*/_jsx(Film, {
                size: 16
              })
            }), /*#__PURE__*/_jsxs("span", {
              children: [c.title, " ", c.year ? `(${c.year})` : ""]
            })]
          }, c.tmdbId + c.mediaType))
        })]
      }) : /*#__PURE__*/_jsx("p", {
        className: "sync-note",
        children: "No results. Try a different title."
      }), /*#__PURE__*/_jsx("label", {
        className: "field-label",
        children: "Date watched"
      }), /*#__PURE__*/_jsx("input", {
        className: "field-input",
        type: "date",
        value: guessedDate,
        onChange: e => setGuessedDate(e.target.value)
      }), /*#__PURE__*/_jsxs("label", {
        className: "field-label",
        style: {
          marginTop: 12
        },
        children: ["Your rating ", scanRating ? `(${scanRating}/10)` : "(optional)"]
      }), /*#__PURE__*/_jsx(Stars, {
        value: scanRating,
        onChange: setScanRating,
        size: 24
      }), /*#__PURE__*/_jsxs("div", {
        className: "form-actions",
        children: [/*#__PURE__*/_jsx("button", {
          className: "btn btn-ghost",
          onClick: () => setStage("upload"),
          children: "Back"
        }), /*#__PURE__*/_jsxs("button", {
          className: "btn btn-primary",
          disabled: !chosen,
          onClick: () => {
            if (!chosen) return;
            onLogNew(chosen, {
              id: uid(),
              date: guessedDate,
              location: "",
              rating: scanRating || null,
              notes: "",
              loggedAt: Date.now()
            });
            onClose();
          },
          children: [/*#__PURE__*/_jsx(Check, {
            size: 14
          }), " Add to collection"]
        })]
      })]
    })]
  });
}

/* ---------------------------------------------------------
   COLLECTION TAB
--------------------------------------------------------- */

function CollectionView({
  collection,
  watchlist,
  tmdb,
  taste,
  settings,
  people,
  onUpdateTicket,
  onDeleteTicket,
  onLogFromWatchlist,
  onAddToWatchlist,
  onLogNew,
  onRemoveFromWatchlist,
  onShowYIR
}) {
  const [open, setOpen] = useState(null);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [loggingWl, setLoggingWl] = useState(null);
  const [detail, setDetail] = useState(null);
  const [sort, setSort] = useState("recent");
  const [genreFilter, setGenreFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [wlQuery, setWlQuery] = useState("");
  const [wlGenre, setWlGenre] = useState("all");
  const [wlSort, setWlSort] = useState("added");
  const genreOptions = useMemo(() => {
    const ids = new Set();
    collection.forEach(c => (c.genreIds || []).forEach(g => ids.add(g)));
    return Array.from(ids).map(id => ({
      id,
      name: MOVIE_GENRES[id] || TV_GENRES[id]
    })).filter(x => x.name).sort((a, b) => a.name.localeCompare(b.name));
  }, [collection]);
  const wlGenreOptions = useMemo(() => {
    const ids = new Set();
    (watchlist || []).forEach(w => (w.genreIds || []).forEach(g => ids.add(g)));
    return Array.from(ids).map(id => ({
      id,
      name: MOVIE_GENRES[id] || TV_GENRES[id]
    })).filter(x => x.name).sort((a, b) => a.name.localeCompare(b.name));
  }, [watchlist]);
  const visibleWatchlist = useMemo(() => {
    let list = (watchlist || []).slice();
    const q = wlQuery.trim().toLowerCase();
    if (q) list = list.filter(w => (w.title || "").toLowerCase().includes(q));
    if (wlGenre !== "all") list = list.filter(w => (w.genreIds || []).includes(Number(wlGenre)));
    if (wlSort === "title") list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));else if (wlSort === "year") list.sort((a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")));
    // "added" keeps insertion order (most-recent first as stored)
    return list;
  }, [watchlist, wlQuery, wlGenre, wlSort]);
  const yearOptions = useMemo(() => {
    const years = new Set(collection.map(c => c.year).filter(Boolean));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [collection]);
  const visibleCollection = useMemo(() => {
    let list = collection.slice();
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(c => c.title.toLowerCase().includes(q));
    }
    if (genreFilter !== "all") {
      list = list.filter(c => (c.genreIds || []).includes(Number(genreFilter)));
    }
    if (yearFilter !== "all") {
      list = list.filter(c => c.year === yearFilter);
    }
    const lastDate = t => t.viewings[t.viewings.length - 1].date || "";
    const lastRating = t => t.viewings[t.viewings.length - 1].rating || 0;
    list.sort((a, b) => {
      if (sort === "recent") return lastDate(a) < lastDate(b) ? 1 : -1;
      if (sort === "oldest") return lastDate(a) > lastDate(b) ? 1 : -1;
      if (sort === "highest") return lastRating(b) - lastRating(a);
      if (sort === "lowest") return lastRating(a) - lastRating(b);
      return 0;
    });
    return list;
  }, [collection, query, genreFilter, sort, yearFilter]);
  if (open) {
    return /*#__PURE__*/_jsx(TicketDetail, {
      ticket: open,
      tmdb: tmdb,
      settings: settings,
      onClose: () => setOpen(null),
      onUpdate: t => {
        onUpdateTicket(t);
        setOpen(t);
      },
      onDelete: id => {
        onDeleteTicket(id);
        setOpen(null);
      }
    });
  }
  const showControls = collection.length > 0;
  return /*#__PURE__*/_jsxs("div", {
    className: "view",
    children: [detail && /*#__PURE__*/_jsx(DetailModal, {
      item: detail,
      tmdb: tmdb,
      badges: [],
      settings: settings,
      onClose: () => setDetail(null),
      onAddToWatchlist: null,
      onLogNew: (it, entry, credits) => {
        onLogNew(it, entry, credits);
        onRemoveFromWatchlist(it);
      }
    }), /*#__PURE__*/_jsxs("div", {
      className: "view-toggle",
      children: [/*#__PURE__*/_jsxs("button", {
        className: !showWatchlist ? "toggle-pill active" : "toggle-pill",
        onClick: () => setShowWatchlist(false),
        children: ["Collected (", collection.length, ")"]
      }), /*#__PURE__*/_jsxs("button", {
        className: showWatchlist ? "toggle-pill active" : "toggle-pill",
        onClick: () => setShowWatchlist(true),
        children: ["Wishlist (", watchlist.length, ")"]
      })]
    }), !showWatchlist && (collection.length === 0 ? /*#__PURE__*/_jsx(EmptyState, {
      icon: /*#__PURE__*/_jsx(Ticket, {
        size: 32
      }),
      title: "Your binder is empty",
      body: "Log the next thing you watch and it'll show up here as a ticket stub you can flip open any time."
    }) : /*#__PURE__*/_jsxs(_Fragment, {
      children: [showControls && /*#__PURE__*/_jsxs("div", {
        className: "collection-controls",
        children: [/*#__PURE__*/_jsxs("div", {
          className: "search-bar collection-search",
          children: [/*#__PURE__*/_jsx(Search, {
            size: 15
          }), /*#__PURE__*/_jsx("input", {
            className: "search-input",
            placeholder: "Search your collection",
            value: query,
            onChange: e => setQuery(e.target.value)
          })]
        }), /*#__PURE__*/_jsxs("div", {
          className: "filter-row",
          children: [/*#__PURE__*/_jsxs("select", {
            className: "filter-select",
            value: sort,
            onChange: e => setSort(e.target.value),
            children: [/*#__PURE__*/_jsx("option", {
              value: "recent",
              children: "Recently collected"
            }), /*#__PURE__*/_jsx("option", {
              value: "oldest",
              children: "Oldest first"
            }), /*#__PURE__*/_jsx("option", {
              value: "highest",
              children: "Highest rated"
            }), /*#__PURE__*/_jsx("option", {
              value: "lowest",
              children: "Lowest rated"
            })]
          }), /*#__PURE__*/_jsxs("select", {
            className: "filter-select",
            value: genreFilter,
            onChange: e => setGenreFilter(e.target.value),
            children: [/*#__PURE__*/_jsx("option", {
              value: "all",
              children: "All genres"
            }), genreOptions.map(g => /*#__PURE__*/_jsx("option", {
              value: g.id,
              children: g.name
            }, g.id))]
          }), /*#__PURE__*/_jsxs("select", {
            className: "filter-select",
            value: yearFilter,
            onChange: e => setYearFilter(e.target.value),
            children: [/*#__PURE__*/_jsx("option", {
              value: "all",
              children: "All years"
            }), yearOptions.map(y => /*#__PURE__*/_jsx("option", {
              value: y,
              children: y
            }, y))]
          })]
        })]
      }), visibleCollection.length === 0 ? /*#__PURE__*/_jsx(EmptyState, {
        icon: /*#__PURE__*/_jsx(Search, {
          size: 28
        }),
        title: "No matches",
        body: "Nothing in your collection fits that filter."
      }) : /*#__PURE__*/_jsx("div", {
        className: "stub-grid stub-grid-compact",
        children: visibleCollection.map(t => /*#__PURE__*/_jsx(TicketStub, {
          ticket: t,
          onOpen: setOpen
        }, t.id))
      })]
    })), loggingWl && /*#__PURE__*/_jsxs(Modal, {
      onClose: () => setLoggingWl(null),
      children: [/*#__PURE__*/_jsx("h3", {
        className: "modal-title",
        children: loggingWl.title
      }), /*#__PURE__*/_jsx(LogForm, {
        saveLabel: "Add to collection",
        onCancel: () => setLoggingWl(null),
        onSave: entry => {
          onLogNew(loggingWl, entry);
          setLoggingWl(null);
        }
      })]
    }), showWatchlist && (watchlist.length === 0 ? /*#__PURE__*/_jsx(EmptyState, {
      icon: /*#__PURE__*/_jsx(Heart, {
        size: 32
      }),
      title: "Wishlist is empty",
      body: "Swipe right on something in Discover, or save it from Search, and it'll wait here until you've watched it."
    }) : /*#__PURE__*/_jsxs(_Fragment, {
      children: [/*#__PURE__*/_jsxs("div", {
        className: "collection-controls",
        children: [/*#__PURE__*/_jsxs("div", {
          className: "search-bar collection-search",
          children: [/*#__PURE__*/_jsx(Search, {
            size: 15
          }), /*#__PURE__*/_jsx("input", {
            className: "search-input",
            placeholder: "Search your wishlist",
            value: wlQuery,
            onChange: e => setWlQuery(e.target.value)
          })]
        }), /*#__PURE__*/_jsxs("div", {
          className: "filter-row",
          children: [/*#__PURE__*/_jsxs("select", {
            className: "filter-select",
            value: wlSort,
            onChange: e => setWlSort(e.target.value),
            children: [/*#__PURE__*/_jsx("option", {
              value: "added",
              children: "Recently added"
            }), /*#__PURE__*/_jsx("option", {
              value: "title",
              children: "Title A–Z"
            }), /*#__PURE__*/_jsx("option", {
              value: "year",
              children: "Newest release"
            })]
          }), wlGenreOptions.length > 0 && /*#__PURE__*/_jsxs("select", {
            className: "filter-select",
            value: wlGenre,
            onChange: e => setWlGenre(e.target.value),
            children: [/*#__PURE__*/_jsx("option", {
              value: "all",
              children: "All genres"
            }), wlGenreOptions.map(g => /*#__PURE__*/_jsx("option", {
              value: g.id,
              children: g.name
            }, g.id))]
          })]
        })]
      }), visibleWatchlist.length === 0 ? /*#__PURE__*/_jsx(EmptyState, {
        icon: /*#__PURE__*/_jsx(Search, {
          size: 28
        }),
        title: "No matches",
        body: "Nothing in your wishlist fits that filter."
      }) : /*#__PURE__*/_jsx("div", {
        className: "stub-grid stub-grid-compact",
        children: visibleWatchlist.map(w => /*#__PURE__*/_jsx(WatchlistStub, {
          item: w,
          onClick: () => setDetail(w),
          onLog: () => setLoggingWl(w),
          onRemove: () => onRemoveFromWatchlist(w)
        }, w.tmdbId + w.mediaType))
      })]
    })), /*#__PURE__*/_jsx("div", {
      style: {
        height: "24px"
      }
    })]
  });
}
function EmptyState({
  icon,
  title,
  body
}) {
  return /*#__PURE__*/_jsxs("div", {
    className: "empty-state",
    children: [/*#__PURE__*/_jsx("div", {
      className: "empty-icon",
      children: icon
    }), /*#__PURE__*/_jsx("div", {
      className: "empty-title",
      children: title
    }), /*#__PURE__*/_jsx("div", {
      className: "empty-body",
      children: body
    })]
  });
}

/* ---------------------------------------------------------
   DISCOVER TAB, swipe deck
--------------------------------------------------------- */

function SwipeButtons({
  onSkip,
  onSeen,
  onWant
}) {
  return /*#__PURE__*/_jsxs("div", {
    className: "swipe-buttons",
    children: [/*#__PURE__*/_jsx("button", {
      className: "round-btn round-btn-skip",
      onClick: onSkip,
      "aria-label": "Skip",
      children: /*#__PURE__*/_jsx(X, {
        size: 22
      })
    }), /*#__PURE__*/_jsx("button", {
      className: "round-btn round-btn-seen",
      onClick: onSeen,
      "aria-label": "Already seen it",
      children: /*#__PURE__*/_jsx(Eye, {
        size: 26
      })
    }), /*#__PURE__*/_jsx("button", {
      className: "round-btn round-btn-want",
      onClick: onWant,
      "aria-label": "Save to want-to-see",
      children: /*#__PURE__*/_jsx(Bookmark, {
        size: 20
      })
    })]
  });
}
function MatchRing({
  pct,
  conf
}) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(1, Math.min(99, pct)) / 100);
  return /*#__PURE__*/_jsxs("div", {
    className: "match-ring",
    children: [/*#__PURE__*/_jsxs("svg", {
      width: "72",
      height: "72",
      viewBox: "0 0 72 72",
      children: [/*#__PURE__*/_jsx("circle", {
        cx: "36",
        cy: "36",
        r: r,
        fill: "rgba(15,1,0,0.6)",
        stroke: "rgba(255,245,245,0.16)",
        strokeWidth: "4.5"
      }), /*#__PURE__*/_jsx("circle", {
        cx: "36",
        cy: "36",
        r: r,
        fill: "none",
        stroke: "var(--brass-bright)",
        strokeWidth: "4.5",
        strokeLinecap: "round",
        strokeDasharray: c,
        strokeDashoffset: off,
        transform: "rotate(-90 36 36)",
        className: "match-ring-arc"
      })]
    }), /*#__PURE__*/_jsxs("div", {
      className: "match-ring-label",
      children: [/*#__PURE__*/_jsxs("b", {
        children: [pct, "%"]
      }), /*#__PURE__*/_jsx("span", {
        children: "match"
      })]
    })]
  });
}
function SwipeCard({
  item,
  matchPct,
  matchConf,
  taste,
  collection,
  onSkip,
  onWant,
  onRate,
  onTapInfo
}) {
  const [drag, setDrag] = useState({
    x: 0,
    active: false
  });
  const [flying, setFlying] = useState(null);
  const [flyFrom, setFlyFrom] = useState(0);
  const [choice, setChoice] = useState(null); // null | "choose" | "rate"
  const [rateVal, setRateVal] = useState(0);
  const startX = useRef(0);
  const moved = useRef(false);
  const pendingAction = useRef(null);
  function fly(dir, action) {
    setFlyFrom(drag.x);
    pendingAction.current = action;
    setFlying(dir);
    setDrag({
      x: 0,
      active: false
    });
    setChoice(null);
    setRateVal(0);
  }
  function askChoice() {
    setDrag({
      x: 0,
      active: false
    });
    setChoice("choose");
  }
  function handleAnimEnd(e) {
    if (e.target !== e.currentTarget) return;
    const action = pendingAction.current;
    pendingAction.current = null;
    setFlying(null);
    if (action) action();
  }
  function down(e) {
    if (flying || choice) return;
    startX.current = e.touches ? e.touches[0].clientX : e.clientX;
    moved.current = false;
    setDrag({
      x: 0,
      active: true
    });
  }
  function move(e) {
    if (!drag.active || flying || choice) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - startX.current;
    if (Math.abs(x) > 6) moved.current = true;
    setDrag({
      x,
      active: true
    });
  }
  function up() {
    if (choice) return;
    if (drag.x > 100) {
      askChoice();
      return;
    } // right = seen it / want to watch
    else if (drag.x < -100) {
      fly("left", onSkip);
      return;
    } // left = don't care
    setDrag({
      x: 0,
      active: false
    });
  }
  const rotate = drag.x / 18;
  const dragPct = Math.min(1, Math.abs(drag.x) / 120);
  const dragScale = drag.active && Math.abs(drag.x) > 4 ? 1.015 : 1;
  const flyClass = flying ? ` swipe-fly-${flying}` : "";
  return /*#__PURE__*/_jsxs("div", {
    className: "swipe-card" + flyClass,
    style: flying ? {
      "--fly-from": flyFrom + "px"
    } : {
      transform: `translateX(${drag.x}px) rotate(${rotate}deg) scale(${dragScale})`
    },
    onAnimationEnd: flying ? handleAnimEnd : undefined,
    onMouseDown: down,
    onMouseMove: move,
    onMouseUp: up,
    onMouseLeave: () => drag.active && up(),
    onTouchStart: down,
    onTouchMove: move,
    onTouchEnd: up,
    children: [drag.x !== 0 && !flying && /*#__PURE__*/_jsx("div", {
      className: "swipe-glow " + (drag.x > 0 ? "swipe-glow-want" : "swipe-glow-skip"),
      style: {
        opacity: dragPct * 0.95
      }
    }), drag.x > 0 && /*#__PURE__*/_jsx("div", {
      className: "swipe-flag swipe-flag-want",
      style: {
        opacity: dragPct,
        transform: `rotate(-8deg) scale(${0.55 + dragPct * 0.55})`
      },
      children: "SAVE IT"
    }), drag.x < 0 && /*#__PURE__*/_jsx("div", {
      className: "swipe-flag swipe-flag-skip",
      style: {
        opacity: dragPct,
        transform: `rotate(8deg) scale(${0.55 + dragPct * 0.55})`
      },
      children: "SKIP"
    }), matchPct != null && /*#__PURE__*/_jsx(MatchRing, {
      pct: matchPct,
      conf: matchConf
    }), /*#__PURE__*/_jsx("button", {
      className: "swipe-poster-btn",
      onClick: () => {
        if (!moved.current) onTapInfo();
      },
      "aria-label": "More info",
      children: item.posterPath ? /*#__PURE__*/_jsxs(_Fragment, {
        children: [/*#__PURE__*/_jsx("img", {
          src: tmdbImg(item.posterPath, "w500"),
          alt: "",
          className: "swipe-poster-blur",
          draggable: false
        }), /*#__PURE__*/_jsx("img", {
          src: tmdbImg(item.posterPath, "w500"),
          alt: "",
          className: "swipe-poster",
          draggable: false
        })]
      }) : /*#__PURE__*/_jsx("div", {
        className: "swipe-poster swipe-poster-fallback",
        children: item.mediaType === "tv" ? /*#__PURE__*/_jsx(Tv, {
          size: 40
        }) : /*#__PURE__*/_jsx(Film, {
          size: 40
        })
      })
    }), /*#__PURE__*/_jsxs("div", {
      className: "swipe-meta",
      children: [/*#__PURE__*/_jsx("div", {
        className: "swipe-title",
        children: item.title
      }), /*#__PURE__*/_jsxs("div", {
        className: "swipe-sub",
        children: [item.year ? `${item.year} \u00b7 ` : "", item.mediaType === "tv" ? "TV SHOW" : "MOVIE"]
      }), /*#__PURE__*/_jsxs("div", {
        className: "swipe-perf",
        children: [/*#__PURE__*/_jsx("i", {}), /*#__PURE__*/_jsx("i", {})]
      }), /*#__PURE__*/_jsx(WhyWatch, {
        item: item,
        taste: taste,
        matchPct: matchPct,
        collection: collection
      })]
    }), /*#__PURE__*/_jsx("div", {
      className: "swipe-buttons-wrap",
      children: /*#__PURE__*/_jsx(SwipeButtons, {
        onSkip: () => fly("left", onSkip),
        onSeen: () => setChoice("rate"),
        onWant: askChoice
      })
    }), choice && /*#__PURE__*/_jsx("div", {
      className: "choice-overlay",
      onMouseDown: e => e.stopPropagation(),
      onTouchStart: e => e.stopPropagation(),
      children: choice === "choose" ? /*#__PURE__*/_jsxs(_Fragment, {
        children: [/*#__PURE__*/_jsx("div", {
          className: "choice-title",
          children: item.title
        }), /*#__PURE__*/_jsx("button", {
          className: "choice-btn choice-btn-want",
          onClick: () => fly("right", onWant),
          children: "WANT TO WATCH"
        }), /*#__PURE__*/_jsx("button", {
          className: "choice-btn choice-btn-seen",
          onClick: () => setChoice("rate"),
          children: "I'VE SEEN IT"
        }), /*#__PURE__*/_jsx("button", {
          className: "choice-dismiss",
          onClick: () => setChoice(null),
          children: "not now"
        })]
      }) : /*#__PURE__*/_jsxs(_Fragment, {
        children: [/*#__PURE__*/_jsx("div", {
          className: "choice-title",
          children: "Rate it"
        }), /*#__PURE__*/_jsx("div", {
          className: "choice-stars",
          children: /*#__PURE__*/_jsx(Stars, {
            value: rateVal,
            onChange: setRateVal,
            size: 30
          })
        }), /*#__PURE__*/_jsx("button", {
          className: "choice-btn choice-btn-want",
          disabled: !rateVal,
          style: !rateVal ? {
            opacity: 0.45
          } : undefined,
          onClick: () => rateVal && fly("up", () => onRate(item, {
            id: uid(),
            date: todayISO(),
            undated: false,
            location: "",
            rating: rateVal,
            notes: "",
            loggedAt: Date.now()
          })),
          children: "LOG IT"
        }), /*#__PURE__*/_jsx("button", {
          className: "choice-dismiss",
          onClick: () => setChoice("choose"),
          children: "back"
        })]
      })
    })]
  });
}
function DiscoverView({
  tmdb,
  feedback,
  setFeedback,
  taste,
  people,
  settings,
  collection,
  watchlist,
  onAddToWatchlist,
  onLogNew
}) {
  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [infoItem, setInfoItem] = useState(null);
  const [mode, setMode] = useState("swipe");
  const [lastAction, setLastAction] = useState(null);
  const [skippedPool, setSkippedPool] = useState([]);
  const [justLogged, setJustLogged] = useState(null);
  const [forYouList, setForYouList] = useState([]);
  const [forYouLoading, setForYouLoading] = useState(false);
  const forYouLoadedRef = useRef(false);
  const pageRef = useRef(1);
  const reloadAttemptsRef = useRef(0);
  const servedRef = useRef(new Set());
  const seenIdSet = useMemo(() => new Set([...feedback.skippedIds, ...feedback.wantedIds, ...feedback.seenIds].map(x => x.tmdbId + x.mediaType)), [feedback]);
  const ownedSet = useMemo(() => new Set([...collection.map(c => c.tmdbId + c.mediaType), ...watchlist.map(w => w.tmdbId + w.mediaType)]), [collection, watchlist]);
  const loadPool = useCallback(async (includeSkipped = false) => {
    setLoading(true);
    setError(null);
    try {
      const topGenres = Object.entries(getWeights(taste)).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g).join(",");
      const pageNum = pageRef.current;
      // Balance the deck across languages so no single country's output dominates:
      // English-forward, plus a rotating pair of international languages each load.
      const intlLangs = ["ko", "ja", "fr", "es", "it", "de", "hi", "zh"];
      const langA = intlLangs[pageNum % intlLangs.length];
      const langB = intlLangs[(pageNum + 3) % intlLangs.length];
      const yr = new Date().getFullYear();
      const recentFloor = `${yr - 6}-01-01`; // skew the deck to the last ~6 years
      const freshFloor = `${yr - 2}-01-01`; // plus a heavy dose of the last 2
      // All-time lanes: a rotating decade of acclaimed films (any language) so a
      // great movie from 40 years ago can surface, plus TMDB's all-time top-rated.
      const decades = [1960, 1970, 1980, 1990, 2000, 2010];
      const dec = decades[pageNum % decades.length];
      const calls = [tmdb.trendingWeek(), tmdb.discoverMovie({
        sort_by: "popularity.desc",
        page: pageNum,
        with_original_language: "en",
        "vote_count.gte": 80,
        "primary_release_date.gte": recentFloor
      }), tmdb.discoverMovie({
        sort_by: "vote_average.desc",
        page: pageNum,
        with_original_language: "en",
        "vote_count.gte": 300,
        "primary_release_date.gte": recentFloor
      }), tmdb.discoverMovie({
        sort_by: "popularity.desc",
        page: pageNum,
        with_original_language: "en",
        "vote_count.gte": 50,
        "primary_release_date.gte": freshFloor
      }), tmdb.discoverMovie({
        sort_by: "popularity.desc",
        page: pageNum,
        with_original_language: langA,
        "vote_count.gte": 40,
        "primary_release_date.gte": recentFloor
      }), tmdb.discoverMovie({
        sort_by: "popularity.desc",
        page: pageNum,
        with_original_language: langB,
        "vote_count.gte": 40,
        "primary_release_date.gte": recentFloor
      }), tmdb.popularTv(pageNum), tmdb.nowPlaying(pageNum), tmdb.topRatedMovies(pageNum), tmdb.topRatedTv(pageNum), tmdb.discoverMovie({
        sort_by: "vote_average.desc",
        page: pageNum,
        "vote_count.gte": 300,
        "primary_release_date.gte": `${dec}-01-01`,
        "primary_release_date.lte": `${dec + 9}-12-31`
      })];
      if (topGenres) {
        calls.push(tmdb.discoverMovie({
          with_genres: topGenres,
          sort_by: "popularity.desc",
          page: pageNum,
          with_original_language: "en",
          "primary_release_date.gte": recentFloor
        }));
        calls.push(tmdb.discoverMovie({
          with_genres: topGenres,
          sort_by: "vote_average.desc",
          page: pageNum,
          "vote_count.gte": 200,
          "primary_release_date.gte": recentFloor
        }));
        calls.push(tmdb.discoverTv({
          with_genres: topGenres,
          sort_by: "popularity.desc",
          page: pageNum,
          with_original_language: "en"
        }));
      }
      const pages = await Promise.all(calls);
      const all = pages.flatMap(p => p.results || []).map(normalize);
      // advance paging for next load; wrap back to the start when we run out so the deck never truly ends
      pageRef.current = all.length === 0 || pageNum + 2 > 9 ? 1 : pageNum + 2;
      const skipSet = includeSkipped ? new Set([...feedback.wantedIds, ...feedback.seenIds].map(x => x.tmdbId + x.mediaType)) : seenIdSet;
      const fresh = all.filter(a => !skipSet.has(a.tmdbId + a.mediaType) && !ownedSet.has(a.tmdbId + a.mediaType));
      const dedup = Array.from(new Map(fresh.map(f => [f.tmdbId + f.mediaType, f])).values());
      // don't resurface anything already shown this session; only when we've genuinely
      // run dry do we clear the memory so the deck can loop rather than sit empty
      let unserved = dedup.filter(x => !servedRef.current.has(x.tmdbId + x.mediaType));
      if (unserved.length === 0) {
        servedRef.current.clear();
        unserved = dedup;
      }
      unserved.forEach(x => servedRef.current.add(x.tmdbId + x.mediaType));
      const scored = unserved.map(x => {
        const m = matchMeta(x, taste, people, crowdRef.current);
        return {
          ...x,
          _pct: m.pct,
          _conf: m.conf
        };
      });
      // Fisher-Yates shuffle — truly random deck every load
      for (let i = scored.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [scored[i], scored[j]] = [scored[j], scored[i]];
      }
      setPool(prev => {
        const live = prev.filter(p => !skipSet.has(p.tmdbId + p.mediaType) && !ownedSet.has(p.tmdbId + p.mediaType));
        return [...live, ...scored];
      });
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [tmdb, seenIdSet, ownedSet, taste, feedback]);
  useEffect(() => {
    loadPool();
    // eslint-disable-next-line
  }, []);

  // Keep the deck alive: whenever it empties, pull the next pages (which wrap
  // around when exhausted). Capped so a dead API key can't spin forever.
  useEffect(() => {
    if (loading || error) return;
    if (pool.length > 4) {
      reloadAttemptsRef.current = 0;
      return;
    }
    if (reloadAttemptsRef.current >= 25) return;
    reloadAttemptsRef.current += 1;
    loadPool(true);
    // eslint-disable-next-line
  }, [pool.length, loading, error]);
  const crowdRef = useRef(null);
  if (crowdRef.current === null || crowdRef.current._for !== collection) {
    crowdRef.current = {
      ...learnCrowdWeight(collection),
      _for: collection
    };
  }
  const loadForYouList = useCallback(async () => {
    setForYouLoading(true);
    try {
      const topRated = [...collection].filter(t => t.viewings.some(v => (v.rating || 0) >= 7)).sort((a, b) => {
        const ra = Math.max(...a.viewings.map(v => v.rating || 0));
        const rb = Math.max(...b.viewings.map(v => v.rating || 0));
        return rb - ra;
      }).slice(0, 6);
      if (!topRated.length) {
        setForYouList([]);
      } else {
        const pages = await Promise.all(topRated.map(t => tmdb.recommendations(t.mediaType, t.tmdbId).catch(() => ({
          results: []
        }))));
        const all = pages.flatMap(p => (p.results || []).map(normalize));
        const dedup = Array.from(new Map(all.map(f => [f.tmdbId + f.mediaType, f])).values());
        const fresh = dedup.filter(x => !ownedSet.has(x.tmdbId + x.mediaType) && !seenIdSet.has(x.tmdbId + x.mediaType));
        const scored = fresh.map(x => {
          const m = matchMeta(x, taste, people, crowdRef.current);
          return {
            ...x,
            _pct: m.pct,
            _conf: m.conf
          };
        });
        scored.sort((a, b) => (b._pct || 50) - (a._pct || 50));
        setForYouList(scored.slice(0, 30));
      }
    } catch {
      setForYouList([]);
    }
    setForYouLoading(false);
  }, [collection, tmdb, ownedSet, seenIdSet, taste]);
  useEffect(() => {
    if (mode === "list" && !forYouLoadedRef.current) {
      forYouLoadedRef.current = true;
      loadForYouList();
    }
  }, [mode, loadForYouList]);
  function recordFeedback(bucket, item) {
    setFeedback(f => ({
      ...f,
      [bucket]: [...f[bucket], {
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        genreIds: item.genreIds
      }]
    }));
  }
  function advance() {
    setPool(p => p.slice(1));
  }
  function skip(item) {
    recordFeedback("skippedIds", item);
    setSkippedPool(p => [...p, item]);
    setLastAction({
      type: "skip",
      item
    });
    advance();
  }
  function undoLast() {
    if (!lastAction) return;
    const {
      item
    } = lastAction;
    setFeedback(f => ({
      ...f,
      skippedIds: f.skippedIds.filter(s => !(s.tmdbId === item.tmdbId && s.mediaType === item.mediaType))
    }));
    setSkippedPool(p => p.filter(x => !(x.tmdbId === item.tmdbId && x.mediaType === item.mediaType)));
    setPool(p => [item, ...p]);
    setLastAction(null);
  }
  function replaySkipped() {
    if (!skippedPool.length) return;
    setPool(p => [...skippedPool, ...p]);
    setFeedback(f => ({
      ...f,
      skippedIds: []
    }));
    setSkippedPool([]);
  }
  function want(item) {
    recordFeedback("wantedIds", item);
    onAddToWatchlist(item);
    advance();
  }
  function rateInline(item, entry) {
    onLogNew(item, entry);
    recordFeedback("seenIds", item);
    resolveRedditUrl(item.title, item.year).then(url => {
      setJustLogged({
        title: item.title,
        url
      });
      setTimeout(() => setJustLogged(null), 7000);
    });
    advance();
  }
  const enough = hasEnoughTaste(collection, feedback);
  const current = pool[0];
  return /*#__PURE__*/_jsxs("div", {
    className: "view",
    children: [/*#__PURE__*/_jsxs("div", {
      className: "view-toggle",
      children: [/*#__PURE__*/_jsx("button", {
        className: mode === "swipe" ? "toggle-pill active" : "toggle-pill",
        onClick: () => setMode("swipe"),
        children: "Swipe"
      }), /*#__PURE__*/_jsx("button", {
        className: mode === "list" ? "toggle-pill active" : "toggle-pill",
        onClick: () => setMode("list"),
        children: "For You"
      })]
    }), infoItem && /*#__PURE__*/_jsx(DetailModal, {
      item: infoItem,
      tmdb: tmdb,
      badges: badgesFor(infoItem, people, taste),
      settings: settings,
      onClose: () => setInfoItem(null),
      onAddToWatchlist: it => {
        want(it);
      },
      onLogNew: (it, entry, credits) => {
        onLogNew(it, entry, credits);
        recordFeedback("seenIds", it);
        advance();
      }
    }), mode === "swipe" && /*#__PURE__*/_jsxs("div", {
      className: "view-discover",
      children: [!loading && current && current.posterPath && /*#__PURE__*/_jsxs(_Fragment, {
        children: [/*#__PURE__*/_jsx("div", {
          className: "discover-bg",
          style: {
            backgroundImage: `url(${tmdbImg(current.posterPath, "w500")})`
          }
        }), /*#__PURE__*/_jsx("div", {
          className: "discover-bg discover-bg-b",
          style: {
            backgroundImage: `url(${tmdbImg(current.posterPath, "w500")})`
          }
        })]
      }), loading && !current && /*#__PURE__*/_jsx(EmptyState, {
        icon: /*#__PURE__*/_jsx(RefreshCw, {
          size: 32,
          className: "spin"
        }),
        title: "Shuffling the deck",
        body: "Pulling titles you haven't seen yet."
      }), !loading && error && !current && /*#__PURE__*/_jsx(EmptyState, {
        icon: /*#__PURE__*/_jsx(Info, {
          size: 32
        }),
        title: "Couldn't load new titles",
        body: `TMDB said: ${error}. Check your API key in settings, then reopen the app.`
      }), !loading && !error && !current && /*#__PURE__*/_jsx(EmptyState, {
        icon: /*#__PURE__*/_jsx(Sparkles, {
          size: 32
        }),
        title: "That's everything for now",
        body: "You've been through the pool. Replay your skipped titles to see them again."
      }), current && /*#__PURE__*/_jsx("div", {
        className: "swipe-stack",
        children: /*#__PURE__*/_jsx(SwipeCard, {
          item: current,
          matchPct: enough ? current._pct : null,
          matchConf: enough ? current._conf : null,
          taste: taste,
          collection: collection,
          onSkip: () => skip(current),
          onWant: () => want(current),
          onRate: rateInline,
          onTapInfo: () => setInfoItem(current)
        })
      }), justLogged && /*#__PURE__*/_jsxs("div", {
        className: "logged-toast",
        children: [/*#__PURE__*/_jsx("span", {
          children: "Logged!"
        }), /*#__PURE__*/_jsxs("a", {
          href: justLogged.url,
          target: "_blank",
          rel: "noreferrer",
          onClick: () => setJustLogged(null),
          children: [/*#__PURE__*/_jsx(ExternalLink, {
            size: 12
          }), " Reddit"]
        }), /*#__PURE__*/_jsx("button", {
          className: "toast-close",
          onClick: () => setJustLogged(null),
          children: /*#__PURE__*/_jsx(X, {
            size: 12
          })
        })]
      }), /*#__PURE__*/_jsxs("div", {
        className: "discover-foot discover-foot-bottom",
        children: [lastAction && /*#__PURE__*/_jsxs("button", {
          className: "btn btn-ghost btn-sm",
          onClick: undoLast,
          children: [/*#__PURE__*/_jsx(Undo2, {
            size: 14
          }), " Undo skip"]
        }), skippedPool.length > 0 && /*#__PURE__*/_jsxs("button", {
          className: "btn btn-ghost btn-sm",
          onClick: replaySkipped,
          children: [/*#__PURE__*/_jsx(Undo2, {
            size: 14
          }), " Replay skipped (", skippedPool.length, ")"]
        })]
      })]
    }), mode === "list" && /*#__PURE__*/_jsxs(_Fragment, {
      children: [!enough && /*#__PURE__*/_jsxs("div", {
        className: "hint-banner",
        children: [/*#__PURE__*/_jsx(Sparkles, {
          size: 14
        }), " Rate a few films or swipe through and these match scores sharpen up."]
      }), /*#__PURE__*/_jsx("div", {
        className: "discover-foot",
        style: {
          justifyContent: "flex-end",
          marginTop: 0,
          marginBottom: 10
        },
        children: /*#__PURE__*/_jsxs("button", {
          className: "btn btn-ghost btn-sm",
          onClick: () => {
            forYouLoadedRef.current = false;
            loadForYouList();
          },
          children: [/*#__PURE__*/_jsx(RefreshCw, {
            size: 14
          }), " Refresh list"]
        })
      }), forYouLoading && /*#__PURE__*/_jsx(EmptyState, {
        icon: /*#__PURE__*/_jsx(RefreshCw, {
          size: 32,
          className: "spin"
        }),
        title: "Building your list",
        body: "Finding titles based on what you've rated."
      }), !forYouLoading && forYouList.length === 0 && collection.length === 0 && /*#__PURE__*/_jsx(EmptyState, {
        icon: /*#__PURE__*/_jsx(Heart, {
          size: 32
        }),
        title: "Nothing yet",
        body: "Rate a few films in your collection and this list will fill up."
      }), !forYouLoading && forYouList.length === 0 && collection.length > 0 && /*#__PURE__*/_jsx(EmptyState, {
        icon: /*#__PURE__*/_jsx(Sparkles, {
          size: 32
        }),
        title: "No recommendations yet",
        body: "Rate a few films 7 stars or higher and we'll find you similar ones."
      }), !forYouLoading && forYouList.length > 0 && /*#__PURE__*/_jsx("div", {
        className: "suggest-list",
        children: forYouList.map(item => /*#__PURE__*/_jsx(SuggestionRow, {
          item: item,
          matchPct: enough ? item._pct : null,
          matchConf: enough ? item._conf : null,
          collection: collection,
          taste: taste,
          people: people,
          settings: settings,
          tmdb: tmdb,
          onSkip: it => {
            recordFeedback("skippedIds", it);
            setForYouList(l => l.filter(x => !(x.tmdbId === it.tmdbId && x.mediaType === it.mediaType)));
          },
          onSeen: (it, entry) => {
            onLogNew(it, entry);
            recordFeedback("seenIds", it);
            setForYouList(l => l.filter(x => !(x.tmdbId === it.tmdbId && x.mediaType === it.mediaType)));
          },
          onAddToWatchlist: it => {
            want(it);
            setForYouList(l => l.filter(x => !(x.tmdbId === it.tmdbId && x.mediaType === it.mediaType)));
          },
          onInfo: () => setInfoItem(item)
        }, item.tmdbId + item.mediaType))
      })]
    })]
  });
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
      fetch(url).then(r => r.json()).then(d => {
        if (active && d && d.imdbRating && d.imdbRating !== "N/A") setImdb(d.imdbRating);
      }).catch(() => {});
    }
    tmdb.watchProviders(item.mediaType, item.tmdbId).then(d => {
      if (!active) return;
      const region = (settings.country || "US").toUpperCase();
      const entry = d.results && d.results[region];
      if (entry && entry.flatrate && entry.flatrate.length) {
        setProviders({
          names: entry.flatrate.slice(0, 3).map(p => p.provider_name),
          link: entry.link
        });
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line
  }, [item.tmdbId, item.mediaType, settings.omdbKey, settings.country]);
  return {
    imdb,
    providers
  };
}
function SuggestionRow({
  item,
  matchPct,
  matchConf,
  settings,
  tmdb,
  taste,
  people,
  collection,
  onAddToWatchlist,
  onSkip,
  onSeen,
  onInfo
}) {
  const [expanded, setExpanded] = useState(false);
  const [logging, setLogging] = useState(false);
  const {
    imdb,
    providers
  } = useExtraInfo(item, settings, tmdb);
  const badges = people ? badgesFor(item, people, taste) : [];
  return /*#__PURE__*/_jsxs("div", {
    className: "suggest-row",
    onClick: () => setExpanded(x => !x),
    children: [/*#__PURE__*/_jsx("button", {
      className: "suggest-thumb-btn",
      onClick: e => {
        e.stopPropagation();
        onInfo();
      },
      "aria-label": `Details for ${item.title}`,
      children: item.posterPath ? /*#__PURE__*/_jsx("img", {
        src: tmdbImg(item.posterPath, "w154"),
        alt: "",
        className: "suggest-thumb"
      }) : /*#__PURE__*/_jsx("div", {
        className: "suggest-thumb suggest-thumb-fallback",
        children: item.mediaType === "tv" ? /*#__PURE__*/_jsx(Tv, {
          size: 18
        }) : /*#__PURE__*/_jsx(Film, {
          size: 18
        })
      })
    }), /*#__PURE__*/_jsxs("div", {
      className: "suggest-info",
      children: [/*#__PURE__*/_jsxs("div", {
        className: "suggest-title-row",
        children: [/*#__PURE__*/_jsxs("button", {
          className: "suggest-title-btn",
          onClick: e => {
            e.stopPropagation();
            onInfo();
          },
          children: [item.title, " ", item.year ? `· ${item.year}` : ""]
        }), matchPct != null && /*#__PURE__*/_jsxs("span", {
          className: "match-pill",
          style: matchStyle(matchPct),
          children: [matchPct, "%", matchConf ? ` \u00b7 ${matchConf.toUpperCase()}` : ""]
        })]
      }), /*#__PURE__*/_jsx("div", {
        className: "suggest-genres",
        children: genreNames(item.genreIds, item.mediaType).slice(0, 1).join(" · ")
      }), badges.length > 0 && /*#__PURE__*/_jsx("div", {
        className: "badge-row",
        children: badges.map((b, i) => /*#__PURE__*/_jsx("span", {
          className: "badge badge-" + b.kind,
          children: b.text
        }, i))
      }), item.aiReason && /*#__PURE__*/_jsx("div", {
        className: "why-watch",
        children: item.aiReason
      }), taste && !item.aiReason && /*#__PURE__*/_jsx(WhyWatch, {
        item: item,
        taste: taste,
        matchPct: matchPct,
        collection: collection
      }), expanded && /*#__PURE__*/_jsxs("div", {
        className: "suggest-links",
        onClick: e => e.stopPropagation(),
        children: [providers && providers.names.map(name => /*#__PURE__*/_jsx("a", {
          className: "link-pill link-pill-stream",
          href: providers.link,
          target: "_blank",
          rel: "noreferrer",
          children: name
        }, name)), /*#__PURE__*/_jsx("a", {
          className: "link-pill",
          href: buildAmcLink(item.title, settings.zip),
          target: "_blank",
          rel: "noreferrer",
          children: "AMC"
        }), /*#__PURE__*/_jsx("a", {
          className: "link-pill",
          href: buildRegalLink(item.title, settings.zip),
          target: "_blank",
          rel: "noreferrer",
          children: "Regal"
        }), /*#__PURE__*/_jsx("a", {
          className: "link-pill",
          href: buildRedditLink(item.title, item.year),
          target: "_blank",
          rel: "noreferrer",
          children: "Reddit"
        })]
      })]
    }), /*#__PURE__*/_jsxs("div", {
      className: "suggest-actions",
      onClick: e => e.stopPropagation(),
      children: [onSkip && /*#__PURE__*/_jsx("button", {
        className: "icon-btn",
        onClick: () => onSkip(item),
        "aria-label": "Skip",
        children: /*#__PURE__*/_jsx(X, {
          size: 15
        })
      }), onSeen && /*#__PURE__*/_jsx("button", {
        className: "icon-btn",
        onClick: () => setLogging(true),
        "aria-label": "Mark as seen",
        children: /*#__PURE__*/_jsx(Eye, {
          size: 15
        })
      }), /*#__PURE__*/_jsx("button", {
        className: "icon-btn",
        onClick: () => onAddToWatchlist(item),
        "aria-label": "Save to watchlist",
        children: /*#__PURE__*/_jsx(Bookmark, {
          size: 15
        })
      })]
    }), logging && /*#__PURE__*/_jsxs(Modal, {
      onClose: () => setLogging(false),
      children: [/*#__PURE__*/_jsx("h3", {
        className: "modal-title",
        children: item.title
      }), /*#__PURE__*/_jsx(LogForm, {
        saveLabel: "Add to collection",
        onCancel: () => setLogging(false),
        onSave: entry => {
          onSeen(item, entry);
          setLogging(false);
        }
      })]
    })]
  });
}

/* ---------------------------------------------------------
   FAVORITES TAB
   surfaces the people you gravitate toward, computed from the
   credits cached on the movies you've collected and rated
--------------------------------------------------------- */

function FavoritesView({
  collection,
  people,
  tmdb,
  onUpdateTicket
}) {
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState({
    done: 0,
    total: 0
  });
  const missingCredits = useMemo(() => collection.filter(c => !c.credits), [collection]);
  async function enrich() {
    setEnriching(true);
    setProgress({
      done: 0,
      total: missingCredits.length
    });
    for (let i = 0; i < missingCredits.length; i++) {
      const t = missingCredits[i];
      try {
        const full = await tmdb.detailsFull(t.mediaType, t.tmdbId);
        const slim = slimCredits(full.credits);
        onUpdateTicket({
          ...t,
          credits: slim
        });
      } catch (e) {
        // skip ones that fail, keep going
      }
      setProgress({
        done: i + 1,
        total: missingCredits.length
      });
    }
    setEnriching(false);
  }
  const topMovies = useMemo(() => collection.map(c => ({
    ...c,
    rating: c.viewings[c.viewings.length - 1].rating || 0
  })).sort((a, b) => b.rating - a.rating).slice(0, 6), [collection]);
  if (collection.length === 0) {
    return /*#__PURE__*/_jsx("div", {
      className: "view",
      children: /*#__PURE__*/_jsx(EmptyState, {
        icon: /*#__PURE__*/_jsx(Heart, {
          size: 32
        }),
        title: "No favorites yet",
        body: "Once you collect and rate a few films, this tab learns your go-to directors, writers, and actors."
      })
    });
  }
  const Section = ({
    title,
    list,
    suffix
  }) => list && list.length > 0 ? /*#__PURE__*/_jsxs("div", {
    className: "fav-section",
    children: [/*#__PURE__*/_jsx("div", {
      className: "fav-section-title",
      children: title
    }), /*#__PURE__*/_jsx("div", {
      className: "fav-chips",
      children: list.slice(0, 8).map(p => /*#__PURE__*/_jsxs("span", {
        className: "fav-chip",
        children: [p.name, suffix ? ` ${suffix}` : ""]
      }, p.id))
    })]
  }) : null;
  return /*#__PURE__*/_jsxs("div", {
    className: "view",
    children: [topMovies.length > 0 && /*#__PURE__*/_jsxs("div", {
      className: "fav-section",
      children: [/*#__PURE__*/_jsx("div", {
        className: "fav-section-title",
        children: "Top rated in your collection"
      }), /*#__PURE__*/_jsx("div", {
        className: "fav-poster-row",
        children: topMovies.map(m => /*#__PURE__*/_jsx("div", {
          className: "fav-poster",
          children: m.posterPath ? /*#__PURE__*/_jsx("img", {
            src: tmdbImg(m.posterPath, "w185"),
            alt: m.title
          }) : /*#__PURE__*/_jsx("div", {
            className: "fav-poster-fallback",
            children: m.mediaType === "tv" ? /*#__PURE__*/_jsx(Tv, {
              size: 20
            }) : /*#__PURE__*/_jsx(Film, {
              size: 20
            })
          })
        }, m.id))
      })]
    }), people.directors.length === 0 && people.actors.length === 0 && /*#__PURE__*/_jsxs("div", {
      className: "hint-banner",
      style: {
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8
      },
      children: [/*#__PURE__*/_jsxs("span", {
        children: [/*#__PURE__*/_jsx(Info, {
          size: 14
        }), " To learn your favorite directors and actors, the app needs to pull credits for what you've collected."]
      }), missingCredits.length > 0 && /*#__PURE__*/_jsx("button", {
        className: "btn btn-primary btn-sm",
        onClick: enrich,
        disabled: enriching,
        children: enriching ? `Scanning ${progress.done}/${progress.total}` : `Scan ${missingCredits.length} titles`
      })]
    }), /*#__PURE__*/_jsx(Section, {
      title: "Favorite directors",
      list: people.directors
    }), /*#__PURE__*/_jsx(Section, {
      title: "Favorite writers",
      list: people.writers
    }), /*#__PURE__*/_jsx(Section, {
      title: "Actors you keep watching",
      list: people.actors
    }), (people.directors.length > 0 || people.actors.length > 0) && missingCredits.length > 0 && /*#__PURE__*/_jsx("button", {
      className: "btn btn-outline btn-sm",
      style: {
        marginTop: 8
      },
      onClick: enrich,
      disabled: enriching,
      children: enriching ? `Scanning ${progress.done}/${progress.total}` : `Update from ${missingCredits.length} newer titles`
    })]
  });
}

/* ---------------------------------------------------------
   COMING SOON TAB
--------------------------------------------------------- */

function ComingRow({
  item,
  badges,
  note,
  enough,
  added,
  inWatchlist,
  settings,
  onInfo,
  onSave,
  daysOutText
}) {
  const [expanded, setExpanded] = useState(false);
  return /*#__PURE__*/_jsxs("div", {
    className: "coming-row",
    onClick: () => setExpanded(x => !x),
    children: [/*#__PURE__*/_jsx("button", {
      className: "coming-thumb-btn",
      onClick: e => {
        e.stopPropagation();
        onInfo();
      },
      "aria-label": `Details for ${item.title}`,
      children: item.posterPath ? /*#__PURE__*/_jsx("img", {
        src: tmdbImg(item.posterPath, "w154"),
        alt: "",
        className: "coming-thumb"
      }) : /*#__PURE__*/_jsx("div", {
        className: "coming-thumb coming-thumb-fallback",
        children: /*#__PURE__*/_jsx(Film, {
          size: 18
        })
      })
    }), /*#__PURE__*/_jsxs("div", {
      className: "coming-info",
      children: [/*#__PURE__*/_jsxs("div", {
        className: "suggest-title-row",
        children: [/*#__PURE__*/_jsx("button", {
          className: "suggest-title-btn",
          onClick: e => {
            e.stopPropagation();
            onInfo();
          },
          children: item.title
        }), /*#__PURE__*/_jsxs("div", {
          style: {
            display: "flex",
            gap: 4,
            alignItems: "center",
            flexShrink: 0
          },
          children: [inWatchlist && /*#__PURE__*/_jsx("span", {
            className: "watchlist-badge",
            children: /*#__PURE__*/_jsx(Bookmark, {
              size: 10
            })
          }), enough && item._pct != null && /*#__PURE__*/_jsxs("span", {
            className: "match-pill",
            style: matchStyle(item._pct),
            children: [item._pct, "%"]
          })]
        })]
      }), /*#__PURE__*/_jsx("div", {
        className: "coming-date",
        children: daysOutText
      }), badges.length > 0 && /*#__PURE__*/_jsx("div", {
        className: "badge-row",
        children: badges.map((b, i) => /*#__PURE__*/_jsx("span", {
          className: "badge badge-" + b.kind,
          children: b.text
        }, i))
      }), note && /*#__PURE__*/_jsx("div", {
        className: "proactive-note note-" + note.tone,
        children: note.text
      }), expanded && /*#__PURE__*/_jsxs("div", {
        className: "suggest-links",
        onClick: e => e.stopPropagation(),
        children: [/*#__PURE__*/_jsx("a", {
          className: "link-pill",
          href: `https://www.youtube.com/results?search_query=${encodeURIComponent(item.title + " trailer")}`,
          target: "_blank",
          rel: "noreferrer",
          children: "Trailer"
        }), /*#__PURE__*/_jsx("a", {
          className: "link-pill",
          href: buildRedditLink(item.title, item.year),
          target: "_blank",
          rel: "noreferrer",
          children: "Reddit"
        })]
      })]
    }), /*#__PURE__*/_jsx("button", {
      className: "icon-btn" + (added ? " icon-btn-active" : ""),
      onClick: e => {
        e.stopPropagation();
        onSave();
      },
      "aria-label": "Save to wishlist",
      children: /*#__PURE__*/_jsx(Bookmark, {
        size: 16
      })
    })]
  });
}
function ComingSoonView({
  tmdb,
  settings,
  taste,
  people,
  collection,
  watchlist,
  feedback,
  onAddToWatchlist,
  onLogNew
}) {
  const crowd = useMemo(() => learnCrowdWeight(collection), [collection]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState({});
  const [window, setWindow] = useState("all");
  const [sort, setSort] = useState("highest");
  const [genreFilter, setGenreFilter] = useState("all");
  const [infoItem, setInfoItem] = useState(null);
  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const endDate = `${new Date().getFullYear() + 6}-12-31`;
        const pages = await Promise.all([1, 2, 3, 4, 5, 6].map(page => tmdb.discoverMovie({
          "primary_release_date.gte": today,
          "primary_release_date.lte": endDate,
          sort_by: "popularity.desc",
          page
        })));
        const raw = pages.flatMap(p => p.results || []);
        const sorted = raw.map(r => ({
          ...normalize(r),
          releaseDate: r.release_date
        })).filter(x => x.releaseDate).filter((x, i, arr) => arr.findIndex(y => y.tmdbId === x.tmdbId) === i).sort((a, b) => a.releaseDate < b.releaseDate ? -1 : 1);
        if (active) setItems(sorted);
      } catch (e) {
        if (active) setError(e.message);
      }
      if (active) setLoading(false);
    }
    run();
    return () => {
      active = false;
    };
    // eslint-disable-next-line
  }, [settings.country]);
  function daysOut(dateStr) {
    const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
    if (diff < 0) return formatDate(dateStr);
    if (diff === 0) return "Today";
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
    const todayStr = new Date().toISOString().slice(0, 10);
    if (dateStr < todayStr) return false; // only today + upcoming, never already-released
    if (window === "all") return true;
    if (window === "week") return days >= 0 && days <= 7;
    if (window === "month") return days >= -7 && days <= 31;
    if (window === "thisyear") return yr === thisYear;
    if (window === "nextyear") return yr === thisYear + 1;
    if (window === "beyond") return yr > thisYear + 1;
    return true;
  }
  const enough = hasEnoughTaste(collection, feedback);
  const note = (item, pct) => {
    if (pct == null) return null;
    const _w = getWeights(taste);
    const likedGenres = Object.entries(_w).filter(([, v]) => v > 0).map(([g]) => Number(g));
    const topUserGenres = Object.entries(_w).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => Number(g));
    const itemGenres = item.genreIds || [];
    const overlapping = itemGenres.filter(g => likedGenres.includes(g));
    const nonOverlapping = itemGenres.filter(g => !likedGenres.includes(g));
    const gName = id => MOVIE_GENRES[id] || TV_GENRES[id];
    const pick = (arr, seed) => arr[seed % arr.length];
    const seed = item.tmdbId % 13;
    if (pct >= 70) {
      const g = overlapping.find(id => gName(id));
      const opts = g ? [`Big ${gName(g)} energy`, `This one was made for you — ${gName(g)}`, `Strong ${gName(g)} pull`, `You'll want this one — peak ${gName(g)}`] : ["Very much your kind of film", "Built for your taste", "High confidence add"];
      return {
        tone: "hot",
        text: pick(opts, seed)
      };
    }
    if (overlapping.length && pct >= 45) {
      const g = gName(overlapping[0]);
      const opts = g ? [`Worth a look — good ${g}`, `Decent ${g} that fits`, `${g} angle works for you`] : ["Reasonable fit for you", "Worth putting on the radar"];
      return {
        tone: "hot",
        text: pick(opts, seed)
      };
    }
    if (!overlapping.length && pct >= 35) {
      const g = nonOverlapping.find(id => gName(id));
      const opts = g ? [`${gName(g)} is new territory for you`, `Different vibe — ${gName(g)}`, `Pushes outside your usual ${gName(g)} comfort`] : ["A curveball — but keep an open mind", "Different from your usual"];
      return {
        tone: "stretch",
        text: pick(opts, seed)
      };
    }
    if (pct < 28) {
      const g = topUserGenres.find(id => gName(id));
      const opts = g ? [`Not really your ${gName(g)} world`, `Pretty far from what you usually watch`, `Outside your usual range`] : ["Probably not your thing", "Long shot for you"];
      return {
        tone: "cool",
        text: pick(opts, seed)
      };
    }
    return {
      tone: "stretch",
      text: pick(["Could go either way", "Flip a coin on this one", "Worth a second look maybe", "Might click, might not"], seed)
    };
  };
  const genreOpts = useMemo(() => {
    const ids = new Set();
    items.forEach(x => (x.genreIds || []).forEach(g => ids.add(g)));
    return Array.from(ids).map(id => ({
      id,
      name: MOVIE_GENRES[id] || TV_GENRES[id]
    })).filter(x => x.name).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);
  const processed = useMemo(() => {
    let list = items.map(x => {
      const m = matchMeta(x, taste, people, crowd);
      return {
        ...x,
        _pct: m.pct,
        _conf: m.conf
      };
    }).filter(x => inWindow(x.releaseDate));
    if (genreFilter !== "all") list = list.filter(x => (x.genreIds || []).includes(Number(genreFilter)));
    if (!enough) list.sort((a, b) => a.releaseDate < b.releaseDate ? -1 : 1);else if (sort === "lowest") list.sort((a, b) => (a._pct || 0) - (b._pct || 0));else list.sort((a, b) => (b._pct || 0) - (a._pct || 0));
    return list;
  }, [items, window, sort, taste, genreFilter, enough]);
  const thisYr = new Date().getFullYear();
  const WINDOWS = [{
    id: "all",
    label: "All"
  }, {
    id: "week",
    label: "This week"
  }, {
    id: "month",
    label: "This month"
  }, {
    id: "thisyear",
    label: `${thisYr}`
  }, {
    id: "nextyear",
    label: `${thisYr + 1}`
  }, {
    id: "beyond",
    label: "Beyond"
  }];
  return /*#__PURE__*/_jsxs("div", {
    className: "view",
    children: [infoItem && /*#__PURE__*/_jsx(DetailModal, {
      item: infoItem,
      tmdb: tmdb,
      badges: badgesFor(infoItem, people, taste),
      settings: settings,
      onClose: () => setInfoItem(null),
      onAddToWatchlist: it => {
        onAddToWatchlist(it);
        setAdded(a => ({
          ...a,
          [it.tmdbId]: true
        }));
      },
      onLogNew: onLogNew
    }), /*#__PURE__*/_jsxs("div", {
      className: "filter-row",
      style: {
        marginBottom: 12,
        flexWrap: "wrap"
      },
      children: [/*#__PURE__*/_jsx("select", {
        className: "filter-select",
        value: window,
        onChange: e => setWindow(e.target.value),
        children: WINDOWS.map(w => /*#__PURE__*/_jsx("option", {
          value: w.id,
          children: w.label
        }, w.id))
      }), genreOpts.length > 0 && /*#__PURE__*/_jsxs("select", {
        className: "filter-select",
        value: genreFilter,
        onChange: e => setGenreFilter(e.target.value),
        children: [/*#__PURE__*/_jsx("option", {
          value: "all",
          children: "All genres"
        }), genreOpts.map(g => /*#__PURE__*/_jsx("option", {
          value: String(g.id),
          children: g.name
        }, g.id))]
      }), enough && /*#__PURE__*/_jsxs("select", {
        className: "filter-select",
        value: sort,
        onChange: e => setSort(e.target.value),
        children: [/*#__PURE__*/_jsx("option", {
          value: "highest",
          children: "Highest match"
        }), /*#__PURE__*/_jsx("option", {
          value: "lowest",
          children: "Lowest match"
        })]
      })]
    }), loading && /*#__PURE__*/_jsx(EmptyState, {
      icon: /*#__PURE__*/_jsx(RefreshCw, {
        size: 32,
        className: "spin"
      }),
      title: "Checking the calendar",
      body: "Pulling what's headed to theaters."
    }), !loading && error && /*#__PURE__*/_jsx(EmptyState, {
      icon: /*#__PURE__*/_jsx(Info, {
        size: 32
      }),
      title: "Couldn't load release dates",
      body: `TMDB said: ${error}`
    }), !loading && !error && processed.length === 0 && /*#__PURE__*/_jsx(EmptyState, {
      icon: /*#__PURE__*/_jsx(CalendarDays, {
        size: 32
      }),
      title: "Nothing in that window",
      body: "Try a wider time range."
    }), !loading && !error && /*#__PURE__*/_jsx("div", {
      className: "coming-list",
      children: processed.map(item => {
        const badges = badgesFor(item, people, taste);
        const n = enough ? note(item, item._pct) : null;
        const inWl = (watchlist || []).some(w => w.tmdbId === item.tmdbId && w.mediaType === item.mediaType);
        return /*#__PURE__*/_jsx(ComingRow, {
          item: item,
          badges: badges,
          note: n,
          enough: enough,
          added: added[item.tmdbId],
          inWatchlist: inWl || added[item.tmdbId],
          settings: settings,
          onInfo: () => setInfoItem(item),
          onSave: () => {
            onAddToWatchlist(item);
            setAdded(a => ({
              ...a,
              [item.tmdbId]: true
            }));
          },
          daysOutText: daysOut(item.releaseDate)
        }, item.tmdbId);
      })
    })]
  });
}

/* ---------------------------------------------------------
   OUT NOW TAB  — movies currently in theaters
--------------------------------------------------------- */

function OutNowHeroCard({
  item,
  idx,
  enough,
  itemNote,
  itemBadges,
  isOwned,
  inCollection,
  ownedRating,
  availability,
  inWatchlist,
  onInfo,
  onSave,
  onSeen
}) {
  return /*#__PURE__*/_jsxs("div", {
    className: "outnow-hero",
    onClick: onInfo,
    style: {
      cursor: "pointer"
    },
    children: [item.backdropPath ? /*#__PURE__*/_jsx("img", {
      src: tmdbImg(item.backdropPath, "w780"),
      alt: "",
      className: "outnow-hero-img"
    }) : item.posterPath ? /*#__PURE__*/_jsx("img", {
      src: tmdbImg(item.posterPath, "w500"),
      alt: "",
      className: "outnow-hero-img"
    }) : /*#__PURE__*/_jsx("div", {
      className: "outnow-hero-img outnow-hero-blank",
      children: /*#__PURE__*/_jsx(Film, {
        size: 28
      })
    }), /*#__PURE__*/_jsx("button", {
      className: "outnow-seen-btn",
      onClick: e => {
        e.stopPropagation();
        onSeen();
      },
      "aria-label": "Mark as seen",
      children: /*#__PURE__*/_jsx(Eye, {
        size: 15
      })
    }), /*#__PURE__*/_jsx("button", {
      className: "outnow-save-btn" + (isOwned ? " outnow-save-btn-active" : ""),
      onClick: e => {
        e.stopPropagation();
        onSave();
      },
      "aria-label": "Save to wishlist",
      children: /*#__PURE__*/_jsx(Bookmark, {
        size: 14
      })
    }), availability && /*#__PURE__*/_jsx("span", {
      className: "avail-tag avail-" + availability,
      children: availability === "theaters" ? /*#__PURE__*/_jsxs(_Fragment, {
        children: [/*#__PURE__*/_jsx(Ticket, {
          size: 9
        }), " In theaters"]
      }) : /*#__PURE__*/_jsxs(_Fragment, {
        children: [/*#__PURE__*/_jsx(Tv, {
          size: 9
        }), " Streaming"]
      })
    }), /*#__PURE__*/_jsxs("div", {
      className: "outnow-hero-overlay",
      children: [/*#__PURE__*/_jsxs("div", {
        className: "outnow-hero-top",
        children: [inWatchlist && /*#__PURE__*/_jsx("span", {
          className: "watchlist-badge",
          children: /*#__PURE__*/_jsx(Bookmark, {
            size: 10
          })
        }), inCollection ? /*#__PURE__*/_jsx("span", {
          className: "match-pill match-seen",
          title: "In your collection",
          children: ownedRating != null ? /*#__PURE__*/_jsxs(_Fragment, {
            children: ["Seen · ", ownedRating, /*#__PURE__*/_jsx(Star, {
              size: 9,
              style: {
                marginLeft: 2,
                verticalAlign: "-1px"
              },
              fill: "currentColor"
            })]
          }) : "Seen"
        }) : /*#__PURE__*/_jsxs(_Fragment, {
          children: [enough && item._pct != null && /*#__PURE__*/_jsxs("span", {
            className: "match-pill",
            style: matchStyle(item._pct),
            children: [item._pct, "%"]
          }), itemNote && /*#__PURE__*/_jsx("span", {
            className: "proactive-note note-" + itemNote.tone,
            style: {
              margin: 0
            },
            children: itemNote.text
          })]
        })]
      }), /*#__PURE__*/_jsx("div", {
        className: "outnow-hero-title" + (idx > 0 ? " outnow-hero-title-sm" : ""),
        children: item.title
      }), /*#__PURE__*/_jsx("div", {
        className: "outnow-hero-genres",
        children: genreNames(item.genreIds, item.mediaType).slice(0, 2).join(" · ")
      }), itemBadges.length > 0 && /*#__PURE__*/_jsx("div", {
        className: "badge-row",
        children: itemBadges.map((b, i) => /*#__PURE__*/_jsx("span", {
          className: "badge badge-" + b.kind,
          children: b.text
        }, i))
      })]
    })]
  });
}
function OutNowView({
  tmdb,
  settings,
  taste,
  people,
  collection,
  watchlist,
  feedback,
  onAddToWatchlist,
  onLogNew,
  onSaveSettings
}) {
  const crowd = useMemo(() => learnCrowdWeight(collection), [collection]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState({});
  const [infoItem, setInfoItem] = useState(null);
  const [logging, setLogging] = useState(null);
  const [sort, setSort] = useState("match");
  const [genreFilter, setGenreFilter] = useState("all");
  const [availMap, setAvailMap] = useState({});
  const availCacheRef = useRef({});
  const availRegionRef = useRef((settings.country || "US").toUpperCase());
  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const region = (settings.country || "US").toUpperCase();
        const [p1, p2] = await Promise.all([tmdb.nowPlaying(1, region), tmdb.nowPlaying(2, region)]);
        const raw = [...(p1.results || []), ...(p2.results || [])];
        const dedup = Array.from(new Map(raw.map(r => [r.id, r])).values());
        const sorted = dedup.map(r => normalize(r)).sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        if (active) setItems(sorted);
      } catch (e) {
        if (active) setError(e.message);
      }
      if (active) setLoading(false);
    }
    run();
    return () => {
      active = false;
    };
  }, [settings.country]);

  // classify each title: a subscription (flatrate) provider means it's watchable online,
  // so it's "streaming" rather than genuinely theatrical-only. fills in after the list shows.
  useEffect(() => {
    if (!items.length) return;
    let active = true;
    const region = (settings.country || "US").toUpperCase();
    if (region !== availRegionRef.current) {
      availCacheRef.current = {};
      availRegionRef.current = region;
    }
    const toFetch = items.filter(it => availCacheRef.current[it.tmdbId + it.mediaType] === undefined);
    if (!toFetch.length) {
      setAvailMap({
        ...availCacheRef.current
      });
      return;
    }
    Promise.allSettled(toFetch.map(it => tmdb.watchProviders(it.mediaType, it.tmdbId).then(d => {
      const entry = d.results && d.results[region];
      const streaming = !!(entry && entry.flatrate && entry.flatrate.length);
      return {
        key: it.tmdbId + it.mediaType,
        val: streaming ? "streaming" : "theaters"
      };
    }))).then(results => {
      results.forEach(r => {
        if (r.status === "fulfilled" && r.value) availCacheRef.current[r.value.key] = r.value.val;
      });
      if (active) setAvailMap({
        ...availCacheRef.current
      });
    });
    return () => {
      active = false;
    };
  }, [items, settings.country]);
  const enough = hasEnoughTaste(collection, feedback);
  const genreOpts = useMemo(() => {
    const ids = new Set();
    items.forEach(x => (x.genreIds || []).forEach(g => ids.add(g)));
    return Array.from(ids).map(id => ({
      id,
      name: MOVIE_GENRES[id] || TV_GENRES[id]
    })).filter(x => x.name).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);
  const processed = useMemo(() => {
    let list = items.map(x => {
      const m = matchMeta(x, taste, people, crowd);
      return {
        ...x,
        _pct: m.pct,
        _conf: m.conf
      };
    });
    if (genreFilter !== "all") list = list.filter(x => (x.genreIds || []).includes(Number(genreFilter)));
    if (sort === "match") list.sort((a, b) => (b._pct || 0) - (a._pct || 0));else if (sort === "lowest") list.sort((a, b) => (a._pct || 0) - (b._pct || 0));else if (sort === "genre") list.sort((a, b) => {
      const ag = genreNames(a.genreIds, a.mediaType)[0] || "";
      const bg = genreNames(b.genreIds, b.mediaType)[0] || "";
      return ag.localeCompare(bg);
    });
    return list;
  }, [items, taste, sort, genreFilter]);
  const note = (item, pct) => {
    if (pct == null) return null;
    const _w = getWeights(taste);
    const likedGenres = Object.entries(_w).filter(([, v]) => v > 0).map(([g]) => Number(g));
    const topUserGenres = Object.entries(_w).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => Number(g));
    const itemGenres = item.genreIds || [];
    const overlapping = itemGenres.filter(g => likedGenres.includes(g));
    const nonOverlapping = itemGenres.filter(g => !likedGenres.includes(g));
    const gName = id => MOVIE_GENRES[id] || TV_GENRES[id];
    const pick = (arr, seed) => arr[seed % arr.length];
    const seed = item.tmdbId % 13;
    if (pct >= 70) {
      const g = overlapping.find(id => gName(id));
      const opts = g ? [`Nails the ${gName(g)} you like`, `Really strong ${gName(g)} pick`, `This is the ${gName(g)} you came for`, `Made for you — heavy ${gName(g)}`, `Peak ${gName(g)} for your taste`] : ["Locks hard into your profile", "Exactly what you come for", "Built for your taste"];
      return {
        tone: "hot",
        text: pick(opts, seed)
      };
    }
    if (overlapping.length && pct >= 45) {
      const g = gName(overlapping[0]);
      const opts = g ? [`Decent ${g} — worth your time`, `Checks the ${g} box`, `Good ${g} option`] : ["Checks most of your boxes", "Generally fits your profile"];
      return {
        tone: "hot",
        text: pick(opts, seed)
      };
    }
    if (!overlapping.length && pct >= 35) {
      const g = nonOverlapping.find(id => gName(id));
      const opts = g ? [`Venturing into ${gName(g)} here`, `Different angle — ${gName(g)}`, `${gName(g)} is new for you`] : ["Bit of a curveball for you", "Stretches your usual range"];
      return {
        tone: "stretch",
        text: pick(opts, seed)
      };
    }
    if (pct < 28) {
      const g = topUserGenres.find(id => gName(id));
      const opts = g ? [`Very far from your ${gName(g)} world`, `Not your usual ${gName(g)} territory`, `Skip unless you're in a different mood`] : ["Probably not your scene", "Significant stretch from your usual"];
      return {
        tone: "cool",
        text: pick(opts, seed)
      };
    }
    return {
      tone: "stretch",
      text: pick(["Could go either way for you", "Might click, might not", "Middle ground for your taste", "Fair shot if you're open to it"], seed)
    };
  };
  const ownedSet = useMemo(() => new Set([...collection.map(c => c.tmdbId + c.mediaType)]), [collection]);
  const ownedRatingMap = useMemo(() => {
    const m = {};
    collection.forEach(c => {
      const last = c.viewings && c.viewings.length ? c.viewings[c.viewings.length - 1] : null;
      m[c.tmdbId + c.mediaType] = last && last.rating != null ? last.rating : null;
    });
    return m;
  }, [collection]);
  return /*#__PURE__*/_jsxs("div", {
    className: "view",
    children: [infoItem && /*#__PURE__*/_jsx(DetailModal, {
      item: infoItem,
      tmdb: tmdb,
      badges: badgesFor(infoItem, people, taste),
      settings: settings,
      onClose: () => setInfoItem(null),
      onAddToWatchlist: it => {
        onAddToWatchlist(it);
        setAdded(a => ({
          ...a,
          [it.tmdbId]: true
        }));
      },
      onLogNew: onLogNew
    }), logging && /*#__PURE__*/_jsxs(Modal, {
      onClose: () => setLogging(null),
      children: [/*#__PURE__*/_jsx("h3", {
        className: "modal-title",
        children: logging.title
      }), /*#__PURE__*/_jsx(LogForm, {
        saveLabel: "Add to collection",
        onCancel: () => setLogging(null),
        onSave: entry => {
          onLogNew(logging, entry);
          setLogging(null);
        }
      })]
    }), /*#__PURE__*/_jsxs("div", {
      className: "chip-scroll",
      style: {
        marginBottom: 12
      },
      children: [/*#__PURE__*/_jsx("button", {
        className: "chip" + (sort === "match" ? " chip-active" : ""),
        onClick: () => setSort("match"),
        children: "Highest match"
      }), /*#__PURE__*/_jsx("button", {
        className: "chip" + (sort === "lowest" ? " chip-active" : ""),
        onClick: () => setSort("lowest"),
        children: "Lowest match"
      }), /*#__PURE__*/_jsx("button", {
        className: "chip" + (sort === "genre" ? " chip-active" : ""),
        onClick: () => setSort("genre"),
        children: "Genre A–Z"
      })]
    }), genreOpts.length > 0 && /*#__PURE__*/_jsx("div", {
      className: "filter-row",
      style: {
        marginBottom: 12
      },
      children: /*#__PURE__*/_jsxs("select", {
        className: "filter-select",
        value: genreFilter,
        onChange: e => setGenreFilter(e.target.value),
        children: [/*#__PURE__*/_jsx("option", {
          value: "all",
          children: "All genres"
        }), genreOpts.map(g => /*#__PURE__*/_jsx("option", {
          value: String(g.id),
          children: g.name
        }, g.id))]
      })
    }), loading && /*#__PURE__*/_jsx(EmptyState, {
      icon: /*#__PURE__*/_jsx(RefreshCw, {
        size: 32,
        className: "spin"
      }),
      title: "Loading theaters",
      body: "Pulling what's playing right now."
    }), !loading && error && /*#__PURE__*/_jsx(EmptyState, {
      icon: /*#__PURE__*/_jsx(Info, {
        size: 32
      }),
      title: "Couldn't load",
      body: `TMDB said: ${error}`
    }), !loading && !error && processed.length === 0 && /*#__PURE__*/_jsx(EmptyState, {
      icon: /*#__PURE__*/_jsx(Clapperboard, {
        size: 32
      }),
      title: "Nothing found",
      body: "No current releases found for your region."
    }), !loading && !error && processed.length > 0 && /*#__PURE__*/_jsx("div", {
      className: "outnow-all-heroes",
      children: processed.map((item, idx) => {
        const itemNote = enough ? note(item, item._pct) : null;
        const itemBadges = badgesFor(item, people, taste);
        const isOwned = ownedSet.has(item.tmdbId + item.mediaType);
        const inWl = (watchlist || []).some(w => w.tmdbId === item.tmdbId && w.mediaType === item.mediaType);
        return /*#__PURE__*/_jsx(OutNowHeroCard, {
          item: item,
          idx: idx,
          enough: enough,
          itemNote: itemNote,
          itemBadges: itemBadges,
          isOwned: isOwned || added[item.tmdbId],
          inCollection: isOwned,
          ownedRating: ownedRatingMap[item.tmdbId + item.mediaType],
          availability: availMap[item.tmdbId + item.mediaType],
          inWatchlist: inWl || added[item.tmdbId],
          onInfo: () => setInfoItem(item),
          onSave: () => {
            onAddToWatchlist(item);
            setAdded(a => ({
              ...a,
              [item.tmdbId]: true
            }));
          },
          onSeen: () => setLogging(item)
        }, item.tmdbId);
      })
    })]
  });
}

/* ---------------------------------------------------------
   SEARCH TAB
--------------------------------------------------------- */

function SearchView({
  tmdb,
  taste,
  onAddToWatchlist,
  onLogNew
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [logging, setLogging] = useState(null);
  const [detail, setDetail] = useState(null);
  const [aiMode, setAiMode] = useState(false);
  async function runSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setAiMode(false);
    const tmdbSearch = async () => {
      const data = await tmdb.searchMulti(q);
      return (data.results || []).filter(r => r.media_type === "movie" || r.media_type === "tv").map(normalize);
    };
    // Treat it as an AI "ask" only when it's phrased like one; otherwise it's a title lookup.
    const isAsk = /(\blike\b|\bsimilar\b|recommend|suggest|\bmovies? about\b|\bshows? about\b|something to watch|what should i|\?)/i.test(q);
    try {
      if (isAsk) {
        setResults(await smartSearch(q, tmdb));
        setAiMode(true);
      } else {
        const hits = await tmdbSearch();
        if (hits.length) {
          setResults(hits);
        } else {
          // no title match — fall back to AI suggestions
          try {
            setResults(await smartSearch(q, tmdb));
            setAiMode(true);
          } catch {
            setResults([]);
          }
        }
      }
    } catch {
      // AI path failed — fall back to a plain title search
      try {
        setResults(await tmdbSearch());
      } catch (e2) {
        setError(e2.message);
      }
    }
    setLoading(false);
  }
  return /*#__PURE__*/_jsxs("div", {
    className: "view",
    children: [detail && /*#__PURE__*/_jsx(DetailModal, {
      item: detail,
      tmdb: tmdb,
      badges: [],
      settings: {},
      onClose: () => setDetail(null),
      onAddToWatchlist: onAddToWatchlist,
      onLogNew: onLogNew
    }), /*#__PURE__*/_jsxs("form", {
      className: "search-bar",
      onSubmit: runSearch,
      children: [/*#__PURE__*/_jsx(Search, {
        size: 16
      }), /*#__PURE__*/_jsx("input", {
        className: "search-input",
        placeholder: 'Search or ask: "movies like Infinity Pool"',
        value: query,
        onChange: e => setQuery(e.target.value)
      })]
    }), loading && /*#__PURE__*/_jsx(EmptyState, {
      icon: /*#__PURE__*/_jsx(RefreshCw, {
        size: 32,
        className: "spin"
      }),
      title: "Searching",
      body: "One second."
    }), error && /*#__PURE__*/_jsx(EmptyState, {
      icon: /*#__PURE__*/_jsx(Info, {
        size: 32
      }),
      title: "Search failed",
      body: error
    }), !loading && !error && results.length > 0 && /*#__PURE__*/_jsxs(_Fragment, {
      children: [aiMode && /*#__PURE__*/_jsxs("div", {
        className: "hint-banner",
        style: {
          marginBottom: 12
        },
        children: [/*#__PURE__*/_jsx(Sparkles, {
          size: 14
        }), " AI-powered results"]
      }), /*#__PURE__*/_jsx("div", {
        className: "suggest-list",
        children: results.map(item => /*#__PURE__*/_jsxs("div", {
          className: "suggest-row",
          children: [/*#__PURE__*/_jsx("button", {
            className: "suggest-thumb-btn",
            onClick: () => setDetail(item),
            "aria-label": `Details for ${item.title}`,
            children: item.posterPath ? /*#__PURE__*/_jsx("img", {
              src: tmdbImg(item.posterPath, "w154"),
              alt: "",
              className: "suggest-thumb"
            }) : /*#__PURE__*/_jsx("div", {
              className: "suggest-thumb suggest-thumb-fallback",
              children: item.mediaType === "tv" ? /*#__PURE__*/_jsx(Tv, {
                size: 18
              }) : /*#__PURE__*/_jsx(Film, {
                size: 18
              })
            })
          }), /*#__PURE__*/_jsxs("div", {
            className: "suggest-info",
            children: [/*#__PURE__*/_jsxs("button", {
              className: "suggest-title-btn",
              onClick: () => setDetail(item),
              children: [item.title, " ", item.year ? `· ${item.year}` : ""]
            }), /*#__PURE__*/_jsx("div", {
              className: "suggest-genres",
              children: genreNames(item.genreIds, item.mediaType).slice(0, 1).join(" · ")
            }), item.aiReason && /*#__PURE__*/_jsx("div", {
              className: "why-watch",
              children: item.aiReason
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "suggest-actions",
            children: [/*#__PURE__*/_jsx("button", {
              className: "icon-btn",
              onClick: () => onAddToWatchlist(item),
              "aria-label": "Want to see",
              children: /*#__PURE__*/_jsx(Bookmark, {
                size: 16
              })
            }), /*#__PURE__*/_jsx("button", {
              className: "icon-btn",
              onClick: () => setLogging(item),
              "aria-label": "Seen it",
              children: /*#__PURE__*/_jsx(Check, {
                size: 16
              })
            })]
          })]
        }, item.tmdbId + item.mediaType))
      })]
    }), logging && /*#__PURE__*/_jsxs(Modal, {
      onClose: () => setLogging(null),
      children: [/*#__PURE__*/_jsx("h3", {
        className: "modal-title",
        children: logging.title
      }), /*#__PURE__*/_jsx(LogForm, {
        saveLabel: "Add to collection",
        onCancel: () => setLogging(null),
        onSave: entry => {
          onLogNew(logging, entry);
          setLogging(null);
        }
      })]
    })]
  });
}

/* ---------------------------------------------------------
   SETTINGS
--------------------------------------------------------- */

function SettingsPanel({
  settings,
  conn,
  collection,
  watchlist,
  feedback,
  onSave,
  onClose,
  onSaveConnection,
  onImport,
  onEnrich,
  enrichStatus
}) {
  const [tmdbKey, setTmdbKey] = useState(settings.tmdbKey);
  const [omdbKey, setOmdbKey] = useState(settings.omdbKey);
  const [zip, setZip] = useState(settings.zip);
  const [country, setCountry] = useState(settings.country || "US");
  const [supabaseUrl, setSupabaseUrl] = useState(conn.supabaseUrl);
  const [supabaseKey, setSupabaseKey] = useState(conn.supabaseKey);
  const importRef = useRef(null);
  function downloadBackup() {
    const payload = {
      schema: "watchlist-backup-v1",
      exportedAt: new Date().toISOString(),
      collection: collection || [],
      watchlist: watchlist || [],
      feedback: feedback || {}
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `watchlist-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.collection)) {
          alert("That file doesn't look like a Watchlist backup.");
          return;
        }
        const ok = window.confirm(`Restore ${data.collection.length} collected and ${(data.watchlist || []).length} wishlist items? This replaces what's on this device.`);
        if (!ok) return;
        onImport(data);
        onClose();
      } catch {
        alert("Couldn't read that file. Make sure it's a Watchlist backup JSON.");
      }
    };
    reader.readAsText(file);
  }
  return /*#__PURE__*/_jsxs(Modal, {
    onClose: onClose,
    children: [/*#__PURE__*/_jsx("h3", {
      className: "modal-title",
      children: "Settings"
    }), /*#__PURE__*/_jsx("label", {
      className: "field-label",
      children: "TMDB API key"
    }), /*#__PURE__*/_jsx("input", {
      className: "field-input",
      value: tmdbKey,
      onChange: e => setTmdbKey(e.target.value),
      placeholder: "Required"
    }), /*#__PURE__*/_jsxs("a", {
      className: "settings-link",
      href: "https://www.themoviedb.org/settings/api",
      target: "_blank",
      rel: "noreferrer",
      children: ["Get a free key ", /*#__PURE__*/_jsx(ExternalLink, {
        size: 12
      })]
    }), /*#__PURE__*/_jsx("label", {
      className: "field-label",
      style: {
        marginTop: 14
      },
      children: "OMDb API key (optional, for IMDb ratings)"
    }), /*#__PURE__*/_jsx("input", {
      className: "field-input",
      value: omdbKey,
      onChange: e => setOmdbKey(e.target.value),
      placeholder: "Optional"
    }), /*#__PURE__*/_jsxs("a", {
      className: "settings-link",
      href: "https://www.omdbapi.com/apikey.aspx",
      target: "_blank",
      rel: "noreferrer",
      children: ["Get a free key ", /*#__PURE__*/_jsx(ExternalLink, {
        size: 12
      })]
    }), /*#__PURE__*/_jsx("label", {
      className: "field-label",
      style: {
        marginTop: 14
      },
      children: "Country, for release dates where you actually are"
    }), /*#__PURE__*/_jsx("input", {
      className: "field-input",
      value: country,
      onChange: e => setCountry(e.target.value.toUpperCase().slice(0, 2)),
      placeholder: "US, GB, IE, etc"
    }), /*#__PURE__*/_jsx("p", {
      className: "sync-note",
      children: "Two letter code. Changes which Coming Soon dates and streaming options you see. Doesn't affect AMC/Regal links below, those use zip."
    }), /*#__PURE__*/_jsx("label", {
      className: "field-label",
      style: {
        marginTop: 14
      },
      children: "Zip or city, for ticket links"
    }), /*#__PURE__*/_jsx("input", {
      className: "field-input",
      value: zip,
      onChange: e => setZip(e.target.value),
      placeholder: "e.g. 37064 or wherever you are"
    }), /*#__PURE__*/_jsx("label", {
      className: "field-label",
      style: {
        marginTop: 18
      },
      children: "Sync across devices"
    }), /*#__PURE__*/_jsx("p", {
      className: "sync-note",
      children: "Paste your Supabase project URL and key here, once per device, and your collection stays the same on your phone and your computer. Leave this blank and it just stays on this device."
    }), /*#__PURE__*/_jsx("input", {
      className: "field-input",
      value: supabaseUrl,
      onChange: e => setSupabaseUrl(e.target.value),
      placeholder: "https://yourproject.supabase.co"
    }), /*#__PURE__*/_jsx("input", {
      className: "field-input",
      style: {
        marginTop: 8
      },
      value: supabaseKey,
      onChange: e => setSupabaseKey(e.target.value),
      placeholder: "Supabase publishable or anon key"
    }), /*#__PURE__*/_jsx("label", {
      className: "field-label",
      style: {
        marginTop: 18
      },
      children: "Backup and restore"
    }), /*#__PURE__*/_jsx("p", {
      className: "sync-note",
      children: "Download a copy of your whole collection to your device. It survives cache clears, updates, and anything else. Restore it any time, or hand the file to the taste engine. Do this before any big change."
    }), /*#__PURE__*/_jsxs("div", {
      style: {
        display: "flex",
        gap: 8,
        flexWrap: "wrap"
      },
      children: [/*#__PURE__*/_jsxs("button", {
        className: "btn btn-outline btn-sm",
        onClick: downloadBackup,
        children: [/*#__PURE__*/_jsx(Download, {
          size: 14
        }), " Download backup"]
      }), /*#__PURE__*/_jsxs("button", {
        className: "btn btn-outline btn-sm",
        onClick: () => importRef.current && importRef.current.click(),
        children: [/*#__PURE__*/_jsx(Upload, {
          size: 14
        }), " Restore from file"]
      }), /*#__PURE__*/_jsx("input", {
        ref: importRef,
        type: "file",
        accept: "application/json,.json",
        style: {
          display: "none"
        },
        onChange: handleImportFile
      })]
    }), /*#__PURE__*/_jsx("label", {
      className: "field-label",
      style: {
        marginTop: 18
      },
      children: "Enrich your collection"
    }), /*#__PURE__*/_jsx("p", {
      className: "sync-note",
      children: "Fetches cast, directors, and themes for everything you've logged, so the taste engine sees more than genre. Runs once, takes a moment. New logs are enriched automatically from now on."
    }), /*#__PURE__*/_jsxs("button", {
      className: "btn btn-outline btn-sm",
      onClick: onEnrich,
      children: [/*#__PURE__*/_jsx(Sparkles, {
        size: 14
      }), " Fetch cast, directors and themes"]
    }), enrichStatus && /*#__PURE__*/_jsx("p", {
      className: "sync-note",
      style: {
        marginTop: 8,
        color: "var(--brass)"
      },
      children: enrichStatus
    }), /*#__PURE__*/_jsxs("div", {
      className: "form-actions",
      children: [/*#__PURE__*/_jsx("button", {
        className: "btn btn-ghost",
        onClick: onClose,
        children: "Cancel"
      }), /*#__PURE__*/_jsx("button", {
        className: "btn btn-primary",
        onClick: () => {
          onSave({
            tmdbKey,
            omdbKey,
            zip,
            country: country || "US"
          });
          onSaveConnection({
            supabaseUrl: supabaseUrl.trim(),
            supabaseKey: supabaseKey.trim()
          });
        },
        children: "Save"
      })]
    })]
  });
}
function Onboarding({
  onSave
}) {
  const [tmdbKey, setTmdbKey] = useState("");
  return /*#__PURE__*/_jsx("div", {
    className: "onboarding",
    children: /*#__PURE__*/_jsxs("div", {
      className: "onboarding-card",
      children: [/*#__PURE__*/_jsx(Ticket, {
        size: 36,
        className: "onboarding-icon"
      }), /*#__PURE__*/_jsx("h1", {
        className: "onboarding-title",
        children: "Welcome to Watchlist"
      }), /*#__PURE__*/_jsx("p", {
        className: "onboarding-body",
        children: "One free key from TMDB powers everything here: posters, release dates, and where to watch. Takes about a minute to grab."
      }), /*#__PURE__*/_jsxs("a", {
        className: "settings-link",
        href: "https://www.themoviedb.org/settings/api",
        target: "_blank",
        rel: "noreferrer",
        children: ["Get your free TMDB key ", /*#__PURE__*/_jsx(ExternalLink, {
          size: 12
        })]
      }), /*#__PURE__*/_jsx("input", {
        className: "field-input",
        style: {
          marginTop: 16
        },
        placeholder: "Paste your TMDB API key",
        value: tmdbKey,
        onChange: e => setTmdbKey(e.target.value)
      }), /*#__PURE__*/_jsx("button", {
        className: "btn btn-primary",
        style: {
          marginTop: 14,
          width: "100%"
        },
        disabled: !tmdbKey.trim(),
        onClick: () => onSave(tmdbKey.trim()),
        children: "Start collecting"
      })]
    })
  });
}

/* ---------------------------------------------------------
   WHY WATCH THIS  — AI hint per card, cached by movie ID
--------------------------------------------------------- */

const whyWatchCache = {};
async function getWhyWatch(cacheKey, title, year, genres, tasteGenres, matchPct, voteAvg) {
  if (whyWatchCache[cacheKey]) return whyWatchCache[cacheKey];
  const pct = matchPct ?? 50;
  const qualityLine = voteAvg != null ? `TMDB community score: ${voteAvg}/10.` : "";
  const data = await callProxy({
    model: "claude-haiku-4-5",
    max_tokens: 90,
    messages: [{
      role: "user",
      content: `You're a trusted movie friend giving a personal opinion. NEVER describe the movie or its plot. ONLY say whether this viewer will like it and why, based on their taste AND the movie's quality.

WRONG (describes film): "Witty humor and quirky charm that appeals to everyone"
WRONG (plot): "A detective comedy following a quirky investigator"
RIGHT at 82% match, 7.8/10: "This is right in your lane — you're gonna love it"
RIGHT at 65% match, 6.2/10: "Decent but nothing special — worth it if you're in the mood"
RIGHT at 51% match, 5.5/10: "Pretty middle of the road, even for a fan of this genre"
RIGHT at 30% match, 7.5/10: "Probably not your thing but critically solid — keep an open mind"
RIGHT at 25% match, 4.8/10: "Skip this one — weak film and outside your lane"

Movie genres: ${genres}. ${qualityLine} Their top genres: ${tasteGenres}. Match score: ${pct}%.
Write ONE frank opinion sentence, max 16 words. No quotation marks.`
    }]
  });
  const text = data.content?.[0]?.text?.trim().replace(/^["']|["']$/g, "") || null;
  if (text) whyWatchCache[cacheKey] = text;
  return text;
}

// Instant, varied "why watch" line — generated locally so there's no per-card
// API lag, and seeded by the title so different movies get different phrasings
// instead of the same line everywhere.
function buildWhyWatch(item, taste, matchPct, voteAvg) {
  if (matchPct == null) return null;
  const pct = matchPct;
  const weights = getWeights(taste);
  const likedGenres = Object.entries(weights).filter(([, v]) => v > 0).map(([g]) => Number(g));
  const topUserGenres = Object.entries(weights).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => Number(g));
  const gName = id => MOVIE_GENRES[id] || TV_GENRES[id];
  const itemGenres = item.genreIds || [];
  const overlap = itemGenres.filter(g => likedGenres.includes(g)).map(gName).filter(Boolean);
  const offGenre = itemGenres.map(gName).filter(Boolean).find(g => !overlap.includes(g));
  const g = overlap[0];
  const good = voteAvg != null && voteAvg >= 7;
  const weak = voteAvg != null && voteAvg < 5.5;
  const seed = Math.abs(item.tmdbId || 0) % 4;
  const pick = arr => arr[seed % arr.length];
  if (pct >= 75) {
    const base = pick(g ? [`Right up your alley — that ${g} streak runs strong here`, `Lands square in your ${g} wheelhouse`, `Trust your ${g} taste on this one`, `Peak ${g} for someone like you`] : [`Squarely your kind of thing`, `Strong match — you'll click with this`, `Hard to picture you not liking this`, `Green light, this fits you`]);
    return base + (good ? ", and it actually delivers." : ".");
  }
  if (pct >= 55) {
    return pick(g ? [`Solid ${g} that should work for you.`, `Leans into the ${g} you tend to enjoy.`, `Comfortable fit — good ${g} angle.`, `Worth a look, the ${g} side suits you.`] : [`A reasonable fit for your taste.`, `Probably a good time for you.`, `Worth putting on the list.`, `Lines up decently with what you like.`]);
  }
  if (pct >= 38) {
    const base = pick(offGenre ? [`A stretch — ${offGenre} isn't your usual, but maybe`, `Different lane with that ${offGenre} bent`, `Outside your comfort zone, ${offGenre}-wise`, `Not the obvious pick, but ${offGenre} could surprise you`] : [`A bit of a curveball for your taste`, `Different from your usual — open mind needed`, `Not a sure thing, but could click`, `Coin flip for someone like you`]);
    return base + (good ? " (the crowd’s into it)." : ".");
  }
  return pick(weak ? [`Skip it — weak film and not your lane.`, `Probably a pass on both counts.`, `Hard to recommend this one to you.`, `Not your thing, and not a strong film.`] : good ? [`Not your usual, but fans rate it high.`, `Outside your taste but genuinely well-made.`, `Crowd favorite, just not aimed at you.`, `Good film, wrong fit for your taste.`] : [`Probably not your thing.`, `Pretty far from what you reach for.`, `Doubtful fit for your taste.`, `Likely a pass for you.`]);
}

/* nearest-neighbor reason: which of HIS rated films does this sit closest to,
   and what did he give it. people links beat genre links; his rating of the
   neighbor decides the tone. titles only - no plot, no cast names, spoiler-free */
function nearestReason(item, collection) {
  if (!collection || !collection.length || !item) return null;
  const itemDirs = new Set((item.credits && item.credits.directors || []).map(p => p.id));
  const itemWriters = new Set((item.credits && item.credits.writers || []).map(p => p.id));
  const itemCast = new Set((item.credits && item.credits.cast || []).slice(0, 8).map(p => p.id));
  let best = null;
  collection.forEach(t => {
    if (t.tmdbId === item.tmdbId && t.mediaType === item.mediaType) return;
    const r = t.viewings && t.viewings.length ? t.viewings[t.viewings.length - 1].rating : null;
    if (!r) return;
    const c = t.credits || {};
    let link = 0,
      kind = null;
    if ((c.directors || []).some(p => itemDirs.has(p.id))) {
      link += 3;
      kind = kind || "director";
    }
    if ((c.writers || []).some(p => itemWriters.has(p.id))) {
      link += 2.5;
      kind = kind || "writer";
    }
    const sharedCast = (c.cast || []).slice(0, 8).filter(p => itemCast.has(p.id)).length;
    if (sharedCast) {
      link += Math.min(sharedCast, 2) * 1.5;
      kind = kind || "cast";
    }
    const gShared = (t.genreIds || []).filter(g => (item.genreIds || []).includes(g)).length;
    link += gShared * 0.5;
    if (link < 1) return;
    const score = link * 10 + r;
    if (!best || score > best.score) best = {
      title: t.title,
      rating: r,
      link,
      kind,
      score
    };
  });
  if (!best) return null;
  const y = best.rating >= 7 ? "high" : best.rating <= 4 ? "low" : "mid";
  if (best.kind === "director") return y === "high" ? `Same director as your ${best.rating}/10 ${best.title}` : y === "low" ? `Same director as ${best.title} - which you gave ${best.rating}/10` : `Same director as your ${best.rating}/10 ${best.title}`;
  if (best.kind === "writer") return y === "high" ? `From a writer on your ${best.rating}/10 ${best.title}` : y === "low" ? `From a writer on ${best.title} - which you gave ${best.rating}/10` : `From a writer on your ${best.rating}/10 ${best.title}`;
  if (best.kind === "cast") return y === "high" ? `Cast overlap with your ${best.rating}/10 ${best.title}` : y === "low" ? `Cast overlap with ${best.title} - which you gave ${best.rating}/10` : `Cast overlap with your ${best.rating}/10 ${best.title}`;
  return y === "high" ? `Sits closest to your ${best.rating}/10 ${best.title}` : y === "low" ? `Sits closest to ${best.title} - which you gave ${best.rating}/10` : `In the neighborhood of your ${best.rating}/10 ${best.title}`;
}
function WhyWatch({
  item,
  taste,
  matchPct,
  collection
}) {
  const reason = useMemo(() => nearestReason(item, collection) || buildWhyWatch(item, taste, matchPct, item.voteAverage), [item.tmdbId, item.mediaType, matchPct, collection]);
  if (!reason) return null;
  return /*#__PURE__*/_jsx("div", {
    className: "why-watch",
    children: reason
  });
}

/* ---------------------------------------------------------
   REDDIT  — try to resolve actual official thread first
--------------------------------------------------------- */

const redditCache = {};
async function resolveRedditUrl(title, year) {
  const key = title + year;
  if (redditCache[key]) return redditCache[key];
  const q = encodeURIComponent(`${title}${year ? " " + year : ""} official discussion`);
  try {
    const res = await fetch(`https://www.reddit.com/r/movies/search.json?q=${q}&restrict_sr=1&sort=relevance&limit=1`, {
      headers: {
        Accept: "application/json"
      }
    });
    if (res.ok) {
      const data = await res.json();
      const post = data?.data?.children?.[0]?.data;
      if (post?.permalink) {
        const url = `https://www.reddit.com${post.permalink}`;
        redditCache[key] = url;
        return url;
      }
    }
  } catch {/* fall through */}
  const fallback = buildRedditLink(title, year);
  redditCache[key] = fallback;
  return fallback;
}

/* ---------------------------------------------------------
   SMART SEARCH  — natural language via Claude Sonnet
--------------------------------------------------------- */

async function smartSearch(query, tmdb) {
  const data = await callProxy({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `The user searched for: "${query}". Return 5 movie or TV show recommendations that best match this query. For each, provide the exact title, approximate year, and a one-sentence reason (max 15 words) why someone who asked this would enjoy it. Reply ONLY with a valid JSON array, no other text: [{"title":"...","year":"YYYY","reason":"..."}]`
    }]
  });
  const text = data.content?.[0]?.text?.trim() || "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No results parsed");
  const suggestions = JSON.parse(match[0]);
  const hydrated = await Promise.all(suggestions.map(async s => {
    try {
      const res = await tmdb.searchMulti(`${s.title} ${s.year || ""}`.trim());
      const hit = (res.results || []).find(r => r.media_type === "movie" || r.media_type === "tv");
      if (hit) return {
        ...normalize(hit),
        aiReason: s.reason
      };
    } catch {/* skip */}
    return null;
  }));
  return hydrated.filter(Boolean);
}

/* ---------------------------------------------------------
   YEAR IN REVIEW
--------------------------------------------------------- */

function YearInReview({
  collection,
  onClose
}) {
  const year = new Date().getFullYear();
  const [step, setStep] = useState(0);
  const thisYear = useMemo(() => {
    return collection.filter(t => t.viewings.some(v => v.date && v.date.startsWith(String(year))));
  }, [collection, year]);
  const totalWatched = thisYear.length;
  const genreCounts = useMemo(() => {
    const counts = {};
    thisYear.forEach(t => (t.genreIds || []).forEach(g => {
      counts[g] = (counts[g] || 0) + 1;
    }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, n]) => ({
      name: MOVIE_GENRES[g] || TV_GENRES[g] || "Unknown",
      count: n
    })).filter(x => x.name !== "Unknown");
  }, [thisYear]);
  const topRated = useMemo(() => [...thisYear].sort((a, b) => {
    const ra = Math.max(...a.viewings.map(v => v.rating || 0));
    const rb = Math.max(...b.viewings.map(v => v.rating || 0));
    return rb - ra;
  })[0], [thisYear]);
  const mostRewatched = useMemo(() => [...thisYear].sort((a, b) => b.viewings.length - a.viewings.length)[0], [thisYear]);
  const busiestMonth = useMemo(() => {
    const months = {};
    thisYear.forEach(t => t.viewings.filter(v => v.date?.startsWith(String(year))).forEach(v => {
      const m = v.date.slice(0, 7);
      months[m] = (months[m] || 0) + 1;
    }));
    const top = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    const d = new Date(top[0] + "-01");
    return {
      name: d.toLocaleDateString(undefined, {
        month: "long"
      }),
      count: top[1]
    };
  }, [thisYear]);
  const totalHours = useMemo(() => {
    const mins = thisYear.reduce((sum, t) => sum + (t.runtimeMinutes || 0), 0);
    return mins > 0 ? (mins / 60).toFixed(1) : null;
  }, [thisYear]);
  const topDirectors = useMemo(() => {
    const counts = {};
    thisYear.forEach(t => {
      (t.credits?.directors || []).forEach(d => {
        counts[d.name] = (counts[d.name] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => ({
      name,
      count
    }));
  }, [thisYear]);
  const topActors = useMemo(() => {
    const counts = {};
    thisYear.forEach(t => {
      (t.credits?.cast || []).slice(0, 3).forEach(a => {
        counts[a.name] = (counts[a.name] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => ({
      name,
      count
    }));
  }, [thisYear]);
  const cards = [{
    key: "total",
    label: `${year} in Film`,
    big: String(totalWatched),
    sub: totalWatched === 1 ? "film watched" : "films watched",
    color: "var(--brass-bright)"
  }, genreCounts.length > 0 && {
    key: "genres",
    label: "Top genres",
    big: genreCounts[0]?.name,
    sub: genreCounts.slice(1).map(g => g.name).join(" · ") || "",
    color: "var(--brass)"
  }, topRated && {
    key: "top",
    label: "Highest rated",
    big: topRated.title,
    sub: topRated.year || "",
    poster: topRated.posterPath,
    color: "#5fd99a"
  }, mostRewatched && mostRewatched.viewings.length > 1 && {
    key: "rewatch",
    label: "Most rewatched",
    big: mostRewatched.title,
    sub: `${mostRewatched.viewings.length}× this year`,
    poster: mostRewatched.posterPath,
    color: "var(--brass-bright)"
  }, busiestMonth && {
    key: "month",
    label: "Busiest month",
    big: busiestMonth.name,
    sub: `${busiestMonth.count} film${busiestMonth.count !== 1 ? "s" : ""}`,
    color: "#ff8080"
  }, totalHours && {
    key: "hours",
    label: "Time well spent",
    big: `${totalHours}h`,
    sub: "of film this year",
    color: "var(--brass-bright)"
  }, topDirectors.length > 1 && {
    key: "directors",
    label: "Your most-watched directors",
    big: topDirectors[0].name,
    sub: topDirectors.slice(1).map(d => d.name).join(" · "),
    color: "var(--brass-bright)"
  }, topActors.length > 1 && {
    key: "actors",
    label: "On your screen the most",
    big: topActors[0].name,
    sub: topActors.slice(1).map(a => a.name).join(" · "),
    color: "#ff8080"
  }].filter(Boolean);
  if (totalWatched === 0) {
    return /*#__PURE__*/_jsx("div", {
      className: "yir-wrap",
      children: /*#__PURE__*/_jsx(EmptyState, {
        icon: /*#__PURE__*/_jsx(Sparkles, {
          size: 32
        }),
        title: `Nothing logged in ${year} yet`,
        body: "Log a film and come back."
      })
    });
  }
  const card = cards[step];
  return /*#__PURE__*/_jsxs("div", {
    className: "yir-wrap",
    children: [/*#__PURE__*/_jsxs("div", {
      className: "yir-card",
      style: {
        borderColor: card.color
      },
      children: [/*#__PURE__*/_jsx("div", {
        className: "yir-label",
        style: {
          color: card.color
        },
        children: card.label
      }), card.poster && /*#__PURE__*/_jsx("img", {
        src: tmdbImg(card.poster, "w342"),
        alt: "",
        className: "yir-poster"
      }), /*#__PURE__*/_jsx("div", {
        className: "yir-big",
        style: {
          color: card.color
        },
        children: card.big
      }), card.sub && /*#__PURE__*/_jsx("div", {
        className: "yir-sub",
        children: card.sub
      })]
    }), /*#__PURE__*/_jsx("div", {
      className: "yir-dots",
      children: cards.map((c, i) => /*#__PURE__*/_jsx("button", {
        className: "yir-dot" + (i === step ? " yir-dot-active" : ""),
        onClick: () => setStep(i)
      }, c.key))
    }), /*#__PURE__*/_jsxs("div", {
      className: "yir-nav",
      children: [step > 0 && /*#__PURE__*/_jsxs("button", {
        className: "btn btn-ghost btn-sm",
        onClick: () => setStep(s => s - 1),
        children: [/*#__PURE__*/_jsx(ChevronLeft, {
          size: 14
        }), " Back"]
      }), step < cards.length - 1 ? /*#__PURE__*/_jsxs("button", {
        className: "btn btn-primary btn-sm",
        onClick: () => setStep(s => s + 1),
        children: ["Next ", /*#__PURE__*/_jsx(ChevronRight, {
          size: 14
        })]
      }) : /*#__PURE__*/_jsx("button", {
        className: "btn btn-primary btn-sm",
        onClick: onClose,
        children: "Done"
      })]
    })]
  });
}

/* ---------------------------------------------------------
   APP SHELL
--------------------------------------------------------- */

const TABS = [{
  id: "collection",
  label: "Collection",
  icon: Ticket
}, {
  id: "outnow",
  label: "Out Now",
  icon: Clapperboard
}, {
  id: "discover",
  label: "Discover",
  icon: Sparkles
}, {
  id: "soon",
  label: "Coming Soon",
  icon: CalendarDays
}, {
  id: "search",
  label: "Search",
  icon: Search
}];
export default function App() {
  const [ready, setReady] = useState(false);
  const [conn, setConn] = useState(() => getConnection());
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [collection, setCollection] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [feedback, setFeedback] = useState({
    skippedIds: [],
    wantedIds: [],
    seenIds: []
  });
  const [tab, setTab] = useState("discover");
  // mountedTabs: once a tab is visited it stays mounted (CSS display:none) so state isn't lost on switch
  const [mountedTabs, setMountedTabs] = useState(() => new Set(["discover"]));
  const [showSettings, setShowSettings] = useState(false);
  const [showYIR, setShowYIR] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState("");
  function switchTab(id) {
    setTab(id);
    setMountedTabs(m => {
      const n = new Set(m);
      n.add(id);
      return n;
    });
  }
  useEffect(() => {
    async function load() {
      const [s, c, w, f] = await Promise.all([loadKey(STORAGE_KEYS.settings, DEFAULT_SETTINGS, conn), loadKey(STORAGE_KEYS.collection, [], conn), loadKey(STORAGE_KEYS.watchlist, [], conn), loadKey(STORAGE_KEYS.feedback, {
        skippedIds: [],
        wantedIds: [],
        seenIds: []
      }, conn)]);
      setSettings(s);
      setCollection(c);
      setWatchlist(w);
      setFeedback(f);
      setReady(true);
    }
    load();
    // eslint-disable-next-line
  }, []);
  useEffect(() => {
    if (ready) saveKey(STORAGE_KEYS.settings, settings, conn);
  }, [settings, ready]);
  useEffect(() => {
    if (ready) saveKey(STORAGE_KEYS.collection, collection, conn);
  }, [collection, ready]);
  useEffect(() => {
    if (ready) saveKey(STORAGE_KEYS.watchlist, watchlist, conn);
  }, [watchlist, ready]);
  useEffect(() => {
    if (ready) saveKey(STORAGE_KEYS.feedback, feedback, conn);
  }, [feedback, ready]);

  // DATA SAFETY: when the cloud connection changes (e.g. you re-enter your keys
  // after clearing the cache), PULL from the cloud instead of pushing local up.
  // Cloud wins only when it actually has data, so an empty cloud can never wipe
  // your local collection, and an empty local can never overwrite real cloud
  // data. This closes the sync bug that erased the collection on reconnect.
  useEffect(() => {
    if (!ready || !hasCloud(conn)) return;
    let active = true;
    (async () => {
      const [c, w, f] = await Promise.all([loadKey(STORAGE_KEYS.collection, [], conn), loadKey(STORAGE_KEYS.watchlist, [], conn), loadKey(STORAGE_KEYS.feedback, {
        skippedIds: [],
        wantedIds: [],
        seenIds: []
      }, conn)]);
      if (!active) return;
      setCollection(local => Array.isArray(c) && c.length ? c : local);
      setWatchlist(local => Array.isArray(w) && w.length ? w : local);
      setFeedback(local => {
        const cloudHas = f && ((f.skippedIds || []).length || (f.wantedIds || []).length || (f.seenIds || []).length);
        return cloudHas ? f : local;
      });
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line
  }, [conn]);
  function updateConnection(next) {
    saveConnection(next);
    setConn(next);
  }
  const tmdb = useMemo(() => makeTmdb(settings.tmdbKey), [settings.tmdbKey]);
  const taste = useMemo(() => buildTasteProfile(collection, feedback), [collection, feedback]);
  const people = useMemo(() => buildPeopleProfile(collection), [collection]);
  const [burst, setBurst] = useState(null);
  function fireBurst(kind) {
    setBurst({
      kind,
      key: Date.now()
    });
    setTimeout(() => setBurst(null), 850);
  }
  function addToWatchlist(item) {
    setWatchlist(w => {
      if (w.find(x => x.tmdbId === item.tmdbId && x.mediaType === item.mediaType)) return w;
      return [...w, {
        ...item,
        addedAt: Date.now()
      }];
    });
    fireBurst("want");
  }
  function logNew(item, viewing, credits, extra) {
    const ticket = {
      id: uid(),
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      title: item.title,
      year: item.year,
      posterPath: item.posterPath,
      genreIds: item.genreIds,
      voteAverage: item.voteAverage ?? null,
      voteCount: item.voteCount ?? 0,
      backdropPath: item.backdropPath ?? null,
      credits: credits || item.credits || null,
      runtimeMinutes: extra?.runtime || item.runtimeMinutes || null,
      tmdbKeywords: extra?.keywords?.length ? extra.keywords : item.tmdbKeywords || null,
      viewings: [viewing],
      log: [{
        at: Date.now(),
        text: "Added to your collection"
      }],
      history: []
    };
    setCollection(c => [...c, ticket]);
    setWatchlist(w => w.filter(x => !(x.tmdbId === item.tmdbId && x.mediaType === item.mediaType)));
    fireBurst("collect");
    if (!ticket.credits || !ticket.tmdbKeywords) enrichTicket(ticket);
  }

  // pull cast/director + themes for one ticket in the background and cache them,
  // so the taste engine can see more than genre. non-blocking, fails silently.
  function enrichTicket(ticket) {
    if (!settings.tmdbKey) return;
    tmdb.detailsFull(ticket.mediaType, ticket.tmdbId).then(full => {
      const credits = slimCredits(full.credits);
      const kwRaw = full.keywords && (full.keywords.keywords || full.keywords.results) || [];
      const tmdbKeywords = kwRaw.map(k => ({
        id: k.id,
        name: k.name
      }));
      setCollection(c => c.map(x => x.id === ticket.id ? {
        ...x,
        credits: x.credits || credits,
        tmdbKeywords: x.tmdbKeywords && x.tmdbKeywords.length ? x.tmdbKeywords : tmdbKeywords
      } : x));
    }).catch(() => {});
  }

  // one-time backfill: enrich every collected title that's missing cast/themes.
  async function runEnrich() {
    if (!settings.tmdbKey) {
      setEnrichStatus("Set your TMDB key first.");
      return;
    }
    const need = collection.filter(t => !t.credits || !(t.tmdbKeywords && t.tmdbKeywords.length));
    if (!need.length) {
      setEnrichStatus("Everything's already enriched.");
      return;
    }
    for (let i = 0; i < need.length; i++) {
      const t = need[i];
      setEnrichStatus(`Enriching ${i + 1} of ${need.length}...`);
      try {
        const full = await tmdb.detailsFull(t.mediaType, t.tmdbId);
        const credits = slimCredits(full.credits);
        const kwRaw = full.keywords && (full.keywords.keywords || full.keywords.results) || [];
        const tmdbKeywords = kwRaw.map(k => ({
          id: k.id,
          name: k.name
        }));
        setCollection(c => c.map(x => x.id === t.id ? {
          ...x,
          credits: x.credits || credits,
          tmdbKeywords: x.tmdbKeywords && x.tmdbKeywords.length ? x.tmdbKeywords : tmdbKeywords
        } : x));
      } catch {/* skip this one */}
      await new Promise(r => setTimeout(r, 120));
    }
    setEnrichStatus(`Done. Enriched ${need.length} titles with cast, directors, and themes.`);
  }
  function updateTicket(t) {
    setCollection(c => c.map(x => x.id === t.id ? t : x));
  }
  function deleteTicket(id) {
    setCollection(c => c.filter(x => x.id !== id));
  }
  function logFromWatchlist(w) {
    logNew(w, {
      id: uid(),
      date: todayISO(),
      location: "",
      rating: 8,
      notes: "",
      loggedAt: Date.now()
    });
  }
  function removeFromWatchlist(item) {
    setWatchlist(w => w.filter(x => !(x.tmdbId === item.tmdbId && x.mediaType === item.mediaType)));
  }
  if (!ready) return /*#__PURE__*/_jsx("div", {
    className: "boot-screen",
    children: /*#__PURE__*/_jsx(Ticket, {
      size: 28,
      className: "spin"
    })
  });
  if (!settings.tmdbKey) {
    return /*#__PURE__*/_jsxs("div", {
      className: "app",
      children: [/*#__PURE__*/_jsx(GlobalStyle, {}), /*#__PURE__*/_jsx(Onboarding, {
        onSave: key => setSettings(s => ({
          ...s,
          tmdbKey: key
        }))
      })]
    });
  }
  return /*#__PURE__*/_jsxs("div", {
    className: "app",
    children: [/*#__PURE__*/_jsx(GlobalStyle, {}), burst && /*#__PURE__*/_jsx("div", {
      className: "burst-overlay",
      children: /*#__PURE__*/_jsx("div", {
        className: "burst-icon burst-" + burst.kind,
        children: burst.kind === "collect" ? /*#__PURE__*/_jsx(Ticket, {
          size: 46
        }) : burst.kind === "want" ? /*#__PURE__*/_jsx(Bookmark, {
          size: 46
        }) : /*#__PURE__*/_jsx(Eye, {
          size: 46
        })
      })
    }, burst.key), /*#__PURE__*/_jsxs("header", {
      className: "app-header",
      children: [/*#__PURE__*/_jsx("div", {
        className: "header-bulbs",
        children: Array.from({
          length: 10
        }).map((_, i) => /*#__PURE__*/_jsx("i", {}, i))
      }), /*#__PURE__*/_jsxs("div", {
        className: "header-row",
        children: [/*#__PURE__*/_jsxs("div", {
          className: "wordmark",
          children: ["WATCH", /*#__PURE__*/_jsx("span", {
            className: "wordmark-dot",
            children: "LIST"
          })]
        }), /*#__PURE__*/_jsxs("div", {
          className: "header-right",
          children: [/*#__PURE__*/_jsx("button", {
            className: "icon-btn",
            onClick: () => setScanning(true),
            "aria-label": "Scan ticket",
            title: "Scan ticket",
            children: /*#__PURE__*/_jsx(Camera, {
              size: 17
            })
          }), /*#__PURE__*/_jsx("button", {
            className: "icon-btn",
            onClick: () => setShowFavorites(true),
            "aria-label": "Favorites",
            title: "Favorites",
            children: /*#__PURE__*/_jsx(Heart, {
              size: 17
            })
          }), collection.length > 0 && /*#__PURE__*/_jsx("button", {
            className: "icon-btn",
            onClick: () => setShowYIR(true),
            "aria-label": "Recap",
            title: "Recap",
            children: /*#__PURE__*/_jsx(Sparkles, {
              size: 17
            })
          }), /*#__PURE__*/_jsx("span", {
            className: "sync-pill" + (hasCloud(conn) ? " sync-on" : ""),
            children: hasCloud(conn) ? "Synced" : "This device only"
          }), /*#__PURE__*/_jsx("button", {
            className: "icon-btn",
            onClick: () => setShowSettings(true),
            "aria-label": "Settings",
            children: /*#__PURE__*/_jsx(Settings, {
              size: 18
            })
          })]
        })]
      })]
    }), /*#__PURE__*/_jsxs("main", {
      className: "app-main",
      children: [/*#__PURE__*/_jsx("div", {
        style: {
          display: tab === "collection" ? "" : "none"
        },
        children: /*#__PURE__*/_jsx(CollectionView, {
          collection: collection,
          watchlist: watchlist,
          tmdb: tmdb,
          taste: taste,
          people: people,
          settings: settings,
          onUpdateTicket: updateTicket,
          onDeleteTicket: deleteTicket,
          onLogFromWatchlist: logFromWatchlist,
          onAddToWatchlist: addToWatchlist,
          onLogNew: logNew,
          onRemoveFromWatchlist: removeFromWatchlist,
          onShowYIR: () => setShowYIR(true)
        })
      }), mountedTabs.has("discover") && /*#__PURE__*/_jsx("div", {
        style: {
          display: tab === "discover" ? "" : "none"
        },
        children: /*#__PURE__*/_jsx(DiscoverView, {
          tmdb: tmdb,
          feedback: feedback,
          setFeedback: setFeedback,
          taste: taste,
          people: people,
          settings: settings,
          collection: collection,
          watchlist: watchlist,
          onAddToWatchlist: addToWatchlist,
          onLogNew: logNew
        })
      }), mountedTabs.has("outnow") && /*#__PURE__*/_jsx("div", {
        style: {
          display: tab === "outnow" ? "" : "none"
        },
        children: /*#__PURE__*/_jsx(OutNowView, {
          tmdb: tmdb,
          settings: settings,
          taste: taste,
          people: people,
          collection: collection,
          watchlist: watchlist,
          feedback: feedback,
          onAddToWatchlist: addToWatchlist,
          onLogNew: logNew,
          onSaveSettings: s => setSettings(s)
        })
      }), mountedTabs.has("soon") && /*#__PURE__*/_jsx("div", {
        style: {
          display: tab === "soon" ? "" : "none"
        },
        children: /*#__PURE__*/_jsx(ComingSoonView, {
          tmdb: tmdb,
          settings: settings,
          taste: taste,
          people: people,
          collection: collection,
          watchlist: watchlist,
          feedback: feedback,
          onAddToWatchlist: addToWatchlist,
          onLogNew: logNew
        })
      }), mountedTabs.has("search") && /*#__PURE__*/_jsx("div", {
        style: {
          display: tab === "search" ? "" : "none"
        },
        children: /*#__PURE__*/_jsx(SearchView, {
          tmdb: tmdb,
          taste: taste,
          onAddToWatchlist: addToWatchlist,
          onLogNew: logNew
        })
      })]
    }), showYIR && /*#__PURE__*/_jsx(Modal, {
      onClose: () => setShowYIR(false),
      wide: true,
      children: /*#__PURE__*/_jsx(YearInReview, {
        collection: collection,
        onClose: () => setShowYIR(false)
      })
    }), /*#__PURE__*/_jsx("nav", {
      className: "tab-bar",
      children: TABS.map(t => {
        const Icon = t.icon;
        return /*#__PURE__*/_jsxs("button", {
          className: "tab-btn" + (tab === t.id ? " active" : ""),
          onClick: () => switchTab(t.id),
          children: [/*#__PURE__*/_jsx(Icon, {
            size: 19
          }), /*#__PURE__*/_jsx("span", {
            children: t.label
          })]
        }, t.id);
      })
    }), showSettings && /*#__PURE__*/_jsx(SettingsPanel, {
      settings: settings,
      conn: conn,
      collection: collection,
      watchlist: watchlist,
      feedback: feedback,
      onClose: () => setShowSettings(false),
      onSave: s => setSettings(s),
      onSaveConnection: c => {
        updateConnection(c);
        setShowSettings(false);
      },
      onImport: data => {
        if (Array.isArray(data.collection)) setCollection(data.collection);
        if (Array.isArray(data.watchlist)) setWatchlist(data.watchlist);
        if (data.feedback && typeof data.feedback === "object") setFeedback(data.feedback);
      },
      onEnrich: runEnrich,
      enrichStatus: enrichStatus
    }), scanning && /*#__PURE__*/_jsx(TicketScanner, {
      tmdb: tmdb,
      onClose: () => setScanning(false),
      onLogNew: (it, entry) => {
        logNew(it, entry);
      }
    }), showFavorites && /*#__PURE__*/_jsxs(Modal, {
      onClose: () => setShowFavorites(false),
      wide: true,
      children: [/*#__PURE__*/_jsx("h3", {
        className: "modal-title",
        children: "Favorites"
      }), /*#__PURE__*/_jsx(FavoritesView, {
        collection: collection,
        people: people,
        tmdb: tmdb,
        onUpdateTicket: updateTicket
      })]
    })]
  });
}

/* ---------------------------------------------------------
   STYLES
--------------------------------------------------------- */

function GlobalStyle() {
  return /*#__PURE__*/_jsx("style", {
    children: CSS
  });
}
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

:root {
  --curtain: #140a06;
  --velvet: #211309;
  --velvet-2: #301d0f;
  --brass: #f5b301;
  --brass-bright: #ffd24d;
  --marquee-red: #ff3030;
  --stub-cream: #f3eeec;
  --ink: #0d0000;
  --cream-text: #fff9f0;
  --muted: #b09478;
  --line: rgba(226,168,54,0.16);
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
button { font-family: inherit; cursor: pointer; }
input, textarea { font-family: inherit; }

.app {
  background: radial-gradient(ellipse at 50% -10%, #2a1f08 0%, #16100a 45%, var(--curtain) 80%);
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
  display: flex; flex-direction: column; gap: 9px;
  padding: calc(10px + env(safe-area-inset-top)) 18px 12px;
  position: sticky; top: 0; z-index: 5;
  background: linear-gradient(180deg, var(--curtain) 82%, transparent);
}
.header-row { display: flex; align-items: flex-end; justify-content: space-between; }
.header-bulbs { display: flex; justify-content: space-between; padding: 0 2px; }
.header-bulbs i { width: 8px; height: 8px; border-radius: 50%; background: #f8d97e; box-shadow: 0 0 13px 3px rgba(245,205,110,0.9); animation: bulb-glow 2.2s infinite alternate; }
.header-bulbs i:nth-child(2n) { animation-delay: 1.1s; }
.header-bulbs i:nth-child(3n) { animation-delay: 0.55s; }
.header-right { display: flex; align-items: center; gap: 10px; }
.sync-pill {
  font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--muted); border: 1px solid var(--line); padding: 4px 9px; border-radius: 999px;
}
.sync-pill.sync-on { color: var(--brass); border-color: rgba(226,168,54,0.4); }
.sync-note { font-size: 12px; color: var(--muted); line-height: 1.45; margin: 4px 0 10px; }
.wordmark {
  font-family: 'Bebas Neue', sans-serif; font-weight: 400; font-size: 30px; letter-spacing: 0.14em; line-height: 0.9;
  color: var(--cream-text); text-shadow: 0 0 22px rgba(245,205,110,0.45);
}
.wordmark-dot { color: var(--brass); }

.app-main { flex: 1; padding: 2px 14px 86px; }

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
.tab-btn.active { color: var(--brass-bright); background: rgba(226,168,54,0.14); }

.view { padding-top: 4px; }
.view-toggle { display: flex; gap: 8px; margin-bottom: 12px; }
.collection-top-actions { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 10px; }
.collection-icon-btn { width: 34px; height: 34px; border-radius: 10px; background: var(--velvet-2); border: 1px solid var(--line); color: var(--brass); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.collection-icon-btn:active { transform: scale(0.92); }
.toggle-pill {
  flex: 1; background: var(--velvet); border: 1px solid var(--line); color: var(--muted);
  padding: 9px 0; border-radius: 999px; font-size: 13px; font-weight: 600;
  transition: all 0.15s;
}
.toggle-pill.active { background: var(--brass); color: var(--ink); border-color: var(--brass); }

.empty-state { text-align: center; padding: 60px 24px; color: var(--muted); }
.empty-icon { color: var(--brass); margin-bottom: 14px; display: flex; justify-content: center; }
.empty-title { font-family: 'Bebas Neue', sans-serif; font-size: 20px; letter-spacing: 0.03em; color: var(--cream-text); margin-bottom: 8px; }
.empty-body { font-size: 13.5px; line-height: 1.5; max-width: 280px; margin: 0 auto; }

.hint-banner {
  display: flex; align-items: center; gap: 8px;
  background: rgba(226,168,54,0.12); border: 1px solid rgba(226,168,54,0.3);
  color: var(--brass-bright); font-size: 12.5px; padding: 10px 12px; border-radius: 10px; margin-bottom: 14px;
}

/* ---- collection footer strip ---- */
.collection-footer-strip {
  position: sticky; bottom: 78px; z-index: 4;
  display: flex; justify-content: center; align-items: center; gap: 28px;
  padding: 11px 24px; margin: 20px auto 0; width: fit-content;
  background: rgba(15,0,0,0.92); border: 1.5px solid rgba(255,255,255,0.28);
  border-radius: 999px; backdrop-filter: blur(12px);
}
.cta-icon-btn { background: none; border: none; color: var(--cream-text); display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; letter-spacing: 0.02em; cursor: pointer; padding: 0; }
.cta-icon-btn:active { color: var(--brass); }

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
.stub-tab-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 4px; margin-bottom: 4px; }
.stub-title { font-size: 12.5px; font-weight: 700; line-height: 1.25;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.stub-rewatch-inline { font-family: 'Space Mono', monospace; font-size: 10px; font-weight: 700; color: #8a5a2a; flex-shrink: 0; padding-top: 1px; }
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
.star-bg { color: rgba(255,255,255,0.55); position: absolute; top: 0; left: 0; }
.star-fill { position: absolute; top: 0; left: 0; color: var(--brass-bright); overflow: hidden; }
.star-fg { display: block; }
.star-hit { position: absolute; top: 0; bottom: 0; width: 50%; background: none; border: none; padding: 0; }
.star-hit-left { left: 0; }
.star-hit-right { right: 0; }

/* watchlist stub grid */
.wl-stub { background: var(--stub-cream); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; position: relative; box-shadow: 0 4px 14px rgba(0,0,0,0.3); }
.wl-poster-btn { display: block; padding: 0; border: none; background: none; cursor: pointer; width: 100%; }
.wl-poster { width: 100%; aspect-ratio: 2/3; object-fit: cover; display: block; }
.wl-poster-fallback { width: 100%; aspect-ratio: 2/3; background: var(--velvet-2); display: flex; align-items: center; justify-content: center; color: var(--brass); }
.wl-tab { padding: 8px 9px 10px; color: var(--ink); }
.wl-title { font-size: 12px; font-weight: 700; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 2px; }
.wl-year { font-size: 10.5px; color: rgba(0,0,0,0.5); margin-bottom: 6px; }
.wl-actions { display: flex; align-items: center; gap: 5px; }
.stub-poster-link { display: block; width: 100%; padding: 0; border: none; background: none; cursor: pointer; }
.stub-grid-compact .wl-watched-btn { font-size: 10px; padding: 4px 4px; }
.stub-grid-compact .wl-remove-btn { width: 22px; height: 22px; }
.wl-watched-btn { flex: 1; background: var(--brass); color: var(--ink); border: none; border-radius: 999px; padding: 5px 8px; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 3px; cursor: pointer; }
.wl-remove-btn { background: rgba(0,0,0,0.1); border: none; color: rgba(0,0,0,0.5); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }

/* watchlist badge in cards */
.watchlist-badge { display: inline-flex; align-items: center; gap: 3px; background: rgba(74,240,144,0.2); border: 1px solid rgba(74,240,144,0.4); color: #4af090; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; flex-shrink: 0; }

/* approximate date toggle */
.approx-toggle { display: flex; gap: 6px; margin-bottom: 8px; }
.approx-chip { flex: 1; padding: 7px 0; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--velvet-2); border: 1px solid var(--line); color: var(--muted); }
.approx-chip-active { background: rgba(226,54,54,0.18); border-color: rgba(226,54,54,0.5); color: #ff8080; }
.anytime-hint { font-size: 12px; color: var(--muted); background: var(--velvet-2); border: 1px solid var(--line); border-radius: 8px; padding: 9px 11px; line-height: 1.4; }

/* buttons */
.btn { border-radius: 999px; padding: 10px 18px; font-size: 13.5px; font-weight: 600; border: none; display: inline-flex; align-items: center; gap: 6px; justify-content: center; }
.btn-primary { background: var(--brass); color: var(--ink); font-weight: 700; }
.btn-ghost { background: none; color: var(--muted); }
.btn-outline { background: none; border: 1px solid var(--line); color: var(--cream-text); }
.btn-sm { padding: 7px 12px; font-size: 12px; }
.btn-danger { color: #e98b85; border-color: rgba(233,139,133,0.4); }
.btn:disabled { opacity: 0.4; }
.icon-btn { background: var(--velvet); border: 1px solid var(--line); color: var(--cream-text); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.icon-btn-active { background: var(--brass); border-color: var(--brass); color: var(--ink); }

/* modal */
.modal-veil { position: fixed; inset: 0; background: rgba(10,5,9,0.72); backdrop-filter: blur(2px); display: flex; align-items: flex-end; justify-content: center; z-index: 50; }
.modal-card { background: var(--velvet); width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto; border-radius: 20px 20px 0 0; padding: 22px 18px 28px; position: relative; }
.modal-wide { max-height: 92vh; }
.modal-close { position: absolute; top: 14px; right: 14px; background: rgba(0,0,0,0.25); border: none; color: var(--cream-text); width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.modal-title { font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: 0.02em; margin: 0 0 14px; padding-right: 30px; }

/* forms */
.field-label { display: block; font-size: 11.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 12px 0 6px; }
.field-input { width: 100%; background: var(--curtain); border: 1px solid var(--line); color: var(--cream-text); padding: 10px 12px; border-radius: 10px; font-size: 16px; }
.field-textarea { min-height: 80px; resize: vertical; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.settings-link { color: var(--brass-bright); font-size: 12px; display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; text-decoration: none; }

/* ticket detail */
.ticket-detail { }
.td-poster-view { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.detail-poster { width: 100%; border-radius: 14px; aspect-ratio: 2/3; object-fit: cover; background: var(--curtain); }
.detail-poster-fallback { display: flex; align-items: center; justify-content: center; color: var(--brass); }
.td-back-header { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 16px; }
.td-thumb-btn { flex-shrink: 0; background: none; border: none; padding: 0; cursor: pointer; border-radius: 8px; overflow: hidden; }
.td-back-thumb { width: 72px; border-radius: 8px; aspect-ratio: 2/3; object-fit: cover; display: block; }
.td-thumb-fallback { width: 72px; aspect-ratio: 2/3; background: var(--velvet-2); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--brass); }
.td-back-meta { flex: 1; min-width: 0; }
.td-back-title { font-size: 18px; font-weight: 700; color: var(--cream-text); margin: 0 0 4px; line-height: 1.25; }
.td-back-genres { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.td-rewatch-count { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--brass-bright); font-weight: 600; }
.td-toolbar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.td-tool-btn { display: flex; align-items: center; gap: 6px; background: var(--velvet); border: 1px solid var(--line); color: var(--cream-text); border-radius: 20px; padding: 7px 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
.td-tool-btn:hover { background: var(--velvet-2); }
.td-tool-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.td-tool-danger { color: #e9695f; border-color: rgba(233,105,95,0.35); }
.td-tool-danger:hover { background: rgba(226,54,54,0.12); }
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
.view-discover { display: flex; flex-direction: column; align-items: center; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.view-discover * { user-select: none; -webkit-user-select: none; }
.swipe-stack { width: 100%; max-width: 320px; height: calc(100dvh - 258px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; position: relative; z-index: 1; }
.swipe-card {
  background: var(--velvet); border-radius: 18px; overflow: hidden; position: relative;
  touch-action: none; user-select: none; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  border: 1px solid rgba(226,54,54,0.1);
  flex: 1; display: flex; flex-direction: column; min-height: 0;
}
.swipe-poster { position: relative; width: 100%; height: 100%; object-fit: contain; display: block; z-index: 1; }
.swipe-poster-blur { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(30px) brightness(0.38) saturate(0.8); transform: scale(1.3); }
.swipe-poster-fallback { display: flex; align-items: center; justify-content: center; color: var(--brass); background: var(--velvet-2); }
.swipe-meta { padding: 12px 14px 6px; flex-shrink: 0; background: var(--stub-cream); color: var(--ink); position: relative; }
.swipe-title { font-weight: 800; font-size: 16px; margin-bottom: 3px; color: var(--ink); }
.swipe-sub { font-family: 'Space Mono', monospace; font-weight: 700; font-size: 10px; letter-spacing: 0.18em; color: #8a5a2a; }
.swipe-perf { border-top: 2px dashed rgba(22,8,0,0.22); margin: 9px -14px 2px; position: relative; }
.swipe-perf i { position: absolute; top: -13px; width: 26px; height: 26px; border-radius: 50%; background: var(--curtain); }
.swipe-perf i:first-child { left: -27px; }
.swipe-perf i:last-child { right: -27px; }
.swipe-meta .why-watch { color: #6b4213; font-style: normal; font-weight: 600; font-size: 12px; margin-top: 7px; }
.swipe-buttons-wrap { background: var(--stub-cream); flex-shrink: 0; border-radius: 0 0 18px 18px; }
.match-ring { position: absolute; top: 12px; right: 12px; z-index: 3; width: 72px; height: 72px; }
.match-ring-arc { filter: drop-shadow(0 0 5px rgba(245,205,110,0.75)); }
.match-ring-label { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; line-height: 1; }
.match-ring-label b { font-family: 'Space Mono', monospace; font-size: 17px; text-shadow: 0 1px 6px rgba(0,0,0,0.65); }
.match-ring-label span { font-family: 'Space Mono', monospace; font-size: 8px; font-weight: 700; letter-spacing: 0.2em; color: var(--brass-bright); margin-top: 3px; }
.match-ring-conf { position: absolute; top: 74px; left: 0; right: 0; text-align: center; font-family: 'Space Mono', monospace; font-size: 7px; font-weight: 700; letter-spacing: 0.22em; color: rgba(255,245,245,0.75); text-shadow: 0 1px 4px rgba(0,0,0,0.7); }
.deck-label { width: 100%; max-width: 320px; font-family: 'Space Mono', monospace; font-weight: 700; font-size: 10px; letter-spacing: 0.3em; color: var(--muted); padding: 2px 0 10px; position: relative; z-index: 1; }
.marquee-bulbs { display: flex; justify-content: center; gap: 15px; padding: 0 0 9px; position: relative; z-index: 1; }
.marquee-bulbs i { width: 6px; height: 6px; border-radius: 50%; background: var(--brass-bright); box-shadow: 0 0 9px 2px rgba(245,205,110,0.8); animation: bulb-glow 2.2s infinite alternate; }
.marquee-bulbs i:nth-child(2n) { animation-delay: 1.1s; opacity: 0.6; }
@keyframes bulb-glow { to { opacity: 0.55; box-shadow: 0 0 6px 1.5px rgba(245,205,110,0.45); } }
.discover-bg { position: absolute; top: -150px; right: -130px; width: 440px; height: 440px; border-radius: 50%; background-size: cover; background-position: center; filter: blur(90px) brightness(0.85) saturate(1.2); opacity: 0.5; pointer-events: none; z-index: 0; }
.discover-bg-b { top: auto; right: auto; bottom: -120px; left: -150px; opacity: 0.32; filter: blur(90px) brightness(0.75) saturate(1.15); }
.view-discover::after { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 42%, transparent 52%, rgba(0,0,0,0.55) 100%); pointer-events: none; z-index: 0; }
.view-discover { position: relative; overflow: hidden; background: #080609; border-radius: inherit; }
.view-discover .discover-foot, .view-discover .logged-toast { position: relative; z-index: 1; }
.choice-overlay { position: absolute; inset: 0; z-index: 6; background: rgba(15,1,0,0.9); backdrop-filter: blur(8px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border-radius: 18px; animation: card-enter 0.22s cubic-bezier(.22,.9,.32,1.15); }
.choice-title { font-family: 'Bebas Neue', sans-serif; font-size: 24px; letter-spacing: 0.05em; color: var(--cream-text); margin-bottom: 4px; text-align: center; padding: 0 20px; }
.choice-btn { width: 72%; padding: 14px 0; border-radius: 14px; font-family: 'Space Mono', monospace; font-weight: 700; font-size: 12px; letter-spacing: 0.14em; border: none; cursor: pointer; transition: transform 0.14s cubic-bezier(.34,1.56,.64,1); }
.choice-btn:active { transform: scale(0.92); }
.choice-btn-want { background: var(--brass); color: var(--ink); box-shadow: 0 6px 20px rgba(226,168,54,0.3); }
.choice-btn-seen { background: var(--stub-cream); color: var(--ink); }
.choice-dismiss { background: none; border: none; color: var(--muted); font-size: 11px; cursor: pointer; padding: 4px 10px; text-decoration: underline; }
.choice-stars { padding: 4px 0 8px; }
.swipe-buttons { display: flex; justify-content: center; align-items: center; gap: 20px; padding: 10px 0 14px; flex-shrink: 0; }
.round-btn { width: 52px; height: 52px; border-radius: 50%; border: none; display: flex; align-items: center; justify-content: center; transition: transform 0.16s cubic-bezier(.34,1.56,.64,1), box-shadow 0.16s; }
.round-btn:active { transform: scale(0.86); }
.round-btn-skip:active { box-shadow: 0 0 0 7px rgba(80,140,220,0.22); }
.round-btn-seen:active { box-shadow: 0 0 0 7px rgba(220,170,50,0.24); }
.round-btn-want:active { box-shadow: 0 0 0 7px rgba(60,200,110,0.24); }
.round-btn-skip { background: #152535; border: 1.5px solid rgba(80,140,220,0.55); color: #7ec2ff; box-shadow: 0 4px 14px rgba(80,140,220,0.18); }
.round-btn-seen { background: #3a2200; border: 2px solid rgba(220,170,50,0.6); color: #f0c060; width: 62px; height: 62px; box-shadow: 0 4px 18px rgba(220,170,50,0.22); }
.round-btn-want { background: #0a2818; border: 1.5px solid rgba(60,200,110,0.55); color: #6ae898; box-shadow: 0 4px 14px rgba(60,200,110,0.18); }
.swipe-flag { position: absolute; top: 20px; font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: 0.05em; padding: 6px 14px; border-radius: 6px; z-index: 3; transform: rotate(-8deg); }
.swipe-flag-want { left: 16px; border: 3px solid #6fbf73; color: #6fbf73; }
.swipe-flag-skip { right: 16px; border: 3px solid #e9695f; color: #e9695f; transform: rotate(8deg); }
.swipe-glow { position: absolute; inset: 0; border-radius: 18px; pointer-events: none; z-index: 2; }
.swipe-glow-want { box-shadow: inset 0 0 0 3px rgba(74,240,144,0.95), inset 0 0 44px rgba(74,240,144,0.4); }
.swipe-glow-skip { box-shadow: inset 0 0 0 3px rgba(233,105,95,0.95), inset 0 0 44px rgba(233,105,95,0.4); }
@keyframes swipe-fly-left {
  0%   { transform: translateX(var(--fly-from, 0px)) rotate(0deg) scale(1); opacity: 1; }
  100% { transform: translateX(-135vw) rotate(-24deg) scale(0.85); opacity: 0; }
}
@keyframes swipe-fly-right {
  0%   { transform: translateX(var(--fly-from, 0px)) rotate(0deg) scale(1); opacity: 1; }
  100% { transform: translateX(135vw) rotate(24deg) scale(0.85); opacity: 0; }
}
@keyframes swipe-fly-up {
  0%   { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
  100% { transform: translateY(-95vh) scale(0.6) rotate(-4deg); opacity: 0; }
}
.swipe-fly-left  { animation: swipe-fly-left  0.3s cubic-bezier(0.45,0,0.7,0.2) forwards; pointer-events: none; z-index: 5; }
.swipe-fly-right { animation: swipe-fly-right 0.3s cubic-bezier(0.45,0,0.7,0.2) forwards; pointer-events: none; z-index: 5; }
.swipe-fly-up    { animation: swipe-fly-up    0.3s cubic-bezier(0.45,0,0.7,0.2) forwards; pointer-events: none; z-index: 5; }

/* tap + entrance polish (v52) */
.btn, .icon-btn, .td-tool-btn { transition: transform 0.14s cubic-bezier(.34,1.56,.64,1), background 0.15s, box-shadow 0.15s, color 0.15s; }
.btn:active, .icon-btn:active, .td-tool-btn:active { transform: scale(0.9); }
@keyframes card-enter { 0% { transform: translateY(16px) scale(0.95); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
.swipe-card { animation: card-enter 0.28s cubic-bezier(.22,.9,.32,1.15); }
@keyframes match-pop { 0% { transform: scale(0.4); opacity: 0; } 70% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
.match-badge, .match-pill { animation: match-pop 0.32s cubic-bezier(.34,1.56,.64,1) 0.04s both; }

/* out now cards */
.outnow-hero { position: relative; border-radius: 14px; overflow: hidden; cursor: pointer; }
.outnow-hero-img { width: 100%; aspect-ratio: 16/7; object-fit: cover; display: block; background: var(--velvet-2); }
.outnow-hero-blank { display: flex; align-items: center; justify-content: center; background: var(--velvet-2); color: var(--brass); }
.outnow-hero-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 24px 12px 10px; background: linear-gradient(to top, rgba(10,5,9,0.95) 30%, rgba(10,5,9,0.45) 65%, transparent); }
.outnow-hero-top { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; margin-bottom: 3px; }
.outnow-hero-title { font-size: 16px; font-weight: 800; color: var(--cream-text); line-height: 1.2; margin-bottom: 2px; }
.outnow-hero-title-sm { font-size: 14px; }
.outnow-hero-genres { font-size: 11px; color: rgba(255,255,255,0.5); margin-bottom: 4px; }
.outnow-save-btn { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border-radius: 50%; background: rgba(10,5,9,0.65); border: 1px solid rgba(255,255,255,0.25); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2; backdrop-filter: blur(6px); }
.outnow-save-btn-active { background: rgba(226,168,54,0.85) !important; border-color: var(--brass) !important; color: var(--ink) !important; }
.outnow-seen-btn { position: absolute; top: 10px; right: 50px; width: 32px; height: 32px; border-radius: 50%; background: rgba(10,5,9,0.65); border: 1px solid rgba(255,255,255,0.25); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2; backdrop-filter: blur(6px); }
.outnow-seen-btn:active { transform: scale(0.9); }
.outnow-all-heroes { display: flex; flex-direction: column; gap: 8px; }
.outnow-zip-row { font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.zip-tap { background: none; border: none; color: var(--muted); font-size: 11px; cursor: pointer; padding: 0; text-align: left; }
.zip-tap:hover { color: var(--cream-text); }
.zip-tap strong { color: var(--cream-text); }
.zip-input { background: var(--velvet-2); border: 1px solid var(--line); color: var(--cream-text); border-radius: 6px; padding: 3px 7px; font-size: 16px; width: 100px; }
.zip-save-btn { background: var(--brass); border: none; color: var(--ink); border-radius: 6px; padding: 3px 9px; font-size: 11px; cursor: pointer; }
.zip-cancel-btn { background: none; border: none; color: var(--muted); font-size: 13px; cursor: pointer; padding: 0 2px; }

/* td stats + cast */
.td-stats { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 10px 0 12px; }
.td-stat { font-size: 12px; color: var(--muted); }
.td-stat span { color: var(--cream-text); font-weight: 600; margin-right: 4px; }
.td-cast-section { margin-bottom: 12px; }
.td-cast-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 6px; }
.td-cast-list { display: flex; flex-wrap: wrap; gap: 6px; }
.td-reddit-btn { display: inline-flex; margin-bottom: 12px; }

/* ticket detail hero */
.td-hero { position: relative; border-radius: 14px; overflow: hidden; margin-bottom: 0; cursor: pointer; }
.td-hero-img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
.td-hero-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 32px 14px 14px; background: linear-gradient(to top, rgba(10,5,9,0.95) 40%, transparent); }
.td-hero-title { font-size: 20px; font-weight: 800; color: var(--cream-text); line-height: 1.2; margin-bottom: 3px; }
.td-hero-genres { font-size: 12px; color: rgba(255,255,255,0.55); }
.td-overview { font-size: 13px; color: var(--muted); line-height: 1.55; margin: 12px 0 4px; }

/* suggestions / search / coming soon shared rows */
.suggest-list, .coming-list { display: flex; flex-direction: column; gap: 10px; }
.suggest-row, .coming-row { display: flex; gap: 12px; background: var(--velvet); border-radius: 12px; padding: 10px 12px; position: relative; cursor: pointer; }
.suggest-thumb, .coming-thumb { width: 46px; height: 69px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: var(--velvet-2); }
.suggest-thumb-fallback, .coming-thumb-fallback { display: flex; align-items: center; justify-content: center; color: var(--brass); }
.suggest-info, .coming-info { flex: 1; min-width: 0; }
.suggest-title, .coming-title { font-weight: 600; font-size: 13.5px; margin-bottom: 2px; }
.suggest-genres { color: var(--muted); font-size: 11.5px; margin-bottom: 6px; }
.coming-date { color: var(--brass-bright); font-size: 11.5px; font-family: 'Space Mono', monospace; margin-bottom: 6px; }
.suggest-links { display: flex; gap: 6px; flex-wrap: wrap; }
.link-pill { font-size: 10.5px; color: var(--cream-text); background: var(--velvet-2); padding: 3px 9px; border-radius: 999px; text-decoration: none; }
.suggest-actions { display: flex; flex-direction: column; gap: 5px; justify-content: center; align-items: center; }

/* search bar */
.search-bar { display: flex; align-items: center; gap: 8px; background: var(--velvet); border-radius: 999px; padding: 10px 16px; margin-bottom: 16px; color: var(--muted); }
.search-input { flex: 1; background: none; border: none; color: var(--cream-text); font-size: 16px; outline: none; }

/* onboarding */
.onboarding { flex: 1; display: flex; align-items: center; justify-content: center; padding: 30px; }
.onboarding-card { text-align: center; max-width: 320px; }
.onboarding-icon { color: var(--brass); margin-bottom: 14px; }
.onboarding-title { font-family: 'Bebas Neue', sans-serif; font-size: 32px; letter-spacing: 0.04em; color: var(--cream-text); margin: 0 0 10px; }
.onboarding-body { font-size: 13.5px; color: var(--muted); line-height: 1.5; margin-bottom: 10px; }

/* ---- new feature styles ---- */

/* imdb rating + streaming providers */
.imdb-badge { font-size: 9.5px; font-weight: 700; color: #f5c518; border: 1px solid rgba(245,197,24,0.5); padding: 1px 6px; border-radius: 4px; white-space: nowrap; }
.link-pill-stream { background: var(--brass); color: var(--ink); border-color: var(--brass); }
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
.match-badge { position: absolute; top: 14px; right: 14px; z-index: 3; font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 999px; backdrop-filter: blur(8px); }
.match-pill { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; flex-shrink: 0; }
.match-high { background: rgba(34,150,86,0.88); color: #eafff3; border: 1px solid rgba(120,240,170,0.9); }
.match-seen { background: rgba(196,140,40,0.92); color: #fff6e6; border: 1px solid rgba(240,200,120,0.9); display: inline-flex; align-items: center; }
.avail-tag { position: absolute; top: 10px; left: 10px; z-index: 3; display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; padding: 3px 7px; border-radius: 999px; backdrop-filter: blur(6px); }
.avail-theaters { background: rgba(226,54,54,0.85); color: #fff; border: 1px solid rgba(255,150,150,0.55); }
.avail-streaming { background: rgba(38,38,46,0.82); color: #cfd6e4; border: 1px solid rgba(150,160,180,0.45); }
.match-mid { background: rgba(198,140,30,0.9); color: #fff7e6; border: 1px solid rgba(245,204,106,0.95); }
.match-low { background: rgba(90,80,80,0.9); color: #ffffff; border: 1px solid rgba(210,200,200,0.7); }

/* swipe poster tap */
.swipe-poster-btn { display: block; width: 100%; padding: 0; border: none; background: none; position: relative; cursor: pointer; flex: 1 1 0; min-height: 0; overflow: hidden; }
.discover-foot { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 12px; }
.discover-foot-bottom { margin-top: 10px; margin-bottom: 0; }

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
.fav-poster-fallback { width: 72px; height: 108px; border-radius: 8px; background: var(--velvet-2); display: flex; align-items: center; justify-content: center; color: var(--brass); }

/* coming soon chips + notes */
.chip-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; margin-bottom: 6px; }
.chip { flex-shrink: 0; background: var(--velvet); border: 1px solid var(--line); color: var(--muted); padding: 7px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.chip-active { background: var(--brass); color: var(--ink); border-color: var(--brass); }
.proactive-note { font-size: 11.5px; margin: 6px 0; padding: 5px 9px; border-radius: 8px; line-height: 1.35; }
.note-hot { background: rgba(47,184,107,0.12); color: #5fd99a; }
.note-stretch { background: rgba(226,168,54,0.12); color: var(--brass-bright); }
.note-cool { background: rgba(154,138,138,0.1); color: var(--muted); }

/* why watch this */
.why-watch {
  font-size: 12px; color: var(--brass-bright); font-style: italic;
  margin-top: 5px; line-height: 1.4;
}

/* logged toast */
.logged-toast {
  display: flex; align-items: center; gap: 8px;
  background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.28);
  border-radius: 10px; padding: 8px 12px; margin: 6px 0;
  font-size: 13px; color: var(--cream-text);
}
.logged-toast a { color: var(--brass-bright); text-decoration: none; display: flex; align-items: center; gap: 4px; font-weight: 600; }
.toast-close { background: none; border: none; color: var(--muted); cursor: pointer; padding: 0; display: flex; align-items: center; margin-left: auto; }

/* year in review */
.yir-wrap { padding: 8px 0 4px; }
.yir-card {
  background: var(--curtain); border: 2px solid var(--line); border-radius: 20px;
  padding: 32px 24px; text-align: center; margin-bottom: 20px; min-height: 220px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
}
.yir-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.7; }
.yir-big { font-family: 'Bebas Neue', sans-serif; font-size: 42px; letter-spacing: 0.03em; line-height: 1; }
.yir-sub { font-size: 14px; color: var(--muted); }
.yir-poster { width: 80px; border-radius: 8px; }
.yir-dots { display: flex; justify-content: center; gap: 8px; margin-bottom: 16px; }
.yir-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--velvet); border: 1px solid var(--line); padding: 0; }
.yir-dot-active { background: var(--brass); border-color: var(--brass); }
.yir-nav { display: flex; justify-content: space-between; gap: 10px; }
.yir-nav .btn { flex: 1; }

/* where presets */
.where-presets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.where-chip {
  background: var(--velvet); border: 1px solid var(--line); color: var(--muted);
  padding: 7px 14px; border-radius: 999px; font-size: 13px; font-weight: 600;
}
.where-chip-active { background: var(--brass); color: var(--ink); border-color: var(--brass); }

/* ticket scanner */
.scan-candidates { display: flex; flex-direction: column; gap: 8px; margin-bottom: 6px; }
.scan-cand { display: flex; align-items: center; gap: 10px; background: var(--velvet); border: 1px solid var(--line); border-radius: 10px; padding: 8px; color: var(--cream-text); text-align: left; font-size: 13px; }
.scan-cand img { width: 36px; height: 54px; border-radius: 5px; object-fit: cover; }
.scan-cand-fallback { width: 36px; height: 54px; border-radius: 5px; background: var(--velvet-2); display: flex; align-items: center; justify-content: center; color: var(--brass); }
.scan-cand-active { border-color: var(--brass); background: rgba(226,168,54,0.1); }
.scan-raw { font-size: 10.5px; color: var(--muted); white-space: pre-wrap; max-height: 140px; overflow-y: auto; font-family: 'Space Mono', monospace; }

/* action burst animation */
.burst-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 100; }
.burst-icon { animation: burstPop 0.9s cubic-bezier(.18,.85,.32,1) forwards; }
.burst-collect { color: var(--brass-bright); filter: drop-shadow(0 0 18px rgba(245,205,110,0.7)); }
.burst-want { color: #4af090; filter: drop-shadow(0 0 18px rgba(74,240,144,0.7)); }
@keyframes burstPop {
  0%   { transform: scale(0.1) rotate(-20deg); opacity: 0; }
  18%  { transform: scale(1.55) rotate(6deg); opacity: 1; }
  40%  { transform: scale(1.15) rotate(-2deg); opacity: 1; }
  60%  { transform: scale(1.05) rotate(0deg); opacity: 1; }
  80%  { transform: scale(0.95) translateY(-20px); opacity: 0.7; }
  100% { transform: scale(0.7) translateY(-60px); opacity: 0; }
}

/* ---- desktop layout (v54, audit A) ---- */
@media (min-width: 768px) {
  .app { max-width: 1060px; }
  .app-main { padding: 8px 28px 116px; }
  .tab-bar { max-width: 620px; bottom: 18px; border: 1px solid var(--line); border-radius: 22px; padding: 10px 8px; box-shadow: 0 14px 44px rgba(0,0,0,0.55); background: rgba(30,0,0,0.85); backdrop-filter: blur(14px); }
  .tab-btn { border-radius: 14px; }
  .stub-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 18px; }
  .stub-grid-compact { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .modal-veil { align-items: center; }
  .modal-card { max-width: 560px; border-radius: 20px; max-height: 84vh; }
  .modal-wide { max-width: 860px; }
  .outnow-hero-img { aspect-ratio: 16/6; }
  .swipe-stack { max-width: 340px; }
  .empty-body { max-width: 340px; }
  .onboarding-card { max-width: 400px; }
}
@media (min-width: 1200px) {
  .app { max-width: 1240px; }
  .stub-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  .stub-grid-compact { grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); }
}

@media (prefers-reduced-motion: reduce) {
  .burst-icon { animation: none !important; }
  .stub-shine, .spin, .flip-stage { animation: none !important; transition: none !important; }
  .swipe-fly-left, .swipe-fly-right, .swipe-fly-up { animation-duration: 0.12s !important; }
  .swipe-glow { display: none !important; }
}
`;

/* ---------------------------------------------------------
   MOUNT
--------------------------------------------------------- */

createRoot(document.getElementById("root")).render(/*#__PURE__*/_jsx(App, {}));
