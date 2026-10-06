"use client";

import { AnimatePresence, m } from "motion/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Atmosphere } from "@/components/brand/Atmosphere";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import { DEFAULT_CHARACTER, STARTING_LOOKS, applyCharacterPatch } from "@/lib/character/schema";
import { pairingErrorMessage } from "@/lib/couple/errors";
import { useCharacterStore, useCharacterStoreApi } from "@/store/characterStore";
import { toast } from "@/store/toastStore";
import { MetaPersonCreator } from "./MetaPersonCreator";
import { SelfieCapture } from "./SelfieCapture";
import { StudioControls } from "./StudioControls";

// three.js + the studio scene load only on this screen.
const StudioStage = dynamic(() => import("./StudioStage"), { ssr: false, loading: () => <LoadingScreen variant="inline" label="Preparing your character…" /> });

const ANGLES = [
  { id: "front", name: "Front", value: 0 },
  { id: "three_quarter", name: "¾", value: Math.PI / 4 },
  { id: "side", name: "Side", value: Math.PI / 2 },
];
const FRAMING_OPTIONS = [
  { id: "full", name: "Full body" },
  { id: "upper", name: "Upper" },
  { id: "face", name: "Face" },
];

/**
 * Character Studio.
 *   First time:  "Let's create you." → (photo → MetaPerson) or (design your look) → Save → Our Place
 *   Later:       open from the account menu → edit → Save → back to Our Place
 * The draft is previewed live and only persisted on Save; leaving with unsaved
 * changes asks first.
 */
export function CharacterStudioScreen({ photoAvailable }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const store = useCharacterStoreApi();
  const mine = useCharacterStore((state) => state.mine);
  const draft = useCharacterStore((state) => state.draft);
  const saving = useCharacterStore((state) => state.saving);
  const dirty = useCharacterStore((state) => state.isDirty());
  const creating = !mine;
  // A full character rebuild costs ~40 ms; while a slider is dragged the preview
  // updates ≤ every 120 ms and settles on the final value. Controls stay instant.
  const previewConfig = useThrottledValue(draft, 120);

  const [step, setStep] = useState(creating ? "intro" : "studio"); // intro | selfie | bodyType | provider | studio
  const [selfie, setSelfie] = useState(null);
  const [initialCategory, setInitialCategory] = useState(undefined);
  const [bodyType, setBodyType] = useState(null);
  const [framing, setFraming] = useState("full");
  const [angle, setAngle] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [celebrate, setCelebrate] = useState(0);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leaveTarget = useRef("/lobby");
  const enterTimer = useRef(null);
  // Never navigate after this screen is gone (e.g. the user left during the celebration).
  useEffect(() => () => clearTimeout(enterTimer.current), []);

  // Browser-level guard: closing/reloading with unsaved changes asks too.
  useEffect(() => {
    if (!dirty || step !== "studio") return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, step]);

  const save = useCallback(async () => {
    const result = await store.getState().save();
    if (!result.ok) {
      toast(pairingErrorMessage(result.code), "error");
      return false;
    }
    setCelebrate((n) => n + 1);
    toast(creating ? "That's you. Welcome to Our Place." : "Saved. Your partner will see your new look.", "relationship");
    return true;
  }, [store, creating]);

  const leave = (target = "/lobby") => {
    if (dirty && !creating) {
      leaveTarget.current = target;
      setConfirmLeave(true);
      return;
    }
    router.push(target);
  };

  const finishFirstSave = async () => {
    if (await save()) enterTimer.current = setTimeout(() => router.push("/lobby"), reducedMotion ? 0 : 1400);
  };

  // A MetaPerson model became the saved character.
  const onProviderComplete = useCallback(
    (character) => {
      store.getState().setMine(character);
      setSelfie(null); // drop the photo from memory as soon as it's no longer needed
      setStep("studio");
      setCelebrate((n) => n + 1);
      toast("Your character is ready.", "relationship");
    },
    [store],
  );

  if (step === "intro") {
    return (
      <main className="app-viewport">
        <Atmosphere mood="relationship" />
        <div className="relative flex h-full flex-col safe-inset">
          <Wordmark size="sm" />
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-6 short:gap-4">
            <div className="flex flex-col gap-2">
              <p className="micro-caps text-pink-400">Your character</p>
              <h1 className="text-display text-white-soft">Let&apos;s create you.</h1>
              <p className="max-w-lg text-subheading text-text-secondary">This is how your person will see you in Our Place — from head to toe.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <button
                type="button"
                disabled={!photoAvailable}
                onClick={() => setStep("selfie")}
                aria-describedby="photo-availability"
                className="panel flex flex-col items-start gap-1.5 p-5 text-left transition-colors hover:border-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-60 short:p-4"
              >
                <span className="text-subheading text-white-soft">Start from a photo</span>
                <span className="text-caption text-text-secondary">Take a selfie and we&apos;ll build a full-body 3D you.</span>
                <span id="photo-availability" className="micro-caps text-text-muted">
                  {photoAvailable ? "About a minute" : "Not available yet"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setStep("studio")}
                className="panel flex flex-col items-start gap-1.5 border-green-600/60 p-5 text-left transition-colors hover:border-green-500 short:p-4"
              >
                <span className="text-subheading text-white-soft">Design your look</span>
                <span className="text-caption text-text-secondary">Choose your face, hair, body and outfit in the studio.</span>
                <span className="micro-caps text-green-500">Ready now</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setInitialCategory("character");
                  setStep("studio");
                }}
                className="panel flex flex-col items-start gap-1.5 p-5 text-left transition-colors hover:border-[var(--border-strong)] short:p-4"
              >
                <span className="text-subheading text-white-soft">Pick or import a 3D character</span>
                <span className="text-caption text-text-secondary">Choose a ready-made character, or bring your own rigged .glb model.</span>
                <span className="micro-caps text-text-muted">Full-body, ready to animate</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (step === "selfie" || step === "bodyType" || step === "provider") {
    return (
      <main className="app-viewport">
        <Atmosphere />
        <div className="relative flex h-full flex-col gap-4 safe-inset">
          <header className="flex items-center justify-between">
            <Wordmark size="sm" />
            <Button variant="ghost" size="sm" onClick={() => setStep(creating ? "intro" : "studio")}>
              Cancel
            </Button>
          </header>
          <div className="min-h-0 flex-1">
            {step === "selfie" && (
              <SelfieCapture
                onConfirm={(photo) => {
                  setSelfie(photo);
                  setStep("bodyType");
                }}
              />
            )}
            {step === "bodyType" && (
              <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-4">
                <h2 className="text-heading text-white-soft">Choose a body base</h2>
                <p className="text-body text-text-secondary">The photo builds your face; this sets the starting body shape. You can adjust it later.</p>
                <div role="radiogroup" aria-label="Body base" className="grid grid-cols-2 gap-3">
                  {[
                    { id: "feminine", name: "Feminine" },
                    { id: "masculine", name: "Masculine" },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={bodyType === option.id}
                      onClick={() => setBodyType(option.id)}
                      className={`panel min-h-14 px-4 text-body ${bodyType === option.id ? "border-green-500 text-white-soft" : "text-text-secondary"}`}
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
                <Button disabled={!bodyType} onClick={() => setStep("provider")}>
                  Create my character
                </Button>
              </div>
            )}
            {step === "provider" && selfie && (
              <MetaPersonCreator selfie={selfie} bodyType={bodyType} onComplete={onProviderComplete} onRetakePhoto={() => setStep("selfie")} />
            )}
          </div>
        </div>
      </main>
    );
  }

  const previewCharacter = { config: previewConfig, model: mine?.model ?? null };
  const providerModel = Boolean(mine?.model);

  return (
    <main className="app-viewport bg-black-950">
      {/* Stage: character dominant. Panel docks right in landscape/desktop, bottom on narrow portrait. */}
      <div className="absolute inset-0 flex flex-col md:flex-row">
        <div className="relative min-h-0 flex-1">
          <StudioStage character={previewCharacter} framing={framing} angle={angle} celebrate={celebrate} reducedMotion={reducedMotion} resetKey={resetKey} />

          <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 safe-inset">
            <div className="pointer-events-auto flex items-center gap-2">
              {creating ? (
                <Button variant="ghost" size="sm" onClick={() => setStep("intro")}>
                  ← Back
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => leave("/lobby")}>
                  ← Our Place
                </Button>
              )}
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              {dirty && !creating && (
                <Button variant="ghost" size="sm" onClick={() => store.getState().resetDraft()}>
                  Reset
                </Button>
              )}
              <SaveButton creating={creating} dirty={dirty} saving={saving} onSave={creating ? finishFirstSave : save} />
            </div>
          </header>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 safe-inset">
            <ViewChips label="Framing" options={FRAMING_OPTIONS} value={framing} onChange={setFraming} />
            <div className="pointer-events-auto flex items-center gap-2">
              <ViewChips label="Angle" options={ANGLES.map(({ id, name }) => ({ id, name }))} value={ANGLES.find((a) => a.value === angle)?.id} onChange={(id) => setAngle(ANGLES.find((a) => a.id === id).value)} />
              <Button
                variant="ghost"
                size="sm"
                aria-label="Reset view"
                onClick={() => {
                  setFraming("full");
                  setAngle(0);
                  setResetKey((n) => n + 1);
                }}
              >
                Reset view
              </Button>
            </div>
          </div>
        </div>

        <aside
          aria-label="Customise your character"
          className="panel flex max-h-[46vh] min-h-0 flex-col rounded-none border-0 border-t md:h-full md:max-h-none md:w-[min(26rem,44vw)] md:border-t-0 md:border-l"
          style={{ paddingRight: "var(--safe-right)", paddingBottom: "var(--safe-bottom)" }}
        >
          <div className="hidden items-center justify-between gap-3 px-4 pt-4 md:flex" style={{ paddingTop: "calc(var(--safe-top) + 1rem)" }}>
            <div>
              <p className="micro-caps text-text-muted">{creating ? "New character" : "Character studio"}</p>
              <p className="text-subheading text-white-soft">{dirty && !creating ? "Unsaved changes" : "You"}</p>
            </div>
          </div>
          {providerModel && (
            <p className="mx-4 mt-3 rounded-[var(--radius-sm)] bg-black-800 px-3 py-2 text-caption text-text-secondary">
              {mine.provider === "library" ? "Your gallery character is shown." : mine.provider === "imported" ? "Your imported character is shown." : "Your photo character is shown."} The other
              tabs style your backup look, used if it ever can&apos;t load.
              {photoAvailable && (
                <button type="button" className="ml-1 text-pink-400 underline underline-offset-2" onClick={() => setStep("selfie")}>
                  Recreate from a photo
                </button>
              )}
            </p>
          )}
          <div className="min-h-0 flex-1">
            <StudioControls
              draft={draft}
              onChange={(patch) => store.getState().updateDraft(patch)}
              showStart={creating}
              onStartingLook={(id) => store.getState().replaceDraft(applyCharacterPatch(DEFAULT_CHARACTER, STARTING_LOOKS.find((look) => look.id === id).patch))}
              onFocusView={setFraming}
              initialCategory={initialCategory}
            />
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {confirmLeave && (
          <UnsavedDialog
            saving={saving}
            onSave={async () => {
              if (await save()) router.push(leaveTarget.current);
            }}
            onDiscard={() => {
              store.getState().resetDraft();
              router.push(leaveTarget.current);
            }}
            onContinue={() => setConfirmLeave(false)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function SaveButton({ creating, dirty, saving, onSave }) {
  return (
    <Button size="md" onClick={onSave} pending={saving} pendingLabel="Saving…" disabled={!creating && !dirty}>
      {creating ? "Save & enter" : dirty ? "Save" : "Saved"}
    </Button>
  );
}

function ViewChips({ label, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="panel pointer-events-auto flex gap-0.5 rounded-[var(--radius-md)] p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={`min-h-9 rounded-[var(--radius-sm)] px-3 text-caption font-medium ${value === option.id ? "bg-black-700 text-white-soft" : "text-text-muted hover:text-text-secondary"}`}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}

function UnsavedDialog({ saving, onSave, onDiscard, onContinue }) {
  const first = useRef(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (event) => event.key === "Escape" && onContinue();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onContinue]);
  return (
    <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black-950/70 safe-inset">
      <m.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        aria-describedby="unsaved-body"
        initial={{ y: 12, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        className="panel flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 p-6"
      >
        <h2 id="unsaved-title" className="text-subheading text-white-soft">
          Save changes?
        </h2>
        <p id="unsaved-body" className="text-body text-text-secondary">
          You&apos;ve changed your look. Save it so your partner sees the new you.
        </p>
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onContinue}>
            Keep editing
          </Button>
          <Button variant="secondary" onClick={onDiscard}>
            Discard
          </Button>
          <Button ref={first} onClick={onSave} pending={saving} pendingLabel="Saving…">
            Save
          </Button>
        </div>
      </m.div>
    </m.div>
  );
}
