"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PulseDots } from "@/components/ui/PulseDots";
import { characterApi } from "@/lib/character/client";
import { outgoing, parseMetaPersonMessage } from "@/lib/character/metapersonProtocol";
import { METAPERSON_IFRAME } from "@/lib/character/providers";
import { pairingErrorMessage } from "@/lib/couple/errors";

const STATUS_COPY = {
  connecting: "Preparing your character…",
  generating: "Creating your look…",
  ready: "Customise your face, hair and outfit, then choose “Use this character”.",
  importing: "Putting the finishing touches on…",
};

/**
 * Hosts MetaPerson Creator (iframe) inside Our Place:
 *   our server mints a short-lived token → authenticate → UI/export settings →
 *   generate_avatar(selfie) → user customises in MetaPerson → export →
 *   our server imports the GLB (validated full-body) → onComplete(character)
 *
 * There is no fake progress: MetaPerson doesn't expose generation progress to
 * the page, so states are honest and indeterminate.
 */
export function MetaPersonCreator({ selfie, bodyType, onComplete, onRetakePhoto }) {
  const frameRef = useRef(null);
  const [status, setStatus] = useState("connecting");
  const [failure, setFailure] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const mobile = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const src = mobile ? METAPERSON_IFRAME.mobile : METAPERSON_IFRAME.desktop;
  const targetOrigin = new URL(src).origin;

  useEffect(() => {
    let cancelled = false;
    let token = null;
    const tokenPromise = characterApi.providerToken().then((result) => {
      if (cancelled) return;
      if (!result.ok) setFailure(result.code);
      else token = result.data.accessToken;
    });

    const send = (message) => frameRef.current?.contentWindow?.postMessage(message, targetOrigin);

    async function onMessage(event) {
      const parsed = parseMetaPersonMessage(event);
      if (!parsed || cancelled) return;
      if (parsed.type === "loaded") {
        await tokenPromise;
        if (!token) return;
        send(outgoing.authenticate(token));
        send(outgoing.uiParameters({ mobile }));
        send(outgoing.exportParameters());
        send(outgoing.generate({ imageBase64: selfie.base64, bodyType }));
        setStatus("generating");
      } else if (parsed.type === "authenticated" && !parsed.ok) {
        setFailure("provider_unavailable");
      } else if (parsed.type === "generated") {
        setStatus("ready");
      } else if (parsed.type === "exported") {
        setStatus("importing");
        const result = await characterApi.importProviderModel({ url: parsed.url, avatarCode: parsed.avatarCode, avatarState: parsed.avatarState });
        if (cancelled) return;
        if (result.ok) onComplete(result.data.character);
        else {
          setFailure(result.code);
          setStatus("ready");
        }
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
    };
  }, [attempt, bodyType, mobile, onComplete, selfie, targetOrigin]);

  if (failure && status !== "ready") {
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <span aria-hidden="true" className="size-2 rounded-full bg-red-500" />
        <h2 className="text-subheading text-white-soft">We couldn&apos;t create your character yet.</h2>
        <p className="max-w-sm text-body text-text-secondary">{pairingErrorMessage(failure)}</p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setFailure(null);
              setStatus("connecting");
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
          <Button variant="ghost" onClick={onRetakePhoto}>
            Choose another photo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-caption text-text-secondary">
        {status !== "ready" && <PulseDots />}
        {STATUS_COPY[status]}
      </p>
      {failure && status === "ready" && (
        <p role="alert" className="text-caption text-red-500">
          {pairingErrorMessage(failure)}
        </p>
      )}
      <iframe
        key={attempt}
        ref={frameRef}
        src={src}
        title="MetaPerson character creator"
        allow="fullscreen"
        className="min-h-0 flex-1 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-black-900"
      />
    </div>
  );
}
