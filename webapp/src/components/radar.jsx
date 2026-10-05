import { useEffect, useRef, useState } from "react";
import Player from "./player";
import Bomb from "./bomb";
import BombSites from "./BombSites";
import { getRadarPosition, followTransform } from "../utilities/utilities";
import { isMyAccount } from "../utilities/steamAccounts";

// followMode (?follow=1 w URL): mapa jest przybliżona (followZoom)
// i wycentrowana na Tobie (zielony gracz). Mapa się NIE obraca
// (zawsze północ u góry) — przesuwa się tylko widok. Pozycja jest
// przycięta tak, żeby nie było widać tła poza mapą.
const Radar = ({
  playerArray,
  radarImage,
  mapData,
  localTeam,
  bombData,
  settings,
  mySteamIds = [],
  bombSites,
  onSiteMove,
  onSiteReset,
  followMode = false,
  followZoom = 2.5,
  // Jawny SteamID do śledzenia (?follow=765...). Puste = auto (zielony gracz).
  followSteamId = "",
  // Jawne kolory graczy (?colors=id:hex,...). Najwyższy priorytet.
  colorOverrides = {},
  // Awatary wrogów (?pfp=1): { steamId: url | {icon,medium,full} }.
  avatars = {},
  pfpMode = false,
  pfpSize = "full",
  // Numerki (?lista=1): { m_idx: numer }.
  playerNumbers = {},
  listMode = false,
}) => {
  const radarBoxRef = useRef(null);
  // Rozmiar radaru w px mierzony RAZ (ResizeObserver), nie w każdym graczu co tick.
  // offsetWidth/getBoundingClientRect w dzieciach wymuszałyby reflow na każdy tick.
  const [radarPx, setRadarPx] = useState(0);

  useEffect(() => {
    const el = radarBoxRef.current;
    if (!el) return undefined;
    const update = () => {
      const w = el.clientWidth || 0;
      setRadarPx((prev) => (prev === w ? prev : w));
    };
    update();
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    window.addEventListener("resize", update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  // Ostatni znany środek (żeby widok nie skakał gdy pozycja chwilowo pusta).
  const lastCenterRef = useRef({ x: 0.5, y: 0.5 });
  // Diagnostyka (tylko do konsoli F12, nic na mapie się nie zmienia).
  const followDbgRef = useRef("");

  let center = lastCenterRef.current;
  let followedId = "";
  if (followMode) {
    const local = (playerArray || []).find((p) =>
      followSteamId
        ? String(p.m_steam_id) === followSteamId
        : isMyAccount(p.m_steam_id, mySteamIds)
    );
    followedId = local ? String(local.m_steam_id) : "";
    if (local && local.m_position) {
      const pos = getRadarPosition(mapData, local.m_position);
      if (pos && (pos.x > 0 || pos.y > 0)) {
        center = { x: pos.x, y: pos.y };
        lastCenterRef.current = center;
      }
    }
    // Loguj tylko przy zmianie (znaleziono / zgubiono / inny mecz).
    const dbgKey = `${followedId || "BRAK"}|${(playerArray || []).length}|${mapData?.name}`;
    if (followDbgRef.current !== dbgKey) {
      followDbgRef.current = dbgKey;
      if (followedId) {
        console.info(`[follow] śledzę gracza ${followedId} (centrum ${center.x.toFixed(3)}, ${center.y.toFixed(3)})`);
      } else {
        console.warn(
          `[follow] NIE znaleziono gracza (jade na ${followSteamId ? "jawny SteamID " + followSteamId : "auto"}). ` +
          `Moje konta: ${mySteamIds.join(",") || "(puste — zrestartuj serwer: radar.bat)"}. ` +
          `Gracze na serwerze: ${(playerArray || []).map((p) => p.m_steam_id).join(",") || "(brak)"}`
        );
      }
    }
  }

  const viewStyle = followMode
    ? {
        position: "relative",
        width: "100%",
        height: "100%",
        // WAŻNE: skala musi liczyć się od rogu (0,0), nie od środka —
        // inaczej translate w followTransform trafia obok gracza.
        transformOrigin: "0 0",
        transform: followTransform(center.x, center.y, followZoom),
        transition: "transform 120ms linear",
        willChange: "transform",
      }
    : { position: "relative", width: "100%", height: "100%" };

  return (
    <div id="radar" ref={radarBoxRef} className={`relative overflow-hidden origin-center`}>
      <div style={viewStyle}>
        <img className={`w-full h-auto`} src={radarImage} />

        <BombSites
          mapName={mapData?.name}
          sites={bombSites}
          onMove={onSiteMove}
          onReset={onSiteReset}
        />

        {playerArray.map((player) => (
          <Player
            key={player.m_idx}
            playerData={player}
            mapData={mapData}
            radarSizePx={radarPx}
            localTeam={localTeam}
            settings={settings}
            mySteamIds={mySteamIds}
            colorOverrides={colorOverrides}
            avatars={avatars}
            pfpMode={pfpMode}
            pfpSize={pfpSize}
            playerNumber={playerNumbers[player.m_idx]}
            listMode={listMode}
          />
        ))}

        {bombData && (
          <Bomb
            bombData={bombData}
            mapData={mapData}
            radarSizePx={radarPx}
            localTeam={localTeam}
            settings={settings}
          />
        )}
      </div>
    </div>
  );
};

export default Radar;
