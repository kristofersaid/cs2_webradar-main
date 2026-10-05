// Lista Twoich kont Steam (SteamID64).
// Żeby dodać konto, dopisz jego SteamID64 w pliku:
//   webapp/public/my_steam_accounts.json
// albo dodaj je w panelu "Moje konta" w przeglądarce (localhost:5173).
// Każdy gracz, którego m_steam_id jest na tej liście, będzie na radarze ZIELONY.

const STORAGE_ADDED_KEY = "my_steam_ids_added";
const STORAGE_BLOCKED_KEY = "my_steam_ids_blocked";
// Stary klucz (poprzednia wersja) — traktujemy jako dopiski użytkownika.
const STORAGE_LEGACY_KEY = "my_steam_ids";

// Zapasowa lista (gdyby auto-detect konta nie zadziałał).
// Główne wykrywanie jest automatyczne: serwer odczytuje konto zalogowane
// w Steam na hoście i rozsyła je jako m_local_steam_id.
// Trzymaj tu synchronizowaną kopię swoich kont.
export const DEFAULT_STEAM_IDS = ["76561199250613456", "76561198636183978"];

export const normalizeSteamId = (id) => String(id ?? "").trim();

export const dedupeSteamIds = (ids) => {
  const seen = new Set();
  const out = [];
  for (const raw of ids || []) {
    const id = normalizeSteamId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

const readKey = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? dedupeSteamIds(parsed) : [];
  } catch {
    return [];
  }
};

const writeKey = (key, ids) => {
  try {
    localStorage.setItem(key, JSON.stringify(dedupeSteamIds(ids)));
  } catch {
    /* ignore (np. prywatny tryb) */
  }
};

export const getAddedSteamIds = () => dedupeSteamIds([...readKey(STORAGE_ADDED_KEY), ...readKey(STORAGE_LEGACY_KEY)]);
export const getBlockedSteamIds = () => readKey(STORAGE_BLOCKED_KEY);

// Dodane w panelu (zapisywane w przeglądarce).
export const addStoredSteamId = (rawId) => {
  const id = normalizeSteamId(rawId);
  if (!id) return [];
  const added = dedupeSteamIds([...getAddedSteamIds(), id]);
  writeKey(STORAGE_ADDED_KEY, added);
  // Skoro użytkownik dodał konto, to na pewno nie ma być blokowane.
  const blocked = getBlockedSteamIds().filter((x) => x !== id);
  writeKey(STORAGE_BLOCKED_KEY, blocked);
  // Wyczyść stary klucz żeby nie dublować.
  try { localStorage.removeItem(STORAGE_LEGACY_KEY); } catch { /* ignore */ }
  return added;
};

// Usunięcie w panelu: znika z dopisków + ląduje na blockliście,
// więc nie wróci po przeładowaniu nawet jeśli jest w pliku JSON.
// (Żeby trwale usunąć konto z pliku, wyedytuj też my_steam_accounts.json.)
export const removeStoredSteamId = (rawId) => {
  const id = normalizeSteamId(rawId);
  const added = getAddedSteamIds().filter((x) => x !== id);
  writeKey(STORAGE_ADDED_KEY, added);
  try { localStorage.removeItem(STORAGE_LEGACY_KEY); } catch { /* ignore */ }
  const blocked = dedupeSteamIds([...getBlockedSteamIds(), id]);
  writeKey(STORAGE_BLOCKED_KEY, blocked);
  return added;
};

// Łączy: plik my_steam_accounts.json + dopiski z panelu − zablokowane.
export const loadMySteamIds = async () => {
  let fromFile = [];
  try {
    const res = await fetch("./my_steam_accounts.json", { cache: "no-store" });
    if (res.ok) {
      const parsed = await res.json();
      const arr = Array.isArray(parsed) ? parsed : parsed?.steam_ids;
      fromFile = dedupeSteamIds(arr || []);
    }
  } catch {
    /* ignore - użyjemy domyślnej listy */
  }

  const fromStorage = getAddedSteamIds();
  const blocked = new Set(getBlockedSteamIds());
  const merged = dedupeSteamIds([...fromFile, ...fromStorage]).filter((id) => !blocked.has(id));

  // Jeśli plik i localStorage są puste -> wróć do domyślnej listy,
  // żeby radar nie zgubił zaznaczenia lokalnego gracza.
  if (merged.length === 0 && fromFile.length === 0 && fromStorage.length === 0) {
    return dedupeSteamIds(DEFAULT_STEAM_IDS).filter((id) => !blocked.has(id));
  }
  return merged;
};

export const isMyAccount = (steamId, mySteamIds) => {
  if (!mySteamIds || mySteamIds.length === 0) return false;
  const id = normalizeSteamId(steamId);
  if (!id || id === "0") return false;
  return mySteamIds.includes(id);
};

// ---------------------------------------------------------------------------
// Cache awatarów Steam (?pfp=1): { steamId64: url }. Szybki start z localStorage,
// na bieżąco uzupełniane z serwera (serwer pobiera z profilu Steam, bo
// przeglądarka nie może — Steam blokuje CORS).
// ---------------------------------------------------------------------------
const AVATAR_CACHE_KEY = "steam_avatars";
const MAX_CACHED_AVATARS = 500;

export const isValidAvatarEntry = (id, url) =>
  /^765\d{14}$/.test(id) && typeof url === "string" && url.startsWith("https://");

// Jeden wpis cache: stary string (jeden URL) albo trójka {icon,medium,full}.
export const cleanAvatarEntry = (v) => {
  if (typeof v === "string") {
    return v.startsWith("https://") ? v : null;
  }
  if (!v || typeof v !== "object") return null;
  const triple = {};
  for (const k of ["icon", "medium", "full"]) {
    if (typeof v[k] === "string" && v[k].startsWith("https://")) triple[k] = v[k];
  }
  return Object.keys(triple).length > 0 ? triple : null;
};

// Wybierz URL w żądanym rozmiarze (fallback: full > medium > icon > string).
export const pickAvatarUrl = (entry, size) => {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return "";
  return entry[size] || entry.full || entry.medium || entry.icon || "";
};

// Odfiltruj poprawne wpisy z czegokolwiek (serwer, localStorage).
export const cleanAvatarMap = (obj) => {
  const clean = {};
  if (!obj || typeof obj !== "object") return clean;
  for (const [k, v] of Object.entries(obj)) {
    if (!/^765\d{14}$/.test(k)) continue;
    const entry = cleanAvatarEntry(v);
    if (entry) clean[k] = entry;
  }
  return clean;
};

export const loadAvatars = () => {
  try {
    const raw = localStorage.getItem(AVATAR_CACHE_KEY);
    if (!raw) return {};
    return cleanAvatarMap(JSON.parse(raw));
  } catch {
    return {};
  }
};

export const saveAvatars = (map) => {
  try {
    const clean = cleanAvatarMap(map);
    const keys = Object.keys(clean);
    if (keys.length > MAX_CACHED_AVATARS) {
      for (const k of keys.slice(0, keys.length - MAX_CACHED_AVATARS)) delete clean[k];
    }
    localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(clean));
    return clean;
  } catch {
    return cleanAvatarMap(map);
  }
};
