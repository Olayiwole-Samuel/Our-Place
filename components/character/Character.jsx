"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EMOTES, createAnimationController } from "@/lib/character/animation";
import { ANIMATION_LIBRARIES } from "@/lib/character/gallery";
import { buildCharacter } from "@/lib/character/buildCharacter";
import { instantiateCharacterModel, loadCharacterModel, loadClipLibrary } from "@/lib/character/modelCache";
import { applyModelQuality, characterInView, setCastShadow } from "@/lib/character/quality";
import { createRetarget } from "@/lib/character/retarget";
import { normalizeCharacterConfig } from "@/lib/character/schema";

/**
 * <Character> — the one way any space renders a person.
 *
 *   <Character character={character} motion={motionRef} opacity reducedMotion />
 *
 * `character` is the client character ({ config, model }) or just { config }.
 * `motion` is a ref the owner writes each frame: { anim, speed, emote }
 *   anim:  "idle" | "walk" | "run" | "sit"
 *   emote: a one-shot name (wave, laugh, …); setting a new value plays it once.
 *
 * Rendering:
 *   provider model present → load (cached) GLB → if it fails or isn't full-body,
 *     fall back to the built-in character from the same config
 *   otherwise              → built-in full-body character
 * Rooms, game spaces and the studio use this component and never need to know
 * how the character was made.
 *
 * Performance (set by the world from the quality tier, lib/performance):
 *   quality      "low" | "medium" | "high" — model characters' textures/shading
 *                (lib/character/quality.js); the built-in character is already cheap
 *   textureMax   texture size cap for "low"
 *   castShadow   real shadows (only when the tier enables them)
 *   cull         skip drawing + skeleton work while outside the camera view
 */
export function Character({ character, motion, opacity = 1, reducedMotion = false, onModelError, quality = "high", textureMax = 1024, castShadow = false, cull = false }) {
  const [modelFailed, setModelFailed] = useState(false);
  const model = character?.model;
  const config = character?.config;

  useEffect(() => {
    setModelFailed(false);
  }, [model?.key]);

  if (model && !modelFailed) {
    return (
      <ModelCharacter
        model={model}
        motion={motion}
        opacity={opacity}
        reducedMotion={reducedMotion}
        quality={quality}
        textureMax={textureMax}
        castShadow={castShadow}
        cull={cull}
        onError={(error) => {
          console.warn("[our-place] Character model unavailable; showing the built-in character.", error?.reason ?? error?.message);
          setModelFailed(true);
          onModelError?.(error);
        }}
        fallback={<ProceduralCharacter config={config} motion={motion} opacity={opacity} reducedMotion={reducedMotion} castShadow={castShadow} cull={cull} />}
      />
    );
  }
  return <ProceduralCharacter config={config} motion={motion} opacity={opacity} reducedMotion={reducedMotion} castShadow={castShadow} cull={cull} />;
}

function applyOpacity(materials, opacity) {
  for (const material of materials) {
    const transparent = opacity < 0.999;
    if (material.transparent !== transparent) {
      material.transparent = transparent;
      material.needsUpdate = true;
    }
    material.opacity = opacity;
    material.depthWrite = !transparent;
  }
}

/** Drives a controller from the owner's motion ref. */
function useMotion(controller, motion, { root = null, cull = false } = {}) {
  const lastEmote = useRef(null);
  useFrame((state, delta) => {
    if (!controller) return;
    if (cull && root) root.visible = characterInView(state.camera, root);
    const { anim = "idle", speed = 0, emote = null } = motion?.current ?? {};
    controller.setState(anim, { speed });
    if (emote && emote !== lastEmote.current) controller.playEmote(typeof emote === "string" ? emote : emote.name);
    lastEmote.current = emote;
    controller.update(delta);
  });
}

function ProceduralCharacter({ config, motion, opacity, reducedMotion, castShadow = false, cull = false }) {
  // Rebuild only when the look actually changes (live studio preview included).
  const key = JSON.stringify(normalizeCharacterConfig(config));
  const built = useMemo(() => buildCharacter(JSON.parse(key)), [key]);
  const controller = useMemo(() => createAnimationController(built, { reducedMotion }), [built, reducedMotion]);
  useEffect(() => () => built.dispose(), [built]);
  useEffect(() => {
    applyOpacity(built.meshes.map((mesh) => mesh.material), opacity);
  }, [built, opacity]);
  useEffect(() => {
    setCastShadow(built.root, castShadow);
  }, [built, castShadow]);
  useMotion(controller, motion, { root: built.root, cull });
  return <primitive object={built.root} />;
}

/**
 * Model (GLB) character — gallery, imported or provider.
 *
 * Animation:
 *  - models with locomotion clips (gallery characters with their shared clip
 *    library, or files that ship "idle"/"walk" clips) play those clips by our
 *    state/emote names;
 *  - every other model (e.g. an imported Avaturn/Mixamo export with no clips)
 *    is driven by Our Place's own animation controller through retargeting
 *    (lib/character/retarget.js): the same walk, sit and emotes as the built-in
 *    character, performed by the person's actual model.
 */
// Ground speed (m/s) the library's walk and run cycles were captured at, and
// the world's full walking speed (motion.speed is 0..1 of it; LocalPlayer).
const WALK_CLIP_SPEED = 1.4;
const RUN_CLIP_SPEED = 3.4;
const WORLD_WALK_SPEED = 2.1;

/**
 * A library's clips, named by our states/emotes. Two shapes:
 *   { file, map }   one file with many clips; `map` names ours → theirs
 *   { clips }       one file per clip (Mixamo: idle.glb, walk.glb, …), named
 *                   after the file's key; a missing one is simply not played
 */
async function loadLibraryClips(library) {
  if (!library.clips) return loadClipLibrary(library.file);
  const entries = Object.entries(library.clips);
  const loaded = await Promise.allSettled(entries.map(([, url]) => loadClipLibrary(url)));
  return loaded.flatMap((result, index) => {
    const clip = result.status === "fulfilled" ? result.value[0] : null;
    if (!clip) return [];
    const named = clip.clone();
    named.name = entries[index][0];
    return [named];
  });
}

function ModelCharacter({ model, motion, opacity, reducedMotion, quality, textureMax, castShadow, cull, onError, fallback }) {
  const [instance, setInstance] = useState(null);
  const [clips, setClips] = useState(null);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const library = model.rig ? ANIMATION_LIBRARIES[model.rig] : null;

  useEffect(() => {
    let cancelled = false;
    let created = null;
    loadCharacterModel(model)
      .then((gltf) => {
        if (cancelled) return;
        created = instantiateCharacterModel(model.key, gltf);
        setInstance(created);
      })
      .catch((error) => !cancelled && errorRef.current?.(error));
    return () => {
      cancelled = true;
      created?.release();
    };
  }, [model]);

  useEffect(() => {
    if (!library) return undefined;
    let cancelled = false;
    loadLibraryClips(library)
      .then((loaded) => !cancelled && setClips(loaded))
      .catch(() => {}); // no clips → rest pose; the character itself still renders
    return () => {
      cancelled = true;
    };
  }, [library]);

  const mixer = useMemo(() => (instance ? new THREE.AnimationMixer(instance.root) : null), [instance]);
  // Rest pose is captured once per instance, before anything animates it.
  const retarget = useMemo(() => (instance ? createRetarget(instance.root, instance.bones) : null), [instance]);
  const controller = useMemo(() => (retarget ? createAnimationController(retarget.controllerTarget, { reducedMotion }) : null), [retarget, reducedMotion]);
  const actions = useRef({});
  const current = useRef(null);
  const lastEmote = useRef(null);

  useEffect(() => {
    if (!mixer || !instance) return undefined;
    const available = new Map([...(clips ?? []), ...instance.animations].map((clip) => [clip.name.toLowerCase(), clip]));
    const lookup = (name) => {
      const mapped = library?.map?.[name];
      return available.get((mapped ?? name).toLowerCase()) ?? null;
    };
    actions.current = {};
    for (const name of ["idle", "walk", "run", "sit", ...Object.keys(EMOTES)]) {
      const clip = lookup(name);
      if (clip) actions.current[name] = mixer.clipAction(clip);
    }
    for (const name of Object.keys(EMOTES)) {
      const action = actions.current[name];
      if (action) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = false;
      }
    }
    current.current = null;
    return () => mixer.stopAllAction();
  }, [mixer, instance, clips, library]);

  // Quality tier: swap materials/textures (restored when the tier changes). A
  // layout effect, so it runs before the first frame: otherwise that one frame
  // would upload every full-size texture to the GPU (measured: 52 vs ~16 textures).
  useLayoutEffect(() => (instance ? applyModelQuality(instance.root, quality, { textureMax }) : undefined), [instance, quality, textureMax]);

  // Effects must return nothing or a cleanup function (R3F calls whatever is returned).
  useEffect(() => {
    if (!instance) return;
    const materials = [];
    instance.root.traverse((node) => node.isMesh && materials.push(...[].concat(node.material)));
    applyOpacity(materials, opacity);
  }, [instance, opacity, quality]);

  useEffect(() => {
    if (instance) setCastShadow(instance.root, castShadow);
  }, [instance, castShadow]);

  useFrame((state, delta) => {
    if (!mixer) return;
    if (cull) {
      instance.root.visible = characterInView(state.camera, instance.root);
      if (!instance.root.visible) {
        // Out of view: keep the clock running (emotes stay in sync) but skip bone work.
        controller?.update(delta);
        return;
      }
    }
    const { anim = "idle", speed = 0, emote = null } = motion?.current ?? {};
    const emoteName = emote ? (typeof emote === "string" ? emote : emote.name) : null;
    if (!actions.current.idle && !actions.current.walk && controller) {
      controller.setState(anim, { speed });
      if (emote && emote !== lastEmote.current) controller.playEmote(emoteName);
      lastEmote.current = emote;
      controller.update(delta);
      retarget.apply();
      return;
    }
    if (emote && emote !== lastEmote.current && actions.current[emoteName]) {
      const action = actions.current[emoteName];
      current.current?.fadeOut(0.2);
      action.reset().fadeIn(0.2).play();
      current.current = action;
    }
    lastEmote.current = emote;
    const playingEmote = current.current && current.current.loop === THREE.LoopOnce && current.current.isRunning();
    if (!playingEmote) {
      const next = actions.current[anim] ?? (anim === "run" ? actions.current.walk : null) ?? actions.current.idle;
      if (next && next !== current.current) {
        current.current?.fadeOut(0.25);
        next.reset().fadeIn(0.25).play();
        current.current = next;
      }
      // Feet match the ground: the walk/run cycle plays at the speed actually moved.
      if (next && (next === actions.current.walk || next === actions.current.run)) {
        const base = next === actions.current.run ? RUN_CLIP_SPEED : WALK_CLIP_SPEED;
        next.timeScale = speed > 0 ? THREE.MathUtils.clamp((speed * WORLD_WALK_SPEED) / base, 0.6, 1.6) : 1;
      }
    }
    mixer.update(delta);
  });

  if (!instance) return fallback;
  return <primitive object={instance.root} />;
}
