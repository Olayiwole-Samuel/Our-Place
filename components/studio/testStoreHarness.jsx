"use client";

import { LazyMotion, domAnimation } from "motion/react";
import { useState } from "react";
import { CharacterStoreContext, createCharacterStore } from "@/store/characterStore";

/** Test helper: provides a character store (and motion features) like AppProviders does. */
export function CharacterStore({ initial, children }) {
  const [store] = useState(() => createCharacterStore(initial));
  return (
    <CharacterStoreContext.Provider value={store}>
      <LazyMotion features={domAnimation}>{children}</LazyMotion>
    </CharacterStoreContext.Provider>
  );
}
