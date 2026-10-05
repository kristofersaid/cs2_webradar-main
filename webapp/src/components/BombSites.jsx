import { memo, useRef, useState } from "react";

// Litery A/B na bombsite'ach (sterowane z app.jsx — jedno źródło prawdy,
// synchronizowane przez serwer ze wszystkimi podglądami).
// Każdą można ZŁAPAĆ i PRZESUNĄĆ (myszka na PC, palec na telefonie) —
// po puszczeniu pozycja leci do serwera i pokazuje się WSZĘDZIE
// (PC, telefon, overlay) + zapisuje się na potem.
// Podwójny klik litery = reset pozycji na tej mapie (też wszędzie).
// Uwaga: w overlayu nad grą nie da się przeciągać (przepuszcza mysz)
// — ustaw raz w przeglądarce (localhost:5173).
const BombSites = ({ mapName, sites, onMove, onReset }) => {
  // Podgląd w trakcie ciągnięcia (płynnie, bez czekania na sieć).
  const [dragPreview, setDragPreview] = useState(null);
  const [dragging, setDragging] = useState(null);
  const dragLabel = useRef(null);

  if (!sites) return null;

  const visible = sites.map((s) =>
    dragPreview && dragPreview.label === s.label ? { ...s, ...dragPreview } : s
  );

  const positionFromEvent = (e) => {
    const radar = document.getElementById("radar");
    if (!radar) return null;
    const rect = radar.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const round4 = (v) => Math.round(v * 10000) / 10000;
    return {
      x: round4(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))),
      y: round4(Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))),
    };
  };

  const handlePointerDown = (e, label) => {
    e.preventDefault();
    dragLabel.current = label;
    setDragging(label);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handlePointerMove = (e, label) => {
    if (dragLabel.current !== label) return;
    const pos = positionFromEvent(e);
    if (!pos) return;
    setDragPreview({ label, ...pos });
  };

  const commit = (e, label) => {
    if (dragLabel.current !== label) return;
    dragLabel.current = null;
    setDragging(null);
    setDragPreview(null);
    const pos = positionFromEvent(e);
    if (pos) onMove?.(mapName, label, pos.x, pos.y);
  };

  const handleDoubleClick = (e, label) => {
    e.preventDefault();
    dragLabel.current = null;
    setDragging(null);
    setDragPreview(null);
    onReset?.(mapName);
    console.info(`[bombsites] zresetowano pozycje liter na ${mapName}`);
  };

  return (
    <>
      {visible.map((site) => (
        <div
          key={site.label}
          title="Złap i przesuń • podwójny klik = reset pozycji"
          onPointerDown={(e) => handlePointerDown(e, site.label)}
          onPointerMove={(e) => handlePointerMove(e, site.label)}
          onPointerUp={(e) => commit(e, site.label)}
          onPointerCancel={() => {
            dragLabel.current = null;
            setDragging(null);
            setDragPreview(null);
          }}
          onDoubleClick={(e) => handleDoubleClick(e, site.label)}
          style={{
            position: "absolute",
            left: `${site.x * 100}%`,
            top: `${site.y * 100}%`,
            transform: "translate(-50%, -50%)",
            fontSize: "2.6vmin",
            fontWeight: 900,
            lineHeight: 1,
            color: "rgba(255, 255, 255, 0.92)",
            textShadow:
              "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 6px rgba(0,0,0,0.9)",
            opacity: dragging === site.label ? 0.6 : 0.9,
            pointerEvents: "auto",
            userSelect: "none",
            WebkitUserSelect: "none",
            touchAction: "none",
            cursor: dragging === site.label ? "grabbing" : "grab",
            padding: "0.6vmin",
            zIndex: 4,
          }}
        >
          {site.label}
        </div>
      ))}
    </>
  );
};

// memo: pozycje zmieniają się tylko przy edycji (nie co tick), więc pomijamy
// przerenderowania przy ruchu graczy. onMove/onReset to stabilne referencje z App.
export default memo(BombSites);
