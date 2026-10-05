import { getRadarPosition } from "../utilities/utilities";

// 🎨 KOLORY BOMBY
const BOMB_COLOR_DEFAULT = "#FFFFFF";   // BIAŁY - domyślny
const BOMB_COLOR_DEFUSED = "#50FF50";   // Zielony - rozbrojona

// 📏 ROZMIAR BOMBY
const BOMB_SIZE_MULTIPLIER = 2.5;       // 1.0 = domyślne, 2.5 = mocno większa

const Bomb = ({ bombData, mapData, radarSizePx = 0, localTeam, settings }) => {
  const radarPosition = getRadarPosition(mapData, bombData);

  // Rozmiar bomby
  const baseSize = 1.5;
  const scaledSize = baseSize * settings.bombSize * BOMB_SIZE_MULTIPLIER;

  // Czysta arytmetyka na zmierzonym raz rozmiarze radaru (zero odczytów DOM na tick).
  const bombPx = scaledSize * (window.innerWidth / 100);
  const radarImageTranslation = {
    x: radarSizePx * radarPosition.x - bombPx * 0.5,
    y: radarSizePx * radarPosition.y - bombPx * 0.5,
  };

  // Kolor bomby - zawsze biały, chyba że rozbrojona
  const bombColor = bombData.m_is_defused ? BOMB_COLOR_DEFUSED : BOMB_COLOR_DEFAULT;

  return (
    <div
      className={`absolute origin-center left-0 top-0`}
      style={{
        width: `${scaledSize}vw`,
        height: `${scaledSize}vw`,
        transform: `translate(${radarImageTranslation.x}px, ${radarImageTranslation.y}px)`,
        backgroundColor: bombColor,
        WebkitMask: `url('./assets/icons/c4_sml.png') no-repeat center / contain`,
        mask: `url('./assets/icons/c4_sml.png') no-repeat center / contain`,
        filter: `drop-shadow(0 0 3px rgba(0,0,0,0.9)) drop-shadow(0 0 6px rgba(255,255,255,0.75))`,
        opacity: 1,
        zIndex: 3,
      }}
    />
  );
};

export default Bomb;
