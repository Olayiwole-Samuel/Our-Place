"use client";

import { m } from "motion/react";
import { useId, useState } from "react";
import {
  BROW_SHAPES,
  EAR_SHAPES,
  EYE_COLORS,
  EYE_SHAPES,
  FABRIC_COLORS,
  FACE_SHAPES,
  FACIAL_HAIR,
  FACIAL_MARKS,
  HAIRSTYLES,
  HAIR_COLORS,
  ITEMS_BY_ID,
  MOUTH_SHAPES,
  NOSE_SHAPES,
  SKIN_TONES,
  STUDIO_CATEGORIES,
  itemsForSlot,
} from "@/lib/character/catalog";
import { STARTING_LOOKS } from "@/lib/character/schema";
import { CharacterSourcePanel } from "./CharacterSourcePanel";

const label = (id) => id.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const asOptions = (ids) => ids.map((id) => ({ id, name: label(id) }));

/** A labelled single-choice row (radio group), scrolling horizontally on small screens. */
function ChoiceRow({ title, options, value, onChange, hint }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={id} className="micro-caps text-text-muted">
        {title}
      </p>
      <div role="radiogroup" aria-labelledby={id} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id ?? "none"}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              className={`min-h-10 shrink-0 rounded-[var(--radius-sm)] border px-3.5 text-caption font-medium whitespace-nowrap transition-colors ${
                selected ? "border-green-500 bg-green-600 text-white" : "border-[var(--border-subtle)] bg-black-800 text-text-secondary hover:border-[var(--border-strong)] hover:text-white-soft"
              }`}
            >
              {option.name}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-caption text-text-muted">{hint}</p>}
    </div>
  );
}

/** Colour swatches. The selected swatch shows a ring AND a check, not colour alone. */
function SwatchRow({ title, colors, value, onChange }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={id} className="micro-caps text-text-muted">
        {title}
      </p>
      <div role="radiogroup" aria-labelledby={id} className="-mx-1 flex gap-2.5 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
        {colors.map((color) => {
          const selected = color.id === value;
          return (
            <button
              key={color.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={color.name}
              title={color.name}
              onClick={() => onChange(color.id)}
              className={`relative grid size-10 shrink-0 place-items-center rounded-full border transition-transform active:scale-95 ${
                selected ? "border-white ring-2 ring-green-500 ring-offset-2 ring-offset-black-900" : "border-[var(--border-strong)]"
              }`}
              style={{ background: color.hex }}
            >
              {selected && (
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" className="drop-shadow">
                  <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SliderRow({ title, value, onChange, low, high }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="micro-caps text-text-muted">
        {title}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={`${Math.round(value * 100)}% (${low} to ${high})`}
        className="h-10 w-full cursor-pointer accent-[var(--color-green-500)]"
      />
      <div aria-hidden="true" className="flex justify-between text-caption text-text-muted">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

const fabricFor = (itemId) => {
  const item = ITEMS_BY_ID.get(itemId);
  return item ? FABRIC_COLORS.filter((color) => item.colors.includes(color.id)) : [];
};
const itemOptions = (slot, { allowNone }) => [
  ...(allowNone ? [{ id: null, name: "None" }] : []),
  ...itemsForSlot(slot).map((item) => ({ id: item.id, name: item.name })),
];

function FaceSection({ draft, update }) {
  const { face } = draft;
  return (
    <>
      <SwatchRow title="Skin tone" colors={SKIN_TONES} value={draft.skin.tone} onChange={(tone) => update({ skin: { tone } })} />
      <ChoiceRow title="Face shape" options={asOptions(FACE_SHAPES)} value={face.shape} onChange={(shape) => update({ face: { shape } })} />
      <ChoiceRow title="Eyes" options={asOptions(EYE_SHAPES)} value={face.eyes.shape} onChange={(shape) => update({ face: { eyes: { shape } } })} />
      <SliderRow title="Eye size" low="Smaller" high="Larger" value={face.eyes.size} onChange={(size) => update({ face: { eyes: { size } } })} />
      <SliderRow title="Eye spacing" low="Closer" high="Wider" value={face.eyes.spacing} onChange={(spacing) => update({ face: { eyes: { spacing } } })} />
      <SwatchRow title="Eye colour" colors={EYE_COLORS} value={face.eyes.color} onChange={(color) => update({ face: { eyes: { color } } })} />
      <ChoiceRow title="Brows" options={asOptions(BROW_SHAPES)} value={face.brows.shape} onChange={(shape) => update({ face: { brows: { shape } } })} />
      <SliderRow title="Brow thickness" low="Fine" high="Full" value={face.brows.thickness} onChange={(thickness) => update({ face: { brows: { thickness } } })} />
      <ChoiceRow title="Nose" options={asOptions(NOSE_SHAPES)} value={face.nose.shape} onChange={(shape) => update({ face: { nose: { shape } } })} />
      <SliderRow title="Nose size" low="Smaller" high="Larger" value={face.nose.size} onChange={(size) => update({ face: { nose: { size } } })} />
      <ChoiceRow title="Mouth" options={asOptions(MOUTH_SHAPES)} value={face.mouth.shape} onChange={(shape) => update({ face: { mouth: { shape } } })} />
      <ChoiceRow title="Ears" options={asOptions(EAR_SHAPES)} value={face.ears.shape} onChange={(shape) => update({ face: { ears: { shape } } })} />
      <ChoiceRow title="Details" options={asOptions(FACIAL_MARKS)} value={face.marks} onChange={(marks) => update({ face: { marks } })} />
      <ChoiceRow title="Facial hair" options={asOptions(FACIAL_HAIR)} value={face.facialHair} onChange={(facialHair) => update({ face: { facialHair } })} />
    </>
  );
}

function BodySection({ draft, update }) {
  return (
    <>
      <SliderRow title="Height" low="Shorter" high="Taller" value={draft.body.height} onChange={(height) => update({ body: { height } })} />
      <SliderRow title="Build" low="Slimmer" high="Broader" value={draft.body.build} onChange={(build) => update({ body: { build } })} />
      <SliderRow title="Shoulders" low="Narrower" high="Wider" value={draft.body.shoulders} onChange={(shoulders) => update({ body: { shoulders } })} />
      <p className="text-caption text-text-muted">Proportions stay within a natural range so you walk, sit and play normally everywhere.</p>
    </>
  );
}

function HairSection({ draft, update }) {
  return (
    <>
      <ChoiceRow title="Style" options={HAIRSTYLES.map(({ id, name }) => ({ id, name }))} value={draft.hair.style} onChange={(style) => update({ hair: { style } })} />
      <SwatchRow title="Colour" colors={HAIR_COLORS} value={draft.hair.color} onChange={(color) => update({ hair: { color } })} />
    </>
  );
}

function ClothesSection({ draft, update }) {
  const { outfit } = draft;
  const wearingOutfit = Boolean(outfit.outfit);
  return (
    <>
      <ChoiceRow
        title="Top"
        options={itemOptions("top", { allowNone: false })}
        value={outfit.top}
        onChange={(top) => update({ outfit: { outfit: null, top } })}
        hint={wearingOutfit ? "Choosing a top swaps your full outfit back to separates." : undefined}
      />
      {outfit.top && <SwatchRow title="Top colour" colors={fabricFor(outfit.top)} value={draft.colors.top} onChange={(color) => update({ colors: { top: color } })} />}
      <ChoiceRow title="Full outfit" options={itemOptions("outfit", { allowNone: true })} value={outfit.outfit} onChange={(value) => update({ outfit: { outfit: value } })} />
      {outfit.outfit && (
        <SwatchRow title="Outfit colour" colors={fabricFor(outfit.outfit)} value={draft.colors.outfit} onChange={(color) => update({ colors: { outfit: color } })} />
      )}
      <ChoiceRow title="Bottoms" options={itemOptions("bottom", { allowNone: false })} value={outfit.bottom} onChange={(bottom) => update({ outfit: { outfit: null, bottom } })} />
      {outfit.bottom && (
        <SwatchRow title="Bottoms colour" colors={fabricFor(outfit.bottom)} value={draft.colors.bottom} onChange={(color) => update({ colors: { bottom: color } })} />
      )}
      <ChoiceRow title="Shoes" options={itemOptions("shoes", { allowNone: false })} value={outfit.shoes} onChange={(shoes) => update({ outfit: { shoes } })} />
      <SwatchRow title="Shoe colour" colors={fabricFor(outfit.shoes)} value={draft.colors.shoes} onChange={(color) => update({ colors: { shoes: color } })} />
    </>
  );
}

const ACCESSORY_SLOTS = [
  { slot: "glasses", title: "Glasses" },
  { slot: "earrings", title: "Earrings" },
  { slot: "necklace", title: "Necklace" },
  { slot: "wrist", title: "Wrist" },
  { slot: "hat", title: "Hat" },
];

function AccessoriesSection({ draft, update }) {
  return ACCESSORY_SLOTS.map(({ slot, title }) => (
    <div key={slot} className="flex flex-col gap-3">
      <ChoiceRow title={title} options={itemOptions(slot, { allowNone: true })} value={draft.accessories[slot]} onChange={(value) => update({ accessories: { [slot]: value } })} />
      {draft.accessories[slot] && (
        <SwatchRow title={`${title} colour`} colors={fabricFor(draft.accessories[slot])} value={draft.colors[slot]} onChange={(color) => update({ colors: { [slot]: color } })} />
      )}
    </div>
  ));
}

function StartSection({ onStartingLook }) {
  return (
    <>
      <p className="text-body text-text-secondary">Pick a starting point — you can change everything after.</p>
      <ChoiceRow title="Starting looks" options={STARTING_LOOKS.map(({ id, name }) => ({ id, name }))} value={null} onChange={onStartingLook} />
    </>
  );
}

const SECTIONS = { face: FaceSection, body: BodySection, hair: HairSection, clothes: ClothesSection, accessories: AccessoriesSection };

/**
 * Category tabs + the selected category's options. Every change is applied to
 * the draft immediately (live preview); nothing is saved until Save.
 * `onFocusView` lets a category frame the camera (Face → face close-up).
 */
export function StudioControls({ draft, onChange, showStart, onStartingLook, onFocusView, initialCategory }) {
  const categories = [...(showStart ? [{ id: "start", name: "Start" }] : []), { id: "character", name: "Character" }, ...STUDIO_CATEGORIES];
  const [active, setActive] = useState(initialCategory ?? categories[0].id);
  const tablistId = useId();

  const select = (id) => {
    setActive(id);
    onFocusView?.(id === "face" ? "face" : id === "hair" || id === "accessories" ? "upper" : "full");
  };

  const Section = SECTIONS[active] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label="Customise"
        id={tablistId}
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border-subtle)] px-2 [scrollbar-width:none]"
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          const index = categories.findIndex((c) => c.id === active);
          const next = categories[(index + (event.key === "ArrowRight" ? 1 : -1) + categories.length) % categories.length];
          select(next.id);
          document.getElementById(`${tablistId}-${next.id}`)?.focus();
        }}
      >
        {categories.map((category) => (
          <button
            key={category.id}
            id={`${tablistId}-${category.id}`}
            type="button"
            role="tab"
            aria-selected={active === category.id}
            aria-controls={`${tablistId}-panel`}
            tabIndex={active === category.id ? 0 : -1}
            onClick={() => select(category.id)}
            className={`relative min-h-11 shrink-0 px-3.5 text-caption font-semibold transition-colors ${active === category.id ? "text-white-soft" : "text-text-muted hover:text-text-secondary"}`}
          >
            {category.name}
            {active === category.id && <m.span layoutId="studio-tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-green-500" />}
          </button>
        ))}
      </div>
      <div id={`${tablistId}-panel`} role="tabpanel" aria-labelledby={`${tablistId}-${active}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {/* Content swaps instantly (correct for screen readers and background tabs);
            the fade is pure CSS, so nothing waits on an animation to finish. */}
        <div key={active} className="flex animate-[panel-in_180ms_ease-out] flex-col gap-5">
          {active === "start" ? (
            <StartSection onStartingLook={onStartingLook} />
          ) : active === "character" ? (
            <CharacterSourcePanel />
          ) : (
            <Section draft={draft} update={onChange} />
          )}
        </div>
      </div>
    </div>
  );
}
