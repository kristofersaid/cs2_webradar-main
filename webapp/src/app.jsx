import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import "./App.css";
import Radar from "./components/Radar";
import MaskedIcon from "./components/maskedicon";

const CONNECTION_TIMEOUT = 5000;

/* change this to '1' if you want to use offline (your own pc only) */
const USE_LOCALHOST = 1;

/* you can get your public ip from https://ipinfo.io/ip */
const PUBLIC_IP = "your ip goes here".trim();
const PORT = 22006;

const EFFECTIVE_IP = USE_LOCALHOST ? "localhost" : PUBLIC_IP.match(/[a-zA-Z]/) ? window.location.hostname : PUBLIC_IP;

const DEFAULT_SETTINGS = {
  dotSize: 1,
  bombSize: 0.5,
};

const App = () => {
  const [playerArray, setPlayerArray] = useState([]);
  const [mapData, setMapData] = useState();
  const [localTeam, setLocalTeam] = useState();
  const [bombData, setBombData] = useState();
  const [settings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    const fetchData = async () => {
      let webSocket = null;
      let webSocketURL = null;
      let connectionTimeout = null;

      if (!webSocket) {
        try {
          if (USE_LOCALHOST) {
            webSocketURL = `ws://localhost:${PORT}/cs2_webradar`;
          } else {
            webSocketURL = `ws://${EFFECTIVE_IP}:${PORT}/cs2_webradar`;
          }

          if (!webSocketURL) return;
          webSocket = new WebSocket(webSocketURL);
        } catch (error) {
          console.error(error);
        }
      }

      connectionTimeout = setTimeout(() => {
        webSocket.close();
      }, CONNECTION_TIMEOUT);

      webSocket.onopen = async () => {
        clearTimeout(connectionTimeout);
        console.info("connected to the web socket");
      };

      webSocket.onclose = async () => {
        clearTimeout(connectionTimeout);
        console.error("disconnected from the web socket");
      };

      webSocket.onerror = async (error) => {
        clearTimeout(connectionTimeout);
        console.error(error);
      };

      webSocket.onmessage = async (event) => {
        const parsedData = JSON.parse(await event.data.text());
  
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
        if (map !== "invalid") {
          setMapData({
            ...(await (await fetch(`data/${map}/data.json`)).json()),
            name: map,
          });
        }
      };
    };

    fetchData();
  }, []);

  return (
    <div className="overlay-container">
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