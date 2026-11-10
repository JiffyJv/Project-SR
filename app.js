// Random Song — picks a random track from Spotify's catalog.
// Auth: Authorization Code + PKCE (browser-safe, no client secret needed).

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SEARCH_URL = "https://api.spotify.com/v1/search";

const PAGE_SIZE = 10;   // Spotify caps search at 10 per request (Feb 2026)
const MAX_OFFSET = 990; // search only reaches ~1000 results deep
const REDIRECT_URI = location.origin + location.pathname;

const ALPHABETS = [
  "abcdefghijklmnopqrstuvwxyz",
  "àáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ",
  "абвгдежзийклмнопрстуфхцчшщыэюя",
  "あいうえおかきくけこさしすせそたちつてと",
  "가나다라마바사아자차카타파하",
  "αβγδεζηθικλμνξοπρστυφχψω",
  "ابتثجحخدذرزسشصضطظعغفقكلمنهوي",
];

const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => localStorage.getItem(k),
  set: (k, v) => localStorage.setItem(k, v),
  del: (k) => localStorage.removeItem(k),
};

let rolls = [];
let rolling = false;

/* ---------- helpers ---------- */

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function randomQuery() {
  const chars = [...pick(ALPHABETS)];
  const len = pick([1, 2, 2, 3]);
  let text = "";
  for (let i = 0; i < len; i++) text += pick(chars);
  const year = randInt(1950, new Date().getFullYear());
  return `${text} year:${year}`;
}

function showError(msg) {
  const el = $("error");
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(len = 64) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return b64url(bytes).slice(0, len);
}

/* ---------- auth (PKCE) ---------- */

async function login() {
  const clientId = $("clientId").value.trim();
  if (!clientId) return showError("Paste your Spotify Client ID first.");
  store.set("client_id", clientId);

  const verifier = randomString(64);
  store.set("verifier", verifier);
  const challenge = b64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  );

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  location.href = `${AUTH_URL}?${params}`;
}

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: store.get("client_id"), ...body }),
  });
  if (!res.ok) throw new Error("Spotify login failed. Check your Client ID and Redirect URI.");
  const data = await res.json();
  store.set("access_token", data.access_token);
  store.set("expires_at", String(Date.now() + data.expires_in * 1000));
  if (data.refresh_token) store.set("refresh_token", data.refresh_token);
}

async function getToken() {
  if (Date.now() < Number(store.get("expires_at") || 0) - 30000) {
    return store.get("access_token");
  }
  const refresh = store.get("refresh_token");
  if (!refresh) throw new Error("Session expired. Please reconnect.");
  await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  return store.get("access_token");
}

function logout() {
  ["access_token", "refresh_token", "expires_at", "verifier"].forEach(store.del);
  rolls = [];
  init();
}

/* ---------- spotify search ---------- */

async function searchPage(query, offset) {
  const token = await getToken();
  const params = new URLSearchParams({
    q: query, type: "track", limit: PAGE_SIZE, offset,
  });
  const res = await fetch(`${SEARCH_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) {
    const wait = Number(res.headers.get("Retry-After") || 2);
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
    return [];
  }
  if (res.status === 400) return []; // offset too deep for this query
  if (res.status === 401) throw new Error("Session expired. Please reconnect.");
  if (!res.ok) throw new Error(`Spotify error (${res.status}).`);
  const data = await res.json();
  return (data.tracks?.items || []).filter(Boolean);
}

async function randomTrack() {
  for (let i = 0; i < 25; i++) {
    const items = await searchPage(randomQuery(), randInt(0, MAX_OFFSET));
    if (items.length) return pick(items);
  }
  throw new Error("Couldn't find a track. Try again.");
}

/* ---------- UI ---------- */

function showTrack(t) {
  const art = t.album?.images?.[0]?.url || "";
  $("art").src = art;
  $("title").textContent = t.name;
  $("artist").textContent = t.artists.map((a) => a.name).join(", ");
  const year = (t.album?.release_date || "").slice(0, 4);
  $("album").textContent = [t.album?.name, year].filter(Boolean).join(" · ");
  $("player").src = `https://open.spotify.com/embed/track/${t.id}?theme=0`;
  $("result").classList.remove("hidden");
  $("empty").classList.add("hidden");
  // restart the entrance animation
  $("result").style.animation = "none";
  void $("result").offsetHeight;
  $("result").style.animation = "";
}

function renderHistory() {
  const list = $("history");
  list.innerHTML = "";
  rolls.forEach((t) => {
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.src = t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || "";
    img.alt = "";
    const box = document.createElement("div");
    const title = document.createElement("div");
    title.className = "t";
    title.textContent = t.name;
    const artist = document.createElement("div");
    artist.className = "a";
    artist.textContent = t.artists.map((a) => a.name).join(", ");
    box.append(title, artist);
    li.append(img, box);
    li.addEventListener("click", () => showTrack(t));
    list.append(li);
  });
  $("historyWrap").classList.toggle("hidden", rolls.length === 0);
}

async function roll() {
  if (rolling) return;
  rolling = true;
  showError("");
  const btn = $("rollBtn");
  btn.disabled = true;
  btn.classList.add("loading");
  try {
    const t = await randomTrack();
    showTrack(t);
    rolls = [t, ...rolls.filter((h) => h.id !== t.id)].slice(0, 8);
    renderHistory();
  } catch (e) {
    showError(e.message);
    if (/reconnect/i.test(e.message)) setTimeout(logout, 1500);
  } finally {
    rolling = false;
    btn.disabled = false;
    btn.classList.remove("loading");
  }
}

/* ---------- boot ---------- */

async function init() {
  showError("");
  $("redirect").textContent = REDIRECT_URI;
  $("clientId").value = store.get("client_id") || "";

  const code = new URLSearchParams(location.search).get("code");
  const authError = new URLSearchParams(location.search).get("error");

  if (authError) {
    history_clean();
    showError("Spotify login was cancelled.");
  } else if (code) {
    try {
      await tokenRequest({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: store.get("verifier"),
      });
    } catch (e) {
      showError(e.message);
    }
    history_clean();
  }

  const loggedIn = !!store.get("refresh_token") || Date.now() < Number(store.get("expires_at") || 0);
  $("setup").classList.toggle("hidden", loggedIn);
  $("app").classList.toggle("hidden", !loggedIn);
  $("result").classList.add("hidden");
  $("empty").classList.remove("hidden");
  renderHistory();
}

function history_clean() {
  window.history.replaceState({}, "", REDIRECT_URI);
}

$("loginBtn").addEventListener("click", login);
$("rollBtn").addEventListener("click", roll);
$("logoutBtn").addEventListener("click", logout);
$("clientId").addEventListener("keydown", (e) => e.key === "Enter" && login());
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !$("app").classList.contains("hidden") &&
      !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    roll();
  }
});

init();
