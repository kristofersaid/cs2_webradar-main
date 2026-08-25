import { useRef, useState, useEffect } from "react";
import { getRadarPosition } from "../utilities/utilities";

// ⚠️ WSTAW TU SWÓJ STEAMID64
const LOCAL_PLAYER_STEAM_ID = "76561199250613456";

// 🎨 KOLORY
const COLOR_LOCAL = "#00FF00";      // LIME - Ty
const COLOR_TEAMMATE = "#3B9EFF";   // NIEBIESKI - koledzy
const COLOR_ENEMY = "#FF3B3B";      // CZERWONY - przeciwnicy

// 📏 USTAWIENIA
const DOT_SIZE_MULTIPLIER = 2.0;    // Wielkość kropek

// Linia lokalnego gracza (Twoja)
const LOCAL_LINE_LENGTH = 3;        // Długość linii
const LOCAL_LINE_THICKNESS = 3;     // Grubość

// Linia pozostałych graczy (koledzy + wrogowie)
const ENEMY_LINE_LENGTH = 1.5;      // Krótsza
const ENEMY_LINE_THICKNESS = 2;     // Cieńsza

let playerRotations = [];
const calculatePlayerRotation = (playerData) => {
  const playerViewAngle = 270 - playerData.m_eye_angle;
  const idx = playerData.m_idx;

  playerRotations[idx] = (playerRotations[idx] || 0) % 360;
  playerRotations[idx] +=
    ((playerViewAngle - playerRotations[idx] + 540) % 360) - 180;

  return playerRotations[idx];
};

const Player = ({ playerData, mapData, radarImage, localTeam, settings }) => {
  const [lastKnownPosition, setLastKnownPosition] = useState(null);
  const radarPosition = getRadarPosition(mapData, playerData.m_position) || { x: 0, y: 0 };
  const invalidPosition = radarPosition.x <= 0 && radarPosition.y <= 0;

  const playerRef = useRef();
  const playerBounding = (playerRef.current &&
    playerRef.current.getBoundingClientRect()) || { width: 0, height: 0 };
  const playerRotation = calculatePlayerRotation(playerData);

  const radarImageBounding = (radarImage !== undefined &&
    radarImage.getBoundingClientRect()) || { width: 0, height: 0 };

  const scaledSize = 0.7 * settings.dotSize * DOT_SIZE_MULTIPLIER;

  // 🎯 Identyfikacja lokalnego gracza po SteamID
  const isLocalPlayer = String(playerData.m_steam_id) === LOCAL_PLAYER_STEAM_ID;
  const isTeammate = playerData.m_team === localTeam;

  // 🎨 Wybierz kolor gracza
  let playerColor;
  if (isLocalPlayer) {
    playerColor = COLOR_LOCAL;
  } else if (isTeammate) {
    playerColor = COLOR_TEAMMATE;
  } else {
    playerColor = COLOR_ENEMY;
  }

  useEffect(() => {
    if (playerData.m_is_dead) {
      if (!lastKnownPosition) {
        setLastKnownPosition(radarPosition);
      }
    } else {
      setLastKnownPosition(null);
    }
  }, [playerData.m_is_dead, radarPosition, lastKnownPosition]);

  const effectivePosition = playerData.m_is_dead ? lastKnownPosition || { x: 0, y: 0 } : radarPosition;

  const radarImageTranslation = {
    x: radarImageBounding.width * effectivePosition.x - playerBounding.width * 0.5,
    y: radarImageBounding.height * effectivePosition.y - playerBounding.height * 0.5,
  };

  // Parametry linii dla tego gracza
  const lineLength = isLocalPlayer ? LOCAL_LINE_LENGTH : ENEMY_LINE_LENGTH;
  const lineThickness = isLocalPlayer ? LOCAL_LINE_THICKNESS : ENEMY_LINE_THICKNESS;
  const finalLineLength = scaledSize * lineLength;

  return (
    <div
      className={`absolute origin-center rounded-[100%] left-0 top-0`}
      ref={playerRef}
      style={{
        width: `${scaledSize}vw`,
        height: `${scaledSize}vw`,
        transform: `translate(${radarImageTranslation.x}px, ${radarImageTranslation.y}px)`,
        transition: `transform 100ms linear`,
        zIndex: `${(playerData.m_is_dead && `0`) || (isLocalPlayer && `10`) || `1`}`,
        WebkitMask: `${(playerData.m_is_dead && `url('./assets/icons/icon-enemy-death_png.png') no-repeat center / contain`) || `none`}`,
      }}
    >
      <div
        style={{
          transform: `rotate(${(playerData.m_is_dead && `0`) || playerRotation}deg)`,
          width: `${scaledSize}vw`,
          height: `${scaledSize}vw`,
          transition: `transform 100ms linear`,
          opacity: `${(playerData.m_is_dead && `0.8`) || (invalidPosition && `0`) || `1`}`,
          position: 'relative',
        }}
      >
        {/* 📏 LINIA KIERUNKU - DLA WSZYSTKICH ŻYWYCH GRACZY */}
        {!playerData.m_is_dead && !invalidPosition && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: `${lineThickness}px`,
              height: `${finalLineLength}vw`,
              backgroundColor: playerColor,
              transformOrigin: 'top center',
              transform: 'translate(-50%, 0)',
              boxShadow: isLocalPlayer ? `0 0 4px ${playerColor}` : `0 0 2px rgba(0,0,0,0.7)`,
              pointerEvents: 'none',
              zIndex: 5,
              borderRadius: '2px',
              opacity: isLocalPlayer ? 1 : 0.85,
            }}
          />
        )}

        {/* Player dot */}
        <div
          className={`w-full h-full rounded-[50%_50%_50%_0%] rotate-[315deg]`}
          style={{
            backgroundColor: playerColor,
            opacity: `${(playerData.m_is_dead && `0.8`) || (invalidPosition && `0`) || `1`}`,
            border: `${(isLocalPlayer && `2px solid white`) || `1px solid rgba(0,0,0,0.5)`}`,
            boxShadow: `${(isLocalPlayer && `0 0 8px ${COLOR_LOCAL}`) || `0 0 3px rgba(0,0,0,0.7)`}`,
          }}
        />
      </div>
    </div>
  );
};

export default Player;