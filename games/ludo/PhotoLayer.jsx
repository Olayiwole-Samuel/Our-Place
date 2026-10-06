"use client";

import { memo, useState } from "react";
import { GRID } from "./layout";

/**
 * The personalisation layer of the Naija Ludo board: four printed photographs
 * set into the board itself, like the picture panels of a physical board.
 *
 *   each partner's yard     that partner's portrait (their pieces wait on it)
 *   the two free corners    two different photos of the couple together
 *                           (a compact dice tray sits on their lower edge)
 *
 * Pure presentation, separate from the rules and the gameplay layer: it takes
 * only strings, is memoised, and so never re-renders or reloads on dice,
 * moves, turns or kills. Zones are in board units (the board's 15×15 grid), so
 * they scale and move with the board, and none of them overlaps a track square,
 * lane or the home centre.
 *
 * Fallbacks never show a broken image: portrait → profile picture → initial;
 * together photo → an Our Place mark.
 */
export const PHOTO_ZONES = Object.freeze({
  // [top, left, size] in board units, in the VIEWER's frame (own yard bottom-left).
  myYard: [10, 1, 4],
  partnerYard: [1, 10, 4],
  topLeft: [0.55, 0.55, 4.9],
  bottomRight: [9.55, 9.55, 4.9],
});

const box = ([top, left, size]) => ({ top: `${(top / GRID) * 100}%`, left: `${(left / GRID) * 100}%`, width: `${(size / GRID) * 100}%`, height: `${(size / GRID) * 100}%` });

export const PhotoLayer = memo(function PhotoLayer({ myPhoto, partnerPhoto, myInitial, partnerInitial, topLeftPhoto, bottomRightPhoto, mySeatColor, partnerSeatColor }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0" data-photo-layer>
      <Portrait zone="myYard" src={myPhoto} initial={myInitial} color={mySeatColor} tilt={-1.2} />
      <Portrait zone="partnerYard" src={partnerPhoto} initial={partnerInitial} color={partnerSeatColor} tilt={1.2} />
      <Together zone="topLeft" src={topLeftPhoto} tilt={-1.6} />
      <Together zone="bottomRight" src={bottomRightPhoto} tilt={1.4} />
    </div>
  );
});

/** An <img> that quietly gives way to its fallback if it can't load. */
function Photo({ src, onFail }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- board-sized private/remote image; next/image adds nothing here
    <img src={src} alt="" draggable={false} decoding="async" referrerPolicy="no-referrer" onError={onFail} className="absolute inset-0 size-full object-cover" />
  );
}

function Portrait({ zone, src, initial, color, tilt }) {
  const [failed, setFailed] = useState(null);
  const show = src && failed !== src;
  return (
    <div className="ludo-print absolute overflow-hidden" data-zone={zone} data-src={show ? src : ""} style={{ ...box(PHOTO_ZONES[zone]), rotate: `${tilt}deg` }}>
      {show ? (
        <Photo src={src} onFail={() => setFailed(src)} />
      ) : (
        <span className="absolute inset-0 grid place-items-center font-semibold" data-fallback="initial" style={{ background: `linear-gradient(160deg, ${color.soft}, var(--color-black-900))`, color: color.fill, fontSize: "9cqw" }}>
          {initial}
        </span>
      )}
      {/* Keeps the pieces and their slots readable on any photo. */}
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(8,10,9,0.15),rgba(8,10,9,0.55))]" />
      {[22.5, 77.5].flatMap((y) =>
        [22.5, 77.5].map((x) => (
          <span key={`${x}-${y}`} className="absolute size-[21%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[0.4cqw] bg-black-950/35" style={{ top: `${y}%`, left: `${x}%`, borderColor: color.fill }} />
        )),
      )}
    </div>
  );
}

function Together({ zone, src, tilt }) {
  const [failed, setFailed] = useState(null);
  const show = src && failed !== src;
  return (
    <div className="ludo-print absolute overflow-hidden" data-zone={zone} data-src={show ? src : ""} style={{ ...box(PHOTO_ZONES[zone]), rotate: `${tilt}deg` }}>
      {show ? (
        <Photo src={src} onFail={() => setFailed(src)} />
      ) : (
        <span data-fallback="mark" className="ludo-print-placeholder absolute inset-0 flex flex-col items-center justify-center gap-[4%] pb-[14%]">
          <svg viewBox="0 0 24 24" className="w-[26%]" fill="none">
            <path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="var(--color-green-700)" />
            <path d="M12 17.4s-3.4-2-3.4-4.2a1.9 1.9 0 0 1 3.4-1.2 1.9 1.9 0 0 1 3.4 1.2c0 2.2-3.4 4.2-3.4 4.2z" fill="var(--color-pink-400)" />
          </svg>
          <span className="font-semibold tracking-[0.2em] text-text-muted" style={{ fontSize: "1.9cqw" }}>
            OUR PLACE
          </span>
        </span>
      )}
    </div>
  );
}
