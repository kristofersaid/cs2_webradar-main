export const getRadarPosition = (mapData, entityCoords) => {
  if (!entityCoords.x || !entityCoords.y) {
    return { x: 0, y: 0 };
  }

  if (!mapData.x || !mapData.y) {
    return { x: 0, y: 0 };
  }

  const position = {
    x: (entityCoords.x - mapData.x) / mapData.scale / 1024,
    y: (((entityCoords.y - mapData.y) / mapData.scale) * -1.0) / 1024,
  };

  return position;
};

// Kolory graczy z linku: ?colors=7656119...:#ff0000,7656119...:00ff00
// Format: SteamID64:hex (hex z # lub bez, 3 albo 6 znaków), wpisy po , lub ;.
// Zwraca { steamId64: "#rrggbb" }. Błędne wpisy są ignorowane.
export const parseColorOverrides = (raw) => {
  const out = {};
  if (!raw) return out;
  for (const part of String(raw).split(/[,;]/)) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const id = part.slice(0, idx).trim();
    let hex = part.slice(idx + 1).trim().replace(/^#/, "");
    if (!/^765\d{14}$/.test(id)) continue;
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      hex = hex.split("").map((ch) => ch + ch).join("");
    }
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) continue;
    out[id] = `#${hex.toLowerCase()}`;
  }
  return out;
};

// Lista graczy (?lista=1): numerki 1..N TYLKO dla wrogów (m_team != localTeam).
// Sortowanie po SteamID (jak komenda 'lista' w konsoli overlay), żeby numer
// z komendy 'kolor <nr>' zgadzał się ze znaczkiem na radarze.
// Bez znanego localTeam nie wiadomo kto jest wrogiem -> pusto.
export const assignPlayerNumbers = (players, localTeam) => {
  if (localTeam === undefined || localTeam === null) return { order: [], byIdx: {} };
  const order = [...(players || [])]
    .filter((p) => p.m_team !== localTeam && /^765\d{14}$/.test(String(p.m_steam_id ?? "")))
    .sort((a, b) => (String(a.m_steam_id) < String(b.m_steam_id) ? -1 : 1));
  const byIdx = {};
  order.forEach((p, i) => {
    byIdx[p.m_idx] = i + 1;
  });
  return { order, byIdx };
};

// Tryby ?lista=: "both" (numerki + panel), "badges" (same numerki,
// panel tylko w konsoli overlay), "panel" (sam panel), "off" (wył.).
export const LIST_MODES = ["off", "badges", "panel", "both"];

export const parseListMode = (raw) => {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "badges" || v === "numery" || v === "numerki") return "badges";
  if (v === "panel" || v === "lista") return "panel";
  if (v === "1" || v === "true" || v === "yes" || v === "both" || v === "all") return "both";
  return "off";
};

// Rozmiar awatara (?pfpsize=): icon/medium/full do pozycjonowania jak zwykle,
// mega = sztywne 256px, liczba = ręczne px (16..512, clamp).
// Zwraca gotowy CSS (liczba vw albo px).
export const resolveAvatarSize = (pfpSize, avatarVw) => {
  const m = /^\d+$/.test(String(pfpSize || "")) ? parseInt(pfpSize, 10) : 0;
  if (m > 0) return `${Math.min(512, Math.max(16, m))}px`;
  if (pfpSize === "mega") return "256px";
  return `${avatarVw}vw`;
};

// Tryb follow (?follow=1): przytnij środek widoku tak, żeby przy danym
// zoomie nie było widać tła poza mapą (o ile gracz nie stoi przy samej krawędzi).
// Zwraca też gotowy CSS transform centrujący punkt (fx, fy) przy zoomie.
export const clampFollowCenter = (fx, fy, zoom) => {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const half = 0.5 / z;
  const clamp = (v) => Math.min(1 - half, Math.max(half, v));
  return { x: clamp(fx), y: clamp(fy) };
};

export const followTransform = (fx, fy, zoom) => {
  const c = clampFollowCenter(fx, fy, zoom);
  return `translate(50%, 50%) scale(${zoom}) translate(${-c.x * 100}%, ${-c.y * 100}%)`;
};

export const playerColors = [
  // blue
  "#84c8ed",

  // green
  "#009a7d",

  // yellow
  "#eadd40",

  // orange
  "#df7d29",

  // purple
  "#b72b92",

  // white
  "#ffffff",
];

export const teamEnum = {
  none: 0,
  spectator: 1,
  terrorist: 2,
  counterTerrorist: 3,
};
