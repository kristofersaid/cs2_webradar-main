import ReactDOM from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import Radar from "./components/Radar";
import MaskedIcon from "./components/maskedicon";
import {
  loadMySteamIds,
  dedupeSteamIds,
  normalizeSteamId,
  loadAvatars,
  saveAvatars,
} from "./utilities/steamAccounts";
import {
  getSites,
  loadOverrides,
  saveSitePosition,
  saveAllOverrides,
  resetSites,
} from "./utilities/bombsites";
import { parseColorOverrides } from "./utilities/utilities";
import { assignPlayerNumbers, parseListMode } from "./utilities/utilities";
import PlayerList from "./components/PlayerList";

const CONNECTION_TIMEOUT = 5000;
const RECONNECT_DELAY = 2000;

/* Dane zawsze pochodzą z komputera-host (PC z CS2 + usermode.exe).
   Frontend łączy się do tego samego hosta, z którego załadowano stronę
   (window.location.hostname), więc podgląd działa też na telefonie w tej samej sieci Wi-Fi.
   Np. otworzysz http://192.168.1.10:5173 na telefonie -> WebSocket poleci do ws://192.168.1.10:22006 */
const PORT = 22006;

const getWebSocketURL = () => {
  const host = window.location.hostname || "localhost";
  return `ws://${host}:${PORT}/cs2_webradar`;
};

const DEFAULT_SETTINGS = {
  dotSize: 1,
  bombSize: 0.5,
};

// Tryb follow: ?follow=1 centruje (przybliżoną) mapę na Tobie, bez obracania.
// Można też wskazać konto jawnie: ?follow=76561198636183978.
// Opcjonalnie &zoom=2.5 (zakres 1.2–5, domyślnie 2.5). Np.:
//   http://localhost:5173/?follow=1
//   http://192.168.1.10:5173/?follow=1&zoom=3
const QUERY = new URLSearchParams(window.location.search);
const _followRaw = (QUERY.get("follow") || "").toLowerCase();
const FOLLOW_STEAM_ID = /^765\d{14}$/.test(QUERY.get("follow") || "") ? QUERY.get("follow").trim() : "";
const FOLLOW_MODE = FOLLOW_STEAM_ID !== "" || ["1", "true", "yes"].includes(_followRaw);
const _zoom = parseFloat(QUERY.get("zoom"));
const FOLLOW_ZOOM = Number.isFinite(_zoom) ? Math.min(5, Math.max(1.2, _zoom)) : 2.5;

// Awatary wrogów nad kropkami: ?pfp=1 (pobiera serwer, bo Steam blokuje CORS).
// Rozmiar: ?pfpsize=icon|medium|full (domyślnie full).
// Np.: http://localhost:5173/?pfp=1&pfpsize=medium
const PFP_MODE = ["1", "true", "yes"].includes((QUERY.get("pfp") || "").toLowerCase());
const _pfpSize = (QUERY.get("pfpsize") || QUERY.get("pfp_size") || "full").toLowerCase();
// Preset (icon/medium/full/mega) albo ręczne px (np. ?pfpsize=128).
const PFP_SIZE = ["icon", "medium", "full", "mega"].includes(_pfpSize)
  ? _pfpSize
  : (/^\d+$/.test(_pfpSize) ? _pfpSize : "full");

// Widoczna lista graczy + numerki: ?lista=1 (oba), =badges (same numerki,
// lista tylko w konsoli overlay), =panel (sam panel). Np. ?lista=badges
const LIST_VARIANT = parseListMode(QUERY.get("lista") ?? QUERY.get("list"));
const SHOW_BADGES = LIST_VARIANT === "both" || LIST_VARIANT === "badges";
const SHOW_PANEL = LIST_VARIANT === "both" || LIST_VARIANT === "panel";

// Osobna strona tylko z listą (?panel=1): bez mapy, przezroczyste tło.
// Np.: http://localhost:5173/?panel=1  (overlay z samą listą obok radaru)
const PANEL_MODE = ["1", "true", "yes"].includes(
  ((QUERY.get("panel") ?? "")).toLowerCase()
);

// Kolory graczy z linku: ?colors=7656119...:#ff0000,7656119...:00ff00
// (hex z # lub bez, 3 albo 6 znaków; wpisy po przecinku lub średniku).
// Np.: http://localhost:5173/?colors=76561198636183978:#ff00ff,76561199250613456:00ff00
// Nadpisuje domyślne kolory (Ty/zziomek/wróg) — działa też łącznie z ?follow=1.
const COLOR_OVERRIDES = parseColorOverrides(QUERY.get("colors") ?? QUERY.get("color") ?? "");

const App = () => {
  const [playerArray, setPlayerArray] = useState([]);
  const [mapData, setMapData] = useState();
  const [localTeam, setLocalTeam] = useState();
  const [bombData, setBombData] = useState();
  const [settings] = useState(DEFAULT_SETTINGS);
  const [mySteamIds, setMySteamIds] = useState([]);
  // Konto wykryte automatycznie przez serwer (Steam zalogowany na hoście).
  // Ma pierwszeństwo — nie wymaga żadnej listy ani klikania.
  const [autoSteamId, setAutoSteamId] = useState("");

  // Zapasowa lista z pliku (gdyby auto-detect nie zadziałał).
  useEffect(() => {
    let cancelled = false;
    loadMySteamIds().then((ids) => {
      if (!cancelled) setMySteamIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Efektywna lista "moich" kont: auto-detect + zapasowa lista z pliku.
  const effectiveSteamIds = useMemo(
    () => dedupeSteamIds([...(autoSteamId ? [autoSteamId] : []), ...mySteamIds]),
    [autoSteamId, mySteamIds]
  );

  // Cache transformacji map (data.json): fetch + setState TYLKO przy zmianie mapy,
  // nie przy każdym ticku z gry. Wcześniej leciał fetch na każdą wiadomość WS.
  const mapCacheRef = useRef({});
  const mapNameRef = useRef(null);

  // Pozycje liter A/B: localStorage jako cache + sync przez serwer,
  // żeby edycja na PC od razu pokazała się na telefonie i overlayu.
  const [siteOverrides, setSiteOverrides] = useState(() => loadOverrides());
  const webSocketRef = useRef(null);

  const sendWs = (obj) => {
    try {
      const ws = webSocketRef.current;
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
    } catch { /* ignore */ }
  };

  // Lokalne przesunięcie litery: zapisz + rozgłoś do innych podglądów.
  const handleSiteMove = (map, label, x, y) => {
    setSiteOverrides(saveSitePosition(map, label, x, y));
    sendWs({ m_bombsite_move: { map, label, x, y } });
  };

  // Lokalny reset mapy: wyczyść + rozgłoś.
  const handleSiteReset = (map) => {
    setSiteOverrides(resetSites(map));
    sendWs({ m_bombsite_reset: { map } });
  };

  // Numerki 1..N tylko dla wrogów (stabilne, po SteamID — jak komenda 'lista').
  const { order: orderedPlayers, byIdx: playerNumbers } = useMemo(
    () => assignPlayerNumbers(playerArray, localTeam),
    [playerArray, localTeam]
  );

  // Pozycje na aktualną mapę (do rysowania).
  const bombSites = useMemo(
    () => (mapData ? getSites(mapData.name, siteOverrides) : null),
    [mapData, siteOverrides]
  );

  // Awatary wrogów (?pfp=1): cache lokalny + uzupełnianie z serwera.
  const [avatars, setAvatars] = useState(() => loadAvatars());
  // ID już wysłane do serwera (żeby nie prosić co tickę o to samo).
  const avatarReqRef = useRef(new Set());

  // Gdy widać nowych wrogów bez znanego awatara — poproś serwer raz.
  useEffect(() => {
    if (!PFP_MODE || playerArray.length === 0 || localTeam == null) return;
    const missing = [];
    for (const p of playerArray) {
      const id = String(p.m_steam_id ?? "");
      if (!/^765\d{14}$/.test(id)) continue;
      if (p.m_team === localTeam) continue; // tylko przeciwna drużyna
      if (avatars[id] || avatarReqRef.current.has(id)) continue;
      missing.push(id);
      if (missing.length >= 10) break;
    }
    if (missing.length > 0) {
      missing.forEach((id) => avatarReqRef.current.add(id));
      console.info(`[pfp] proszę serwer o ${missing.length} awatarów`);
      try {
        const ws = webSocketRef.current;
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ m_avatar_req: missing }));
      } catch { /* ignore */ }
    }
  }, [playerArray, localTeam, avatars]);

  useEffect(() => {
    let webSocket = null;
    let connectionTimeout = null;
    let reconnectTimeout = null;
    let closedByUser = false;

    const connect = () => {
      const webSocketURL = getWebSocketURL();
      if (!webSocketURL) return;

      try {
        webSocket = new WebSocket(webSocketURL);
        webSocketRef.current = webSocket;
      } catch (error) {
        console.error(error);
        scheduleReconnect();
        return;
      }

      connectionTimeout = setTimeout(() => {
        try { webSocket.close(); } catch { /* ignore */ }
      }, CONNECTION_TIMEOUT);

      webSocket.onopen = async () => {
        clearTimeout(connectionTimeout);
        console.info(`connected to the web socket (${webSocketURL})`);
      };

      webSocket.onclose = async () => {
        clearTimeout(connectionTimeout);
        console.error("disconnected from the web socket");
        scheduleReconnect();
      };

      webSocket.onerror = async (error) => {
        clearTimeout(connectionTimeout);
        console.error(error);
        // onclose odpali reconnect, więc tu tylko logujemy
      };

      webSocket.onmessage = async (event) => {
        // Serwer puszcza dalej surowe ramki: dane z gry ida jako Blob (ramka
        // binarna), a meta-wiadomosci serwera (string) jako tekst. Obsluz oba.
        const rawText = typeof event.data === "string" ? event.data : await event.data.text();
        // SteamID64 (> Number.MAX_SAFE_INTEGER) przychodzące jako liczba JSON
        // tracą precyzję w JSON.parse (np. ...456 -> ...460), więc zamieniamy
        // je na stringi ZANIM sparsujemy. Stringi w cudzysłowach regex ignoruje.
        const safeText = rawText.replace(/"m_steam_id"\s*:\s*(\d{10,})/g, '"m_steam_id":"$1"');
        const parsedData = JSON.parse(safeText);

        // Meta-wiadomość serwera (auto-detect konta) — nie dane z gry.
        if (parsedData.m_local_steam_id && !parsedData.m_players) {
          const id = normalizeSteamId(parsedData.m_local_steam_id);
          if (/^765\d{14}$/.test(id)) setAutoSteamId(id);
          return;
        }
        // Sync liter A/B z innego podglądu (przeciągnięte na PC/telefonie).
        if (parsedData.m_bombsite_move && !parsedData.m_players) {
          const m = parsedData.m_bombsite_move;
          setSiteOverrides(saveSitePosition(m.map, m.label, m.x, m.y));
          return;
        }
        // Reset liter na mapie wykonany na innym podglądzie.
        if (parsedData.m_bombsite_reset && !parsedData.m_players) {
          setSiteOverrides(resetSites(parsedData.m_bombsite_reset.map));
          return;
        }
        // Pełny zapis pozycji z serwera (dostajesz przy połączeniu).
        if (parsedData.m_bombsites && !parsedData.m_players) {
          setSiteOverrides(saveAllOverrides(parsedData.m_bombsites));
          return;
        }
        // Awatary z serwera (pojedyncze lub pełny cache przy połączeniu).
        if (parsedData.m_avatars && !parsedData.m_players) {
          const count = Object.keys(parsedData.m_avatars || {}).length;
          if (count > 0) console.info(`[pfp] odebrano ${count} awatarów`);
          setAvatars((prev) => saveAvatars({ ...prev, ...parsedData.m_avatars }));
          return;
        }
        if (!parsedData.m_players) return;
  
        // DEBUG: pokaż pola pierwszego gracza (tylko raz)
        if (!window._playerLogged && parsedData.m_players && parsedData.m_players.length > 0) {
          console.log("🔍 POLA GRACZA:", parsedData.m_players[0]);
          console.log("🔍 WSZYSCY GRACZE:", parsedData.m_players);
          window._playerLogged = true;
        }
        setPlayerArray(parsedData.m_players);
        setLocalTeam(parsedData.m_local_team);
        setBombData(parsedData.m_bomb);

        const map = parsedData.m_map;
        if (map && map !== "invalid" && map !== mapNameRef.current) {
          mapNameRef.current = map;
          const cached = mapCacheRef.current[map];
          if (cached) {
            setMapData(cached);
          } else {
            fetch(`data/${map}/data.json`)
              .then((r) => r.json())
              .then((json) => {
                if (mapNameRef.current !== map) return; // w międzyczasie weszła nowsza mapa
                const full = { ...json, name: map };
                mapCacheRef.current[map] = full;
                setMapData(full);
              })
              .catch(() => {
                mapNameRef.current = null; // spróbuj ponownie przy następnym ticku
              });
          }
        }
      };
    };

    const scheduleReconnect = () => {
      if (closedByUser) return;
      clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(connect, RECONNECT_DELAY);
    };

    connect();

    return () => {
      closedByUser = true;
      clearTimeout(connectionTimeout);
      clearTimeout(reconnectTimeout);
      webSocketRef.current = null;
      try { webSocket?.close(); } catch { /* ignore */ }
    };
  }, []);

  // Osobna strona tylko z listą: bez mapy, przezroczyste tło (nie białe).
  if (PANEL_MODE) {
    return (
      <div className="overlay-container" style={{ background: "transparent" }}>
        {(playerArray.length > 0 && (
          <PlayerList
            players={orderedPlayers}
            numbers={playerNumbers}
            localTeam={localTeam}
            mySteamIds={effectiveSteamIds}
            colorOverrides={COLOR_OVERRIDES}
            fill
          />
        )) || (
          <div className="waiting-message">
            <h1 className="radar_message">Waiting for data...</h1>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overlay-container">
      {SHOW_PANEL && playerArray.length > 0 && (
        <PlayerList
          players={orderedPlayers}
          numbers={playerNumbers}
          localTeam={localTeam}
          mySteamIds={effectiveSteamIds}
          colorOverrides={COLOR_OVERRIDES}
        />
      )}
      {bombData && bombData.m_blow_time > 0 && !bombData.m_is_defused && (
        <div className="bomb-timer">
          <MaskedIcon
            path={`./assets/icons/c4_sml.png`}
            height={24}
            color={
              (bombData.m_is_defusing &&
                bombData.m_blow_time - bombData.m_defuse_time > 0 &&
                `bg-radar-green`) ||
              (bombData.m_blow_time - bombData.m_defuse_time < 0 &&
                `bg-radar-red`) ||
              `bg-radar-secondary`
            }
          />
          <span>{`${bombData.m_blow_time.toFixed(1)}s ${(bombData.m_is_defusing &&
            `(${bombData.m_defuse_time.toFixed(1)}s)`) ||
            ""
            }`}</span>
        </div>
      )}

      {(playerArray.length > 0 && mapData && (
        <Radar
          playerArray={playerArray}
          radarImage={`./data/${mapData.name}/radar.png`}
          mapData={mapData}
          localTeam={localTeam}
          bombData={bombData}
          settings={settings}
          mySteamIds={effectiveSteamIds}
          bombSites={bombSites}
          onSiteMove={handleSiteMove}
          onSiteReset={handleSiteReset}
          followMode={FOLLOW_MODE}
          followZoom={FOLLOW_ZOOM}
          followSteamId={FOLLOW_STEAM_ID}
          colorOverrides={COLOR_OVERRIDES}
          avatars={avatars}
          pfpMode={PFP_MODE}
          pfpSize={PFP_SIZE}
          playerNumbers={playerNumbers}
          listMode={SHOW_BADGES}
        />
      )) || (
          <div className="waiting-message">
            <h1 className="radar_message">Waiting for data...</h1>
          </div>
        )}
    </div>
  );
};

export default App;