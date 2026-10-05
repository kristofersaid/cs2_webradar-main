// Pozycje liter bombsite'ów A/B na radarze (x, y jako ułamek 0..1 obrazka).
// Dla większości map pozycje policzyłem ze środka stref nav-mesha gry
// (BombsiteA/B) tym samym wzorem co pozycje graczy — więc siedzą na sitach.
// de_nuke: site'y są jeden nad drugim (inne piętra), litery lekko rozsunięte.
// de_anubis i mapy wingman (golden/grail/palacio/thera): pozycje orientacyjne.
//
// NAJWAŻNIEJSZE: literę możesz po prostu ZŁAPAĆ i PRZESUNĄĆ w przeglądarce
// (myszka albo palec na telefonie) — pozycja zapisze się sama (localStorage)
// i zostanie na potem. Podwójne kliknięcie litery = powrót do pozycji z tego pliku.

export const BOMBSITES = {
  de_mirage: [
    { label: "A", x: 0.5596, y: 0.7149 },
    { label: "B", x: 0.2521, y: 0.2938 },
  ],
  de_dust2: [
    { label: "A", x: 0.7895, y: 0.1237 },
    { label: "B", x: 0.1547, y: 0.2034 },
  ],
  de_inferno: [
    { label: "A", x: 0.8378, y: 0.6883 },
    { label: "B", x: 0.5096, y: 0.2013 },
  ],
  de_nuke: [
    { label: "A", x: 0.5425, y: 0.5288 },
    { label: "B", x: 0.6082, y: 0.5095 },
  ],
  de_ancient: [
    { label: "A", x: 0.2575, y: 0.2665 },
    { label: "B", x: 0.7715, y: 0.3846 },
  ],
  de_anubis: [
    { label: "A", x: 0.8, y: 0.17 },
    { label: "B", x: 0.55, y: 0.6 },
  ],
  de_overpass: [
    { label: "A", x: 0.4542, y: 0.1975 },
    { label: "B", x: 0.7325, y: 0.3109 },
  ],
  de_vertigo: [
    { label: "A", x: 0.7024, y: 0.594 },
    { label: "B", x: 0.2242, y: 0.2572 },
  ],
  de_train: [
    { label: "A", x: 0.6203, y: 0.4579 },
    { label: "B", x: 0.652, y: 0.8111 },
  ],
  de_cache: [
    { label: "A", x: 0.323, y: 0.2807 },
    { label: "B", x: 0.3316, y: 0.7307 },
  ],
  de_golden: [
    { label: "A", x: 0.5, y: 0.3 },
    { label: "B", x: 0.85, y: 0.55 },
  ],
  de_grail: [
    { label: "A", x: 0.6, y: 0.08 },
    { label: "B", x: 0.6, y: 0.68 },
  ],
  de_palacio: [
    { label: "A", x: 0.15, y: 0.12 },
    { label: "B", x: 0.5, y: 0.68 },
  ],
  de_thera: [
    { label: "A", x: 0.6, y: 0.08 },
    { label: "B", x: 0.8, y: 0.3 },
  ],
};

const OVERRIDES_KEY = "bombsite_overrides_v1";

const isValidPos = (p) =>
  p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  p.x >= 0 &&
  p.x <= 1 &&
  p.y >= 0 &&
  p.y <= 1;

export const loadOverrides = () => {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    // odfiltruj śmieci żeby zły zapis nie wywalił radaru
    const clean = {};
    for (const [map, sites] of Object.entries(parsed)) {
      if (!Array.isArray(sites)) continue;
      const list = sites
        .filter((s) => s && typeof s.label === "string" && isValidPos(s))
        .map((s) => ({ label: s.label, x: s.x, y: s.y }));
      if (list.length > 0) clean[map] = list;
    }
    return clean;
  } catch {
    return {};
  }
};

// Pozycje dla mapy: domyślne z tego pliku + przesunięcia (mają pierwszeństwo).
// `overrides` to { mapa: [{label,x,y}] } — z localStorage (cache) albo z serwera.
export const getSites = (mapName, overrides) => {
  const defaults = BOMBSITES[mapName];
  if (!defaults) return null;
  const list = (overrides || loadOverrides())[mapName];
  if (!list) return defaults.map((s) => ({ ...s }));
  const byLabel = Object.fromEntries(list.map((s) => [s.label, s]));
  return defaults.map((s) => (byLabel[s.label] ? { ...byLabel[s.label] } : { ...s }));
};

// Zapis przesuniętej litery (wołane przy puszczeniu przycisku). Zwraca cały stan.
export const saveSitePosition = (mapName, label, x, y) => {
  if (!BOMBSITES[mapName] || !isValidPos({ x, y })) return loadOverrides();
  try {
    const all = loadOverrides();
    const current = getSites(mapName, all).map((s) =>
      s.label === label ? { label, x, y } : { ...s }
    );
    all[mapName] = current;
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(all));
    return all;
  } catch {
    return loadOverrides();
  }
};

// Powrót do pozycji z tego pliku dla całej mapy.
export const resetSites = (mapName) => {
  try {
    const all = loadOverrides();
    delete all[mapName];
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(all));
    return all;
  } catch {
    return loadOverrides();
  }
};

// Nadpisz cały cache pozycjami z serwera (pełny snapshot po połączeniu).
export const saveAllOverrides = (all) => {
  try {
    const clean = {};
    if (all && typeof all === "object") {
      for (const [map, sites] of Object.entries(all)) {
        if (!Array.isArray(sites)) continue;
        const list = sites
          .filter((s) => s && (s.label === "A" || s.label === "B") && isValidPos(s))
          .map((s) => ({ label: s.label, x: s.x, y: s.y }));
        if (list.length > 0) clean[map] = list;
      }
    }
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(clean));
    return clean;
  } catch {
    return loadOverrides();
  }
};
