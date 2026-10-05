import { useState, useEffect } from "react";
import { getRadarPosition, resolveAvatarSize } from "../utilities/utilities";
import { isMyAccount, pickAvatarUrl } from "../utilities/steamAccounts";

// 🎨 KOLORY
const COLOR_LOCAL = "#00FF00";      // LIME - Ty
const COLOR_TEAMMATE = "#3B9EFF";   // NIEBIESKI - koledzy
const COLOR_ENEMY = "#FF3B3B";      // CZERWONY - przeciwnicy

// Eksport do listy graczy (?lista=1), żeby znaczki miały kolory kropek.
export const PLAYER_COLORS = {
  local: COLOR_LOCAL,
  teammate: COLOR_TEAMMATE,
  enemy: COLOR_ENEMY,
};

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

const Player = ({ playerData, mapData, radarSizePx = 0, localTeam, settings, mySteamIds = [], colorOverrides = {}, avatars = {}, pfpMode = false, pfpSize = "full", playerNumber = null, listMode = false }) => {
  const [lastKnownPosition, setLastKnownPosition] = useState(null);
  const radarPosition = getRadarPosition(mapData, playerData.m_position) || { x: 0, y: 0 };
  const invalidPosition = radarPosition.x <= 0 && radarPosition.y <= 0;

  const playerRotation = calculatePlayerRotation(playerData);

  const scaledSize = 0.7 * settings.dotSize * DOT_SIZE_MULTIPLIER;

  // 🎯 Identyfikacja lokalnego gracza: każde konto z listy "Moje konta" jest zielone
  const isLocalPlayer = isMyAccount(playerData.m_steam_id, mySteamIds);
  const isTeammate = playerData.m_team === localTeam;
  // Numerki (?lista=1) TYLKO nad wrogami. Bez znanego localTeam nie pokazuj nic.
  const isEnemy =
    localTeam !== undefined && localTeam !== null && playerData.m_team !== localTeam;

  // 🎨 Wybierz kolor gracza
  let playerColor;
  if (isLocalPlayer) {
    playerColor = COLOR_LOCAL;
  } else if (isTeammate) {
    playerColor = COLOR_TEAMMATE;
  } else {
    playerColor = COLOR_ENEMY;
  }
  // 🏷️ Jawny kolor z linku (?colors=id:hex) — bije wszystkie domyślne.
  // Biała obwódka/poświata lokalnego gracza zostają, żeby było widać kim jesteś.
  const customColor = colorOverrides[String(playerData.m_steam_id)];
  if (customColor) {
    playerColor = customColor;
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

  // Czysta arytmetyka na zmierzonym raz rozmiarze radaru (zero odczytów DOM na tick).
  // Rozmiar kropki znamy z ustawień (vw -> px przez szerokość viewportu, tani odczyt).
  const vwPx = window.innerWidth / 100;
  const dotPx = scaledSize * vwPx;
  const radarImageTranslation = {
    x: radarSizePx * effectivePosition.x - dotPx * 0.5,
    y: radarSizePx * effectivePosition.y - dotPx * 0.5,
  };

  // Parametry linii dla tego gracza
  const lineLength = isLocalPlayer ? LOCAL_LINE_LENGTH : ENEMY_LINE_LENGTH;
  const lineThickness = isLocalPlayer ? LOCAL_LINE_THICKNESS : ENEMY_LINE_THICKNESS;
  const finalLineLength = scaledSize * lineLength;

  // 🖼️ Awatar (?pfp=1): tylko przeciwna drużyna, nad mapą ale pod kropką.
  // localTeam musi być znany — inaczej nie wiadomo kto jest wrogiem.
  // Rozmiar z ?pfpsize=icon|medium|full (fallback: full > medium > icon).
  const avatarEntry = avatars[String(playerData.m_steam_id)];
  const avatarUrl =
    (pfpMode &&
      localTeam !== undefined &&
      localTeam !== null &&
      playerData.m_team !== localTeam &&
      pickAvatarUrl(avatarEntry, pfpSize)) ||
    "";
  const showAvatar = Boolean(avatarUrl) && !invalidPosition;
  const avatarSize = scaledSize * 2.2;
  // MEGA (?pfpsize=mega): sztywne 256px. Liczba = ręczne px (16..512).
  // W obu przypadkach źródłem jest full 184px — przeglądarka skaluje.
  const avatarSizeStyle = resolveAvatarSize(pfpSize, avatarSize);

  return (
    <div
      className={`absolute origin-center rounded-[100%] left-0 top-0`}
      style={{
        width: `${scaledSize}vw`,
        height: `${scaledSize}vw`,
        transform: `translate(${radarImageTranslation.x}px, ${radarImageTranslation.y}px)`,
        transition: `transform 100ms linear`,
        zIndex: `${(playerData.m_is_dead && `0`) || (isLocalPlayer && `10`) || `1`}`,
        WebkitMask: `${(playerData.m_is_dead && `url('./assets/icons/icon-enemy-death_png.png') no-repeat center / contain`) || `none`}`,
      }}
    >
      {/* Awatar wroga NAD mapą, ale POD kropką (zIndex -1 w kontekście gracza).
          Martwy ma maskę pośmiertną na całości, więc awatar znika razem z kropką. */}
      {showAvatar && (
        <img
          src={avatarUrl}
          alt=""
          draggable={false}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: "0.4vmin",
            width: avatarSizeStyle,
            height: avatarSizeStyle,
            pointerEvents: "none",
            opacity: `${(playerData.m_is_dead && `0.8`) || `1`}`,
            zIndex: -1,
          }}
        />
      )}
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
            boxShadow: `${(isLocalPlayer && `0 0 8px ${playerColor}`) || `0 0 3px rgba(0,0,0,0.7)`}`,
          }}
        />
      </div>

      {/* 🔢 Numerek nad kropką (?lista=1) — tylko wróg. Gdy jest awatar, znaczek ląduje nad nim. */}
      {listMode && isEnemy && playerNumber && !invalidPosition && (
        <span
          style={{
            position: "absolute",
            bottom: showAvatar ? `calc(100% + ${avatarSize}vw + 0.8vmin)` : "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: "0.2vmin",
            minWidth: `${scaledSize * 2.0}vw`,
            height: `${scaledSize * 2.0}vw`,
            padding: "0 0.5vmin",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            backgroundColor: playerColor,
            color: "#fff",
            fontWeight: 900,
            fontSize: `${scaledSize * 1.15}vw`,
            lineHeight: 1,
            textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
            pointerEvents: "none",
            userSelect: "none",
            opacity: `${(playerData.m_is_dead && `0.8`) || `1`}`,
            zIndex: 6,
          }}
        >
          {playerNumber}
        </span>
      )}
    </div>
  );
};

export default Player;