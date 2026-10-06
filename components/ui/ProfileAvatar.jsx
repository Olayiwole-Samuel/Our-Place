"use client";

import { useState } from "react";

/**
 * Profile picture with an initial fallback (no picture, or it fails to load).
 * `ring` tints the outline: green for the user, pink for their partner.
 */
export function ProfileAvatar({ profile, size = 32, ring = "green" }) {
  const [failed, setFailed] = useState(false);
  const initial = profile?.displayName?.trim()?.[0]?.toUpperCase() ?? "•";
  const ringClass = ring === "pink" ? "ring-pink-400" : "ring-green-500";
  const style = { width: size, height: size };

  if (profile?.avatarUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny remote avatar; optimisation adds nothing
      <img
        src={profile.avatarUrl}
        alt=""
        width={size}
        height={size}
        style={style}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`rounded-full object-cover ring-2 ring-offset-2 ring-offset-black-900 ${ringClass}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`grid place-items-center rounded-full bg-black-700 text-caption font-semibold text-white-soft ring-2 ring-offset-2 ring-offset-black-900 ${ringClass}`}
    >
      {initial}
    </span>
  );
}
