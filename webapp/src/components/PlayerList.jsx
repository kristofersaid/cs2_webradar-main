import { isMyAccount } from "../utilities/steamAccounts";
import { PLAYER_COLORS } from "./player";

// Widoczna lista graczy (?lista=1): numerek w kolorze kropki + nazwa.
// Martwi przygaszeni. Panel tylko do odczytu (w overlayu i tak click-through).
// fill=true: strona tylko z listą (?panel=1) — na całe okno, przezroczyste tło.
const PlayerList = ({ players, numbers, localTeam, mySteamIds = [], colorOverrides = {}, fill = false }) => {
  if (!players || players.length === 0) return null;

  const dotColor = (p) =>
    colorOverrides[String(p.m_steam_id)] ||
    (isMyAccount(p.m_steam_id, mySteamIds) && PLAYER_COLORS.local) ||
    (p.m_team === localTeam && localTeam != null && PLAYER_COLORS.teammate) ||
    PLAYER_COLORS.enemy;

  return (
    <div
      id="player-list"
      style={{
        position: "absolute",
        top: fill ? 0 : 6,
        left: fill ? 0 : 6,
        right: fill ? 0 : undefined,
        bottom: fill ? 0 : undefined,
        zIndex: 50,
        background: "transparent",
        borderRadius: fill ? 0 : 6,
        padding: fill ? "10px 12px" : "4px 6px",
        color: "#fff",
        fontSize: fill ? 14 : 10,
        lineHeight: 1.5,
        minWidth: 110,
        maxWidth: fill ? "100vw" : "30vw",
        maxHeight: fill ? "100vh" : "45vh",
        overflowY: "auto",
        pointerEvents: fill ? "auto" : "none",
        userSelect: "none",
        textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
      }}
    >
      {players.map((p) => (
        <div
          key={p.m_idx}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            opacity: p.m_is_dead ? 0.45 : 1,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              minWidth: 15,
              height: 15,
              padding: "0 3px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              backgroundColor: dotColor(p),
              color: "#fff",
              fontWeight: 900,
              fontSize: 9,
              textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
            }}
          >
            {numbers[p.m_idx]}
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {p.m_name || String(p.m_steam_id)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default PlayerList;
