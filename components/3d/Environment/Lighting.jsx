import { useMemo } from "react";
import { palette } from "@/lib/design/tokens";
import { mix } from "../materials";

/**
 * Lighting driven entirely by a time-of-day preset (lib/world/timeOfDay.js).
 * Budget: a hemisphere fill, one directional key from the window, the floor
 * lamp, a warm ceiling light over the room, and one small pink accent at the
 * photo wall — five lights at every tier.
 *
 * Shadows (per quality tier, lib/performance/profiles.js): "off" keeps the soft
 * blob shadows under everything; "low"/"high" add a real shadow from the key
 * light only, cast by the two characters only (512 / 1024 px map, tight bounds
 * around the room). Furniture always keeps its blob shadow.
 */
const SHADOW_MAP = { low: 512, high: 1024 };

export function Lighting({ timeOfDay, lampPosition, shadows = "off" }) {
  const lampColor = useMemo(() => mix(palette.whiteSoft, palette.pink400, timeOfDay.warmth), [timeOfDay]);
  const { ambient, key, lamp, accent, ceiling } = timeOfDay;
  const ceilingColor = useMemo(() => mix(palette.whiteSoft, palette.pink400, timeOfDay.warmth * 0.5), [timeOfDay]);

  return (
    <>
      <color attach="background" args={[timeOfDay.background]} />
      <hemisphereLight args={[ambient.color, ambient.ground, ambient.intensity]} />
      <directionalLight
        position={key.position}
        intensity={key.intensity}
        color={key.color}
        castShadow={shadows !== "off"}
        shadow-mapSize={[SHADOW_MAP[shadows] ?? 512, SHADOW_MAP[shadows] ?? 512]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-camera-near={0.5}
        shadow-camera-far={16}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />
      {lampPosition && (
        <pointLight position={[lampPosition[0], 1.55, lampPosition[1]]} intensity={lamp.intensity} distance={8} decay={2} color={lampColor} />
      )}
      {ceiling && <pointLight position={[0, 2.7, 0]} intensity={ceiling.intensity} distance={12} decay={2} color={ceilingColor} />}
      <pointLight position={[-1.9, 2.4, -3.4]} intensity={accent.intensity} distance={3.2} decay={2} color={palette.pink400} />
    </>
  );
}
