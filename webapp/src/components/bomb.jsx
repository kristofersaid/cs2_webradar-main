import { useRef } from "react";
import { getRadarPosition } from "../utilities/utilities";

// 🎨 KOLORY BOMBY
const BOMB_COLOR_DEFAULT = "#FFFFFF";   // BIAŁY - domyślny
const BOMB_COLOR_DEFUSED = "#50FF50";   // Zielony - rozbrojona

// 📏 ROZMIAR BOMBY
const BOMB_SIZE_MULTIPLIER = 2.5;       // 1.0 = domyślne, 2.5 = mocno większa

const Bomb = ({ bombData, mapData, radarImage, localTeam, settings }) => {
  const radarPosition = getRadarPosition(mapData, bombData);

  const bombRef = useRef();
  const bombBounding = (bombRef.current &&
    bombRef.current.getBoundingClientRect()) || { width: 0, height: 0 };

  const radarImageBounding = (radarImage !== undefined &&
    radarImage.getBoundingClientRect()) || { width: 0, height: 0 };
  const radarImageTranslation = {
    x: radarImageBounding.width * radarPosition.x - bombBounding.width * 0.5,
    y: radarImageBounding.height * radarPosition.y - bombBounding.height * 0.5,
  };

  // Rozmiar bomby
  const baseSize = 1.5;
  const scaledSize = baseSize * settings.bombSize * BOMB_SIZE_MULTIPLIER;

  // Kolor bomby - zawsze biały, chyba że rozbrojona
  const bombColor = bombData.m_is_defused ? BOMB_COLOR_DEFUSED : BOMB_COLOR_DEFAULT;

  return (
    <div
      className={`absolute origin-center left-0 top-0`}
      ref={bombRef}
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