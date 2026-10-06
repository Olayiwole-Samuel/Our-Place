"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PulseDots } from "@/components/ui/PulseDots";
import { characterApi } from "@/lib/character/client";
import { GALLERY_MODELS } from "@/lib/character/gallery";
import { MAX_MODEL_BYTES } from "@/lib/character/glb";
import { PAIRING_ERROR, pairingErrorMessage } from "@/lib/couple/errors";
import { useCharacterStore, useCharacterStoreApi } from "@/store/characterStore";
import { toast } from "@/store/toastStore";

const IMPORT_HINT = "A rigged, full-body humanoid in .glb format (for example from Mixamo, VRoid or Blender), up to 30 MB.";

/** Cheap checks before uploading; the server re-validates everything. */
async function precheck(file) {
  if (!file) return "Choose a .glb file.";
  if (!/\.glb$/i.test(file.name)) return "Use a .glb file (glTF binary).";
  if (file.size > MAX_MODEL_BYTES) return "That file is over 30 MB. Try a lighter export.";
  const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (String.fromCharCode(...magic) !== "glTF") return "That file isn't a valid .glb.";
  return null;
}

/**
 * Where your character comes from: the built-in designed look, a ready-made
 * gallery character, or your own imported 3D model. Gallery and import changes
 * are saved by the server right away (they replace your model); the designed
 * look is styled in the other tabs and saved with Save.
 */
export function CharacterSourcePanel() {
  const store = useCharacterStoreApi();
  const mine = useCharacterStore((state) => state.mine);
  const [busy, setBusy] = useState(null); // "gallery:<id>" | "designed" | "import"
  const [importStatus, setImportStatus] = useState(null); // uploading | checking
  const [importError, setImportError] = useState(null);
  const fileRef = useRef(null);
  const current = mine?.provider ?? "ourplace";

  async function apply(promise, label) {
    setBusy(label);
    const result = await promise;
    setBusy(null);
    if (!result.ok) {
      toast(pairingErrorMessage(result.code), "error");
      return false;
    }
    store.getState().setMine(result.data.character);
    toast("Your character is updated. Your partner will see it too.", "relationship");
    return true;
  }

  async function onPick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setImportError(null);
    const problem = await precheck(file);
    if (problem) {
      setImportError(problem);
      return;
    }
    setBusy("import");
    setImportStatus("uploading");
    try {
      const slot = await characterApi.startImport();
      if (!slot.ok) throw slot.code;
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const { error } = await getSupabaseBrowserClient().storage.from("character-models").uploadToSignedUrl(slot.data.path, slot.data.token, file, { contentType: "model/gltf-binary" });
      if (error) throw PAIRING_ERROR.NETWORK;
      setImportStatus("checking");
      const result = await characterApi.finishImport(slot.data.path);
      if (!result.ok) throw result.code;
      store.getState().setMine(result.data.character);
      toast("Your 3D character is in. Your partner will see it too.", "relationship");
    } catch (code) {
      setImportError(
        code === PAIRING_ERROR.CHARACTER_MODEL_INVALID
          ? "That model can't be used: it needs to be a rigged, full-body humanoid with everything embedded, under 120k triangles."
          : pairingErrorMessage(typeof code === "string" ? code : PAIRING_ERROR.UNKNOWN),
      );
    } finally {
      setBusy(null);
      setImportStatus(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="micro-caps text-text-muted">Designed by you</p>
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 p-3">
          <p className="text-caption text-text-secondary">Style your face, body, hair and outfit in the other tabs.</p>
          {current === "ourplace" ? (
            <span className="micro-caps shrink-0 text-green-500">In use</span>
          ) : (
            <Button size="sm" variant="secondary" pending={busy === "designed"} onClick={() => apply(characterApi.useDesigned(), "designed")}>
              Use
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="micro-caps text-text-muted">Gallery</p>
        {GALLERY_MODELS.length === 0 ? (
          <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-subtle)] p-3 text-caption text-text-muted">
            Ready-made characters are on their way. You can design your look or import your own model meanwhile.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {GALLERY_MODELS.map((model) => {
              const selected = mine?.provider === "library" && mine.model?.key === `library:${model.id}`;
              return (
                <button
                  key={model.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={Boolean(busy)}
                  onClick={() => !selected && apply(characterApi.useGallery(model.id), `gallery:${model.id}`)}
                  className={`flex flex-col items-start gap-1 rounded-[var(--radius-md)] border p-3 text-left transition-colors disabled:opacity-60 ${
                    selected ? "border-green-500 bg-green-600/15" : "border-[var(--border-subtle)] bg-black-800 hover:border-[var(--border-strong)]"
                  }`}
                >
                  <span className="text-caption font-semibold text-white-soft">{model.name}</span>
                  <span className="text-caption text-text-muted">{busy === `gallery:${model.id}` ? "Switching…" : selected ? "In use" : "Use this character"}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="micro-caps text-text-muted">Your own 3D character</p>
        <p className="text-caption text-text-secondary">{IMPORT_HINT}</p>
        {importStatus && (
          <p role="status" className="flex items-center gap-2 text-caption text-text-secondary">
            <PulseDots /> {importStatus === "uploading" ? "Uploading your character…" : "Checking it's full-body and rigged…"}
          </p>
        )}
        {importError && (
          <p role="alert" className="text-caption text-red-500">
            {importError}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>
            {current === "imported" ? "Replace imported model" : "Import a .glb"}
          </Button>
          {current === "imported" && <span className="micro-caps text-green-500">In use</span>}
        </div>
        <input ref={fileRef} type="file" accept=".glb,model/gltf-binary" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onPick} />
        <p className="text-caption text-text-muted">Imported models are private to you and your partner.</p>
      </div>
    </>
  );
}
