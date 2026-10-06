"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SELFIE_ERRORS, SELFIE_RULES, checkSelfieDimensions, checkSelfieFile, encodeSelfie } from "@/lib/character/selfie";

const TIPS = ["Face the camera straight on", "Soft, even light — no strong shadows", "Hair off your face, no sunglasses", "Arm's length away, head and shoulders in frame"];

/**
 * Selfie step: front camera (live preview → capture → retake/confirm) with a
 * photo-upload fallback. The image stays in memory in this tab; on confirm it
 * is handed to the provider step, which sends it straight to the provider.
 * Our Place never uploads or stores it.
 */
export function SelfieCapture({ onConfirm, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [mode, setMode] = useState("choose"); // choose | camera | preview
  const [error, setError] = useState(null);
  const [photo, setPhoto] = useState(null); // { base64, previewUrl }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };
  useEffect(() => stopCamera, []);

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("camera_unavailable");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      setMode("camera");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (cause) {
      setError(cause?.name === "NotAllowedError" ? "camera_denied" : "camera_unavailable");
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const problem = checkSelfieDimensions(video.videoWidth, video.videoHeight);
    if (problem) {
      setError(problem);
      return;
    }
    setPhoto(encodeSelfie(video, video.videoWidth, video.videoHeight, { mirror: true }));
    stopCamera();
    setMode("preview");
  }

  function pickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const problem = checkSelfieFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dims = checkSelfieDimensions(image.naturalWidth, image.naturalHeight);
      if (dims) setError(dims);
      else {
        setPhoto(encodeSelfie(image, image.naturalWidth, image.naturalHeight));
        setError(null);
        setMode("preview");
      }
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      setError("unreadable");
      URL.revokeObjectURL(url);
    };
    image.src = url;
  }

  return (
    <div className="flex h-full flex-col gap-4 md:flex-row md:items-center md:gap-8">
      <div className="relative mx-auto aspect-[3/4] h-full max-h-[60vh] min-h-48 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-black-900 md:max-h-[70vh] short:max-h-[52vh]">
        {mode === "camera" && (
          // Mirrored like a mirror; the captured image is un-mirrored.
          <video ref={videoRef} playsInline muted aria-label="Camera preview" className="h-full w-full -scale-x-100 object-cover" />
        )}
        {mode === "preview" && photo && (
          // eslint-disable-next-line @next/next/no-img-element -- local in-memory preview, never uploaded
          <img src={photo.previewUrl} alt="Your photo" className="h-full w-full object-cover" />
        )}
        {mode === "choose" && (
          <div className="grid h-full place-items-center p-6 text-center">
            <svg aria-hidden="true" width="64" height="80" viewBox="0 0 64 80" fill="none" className="text-text-muted">
              <ellipse cx="32" cy="30" rx="20" ry="25" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" />
              <path d="M8 78c2-14 12-20 24-20s22 6 24 20" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" />
            </svg>
          </div>
        )}
        {mode === "camera" && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-[62%] w-[58%] rounded-[50%] border-2 border-dashed border-white-soft/60" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 md:max-w-sm">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-heading text-white-soft">{mode === "preview" ? "Looking good?" : "Take a clear selfie"}</h2>
          <p className="text-body text-text-secondary">
            {mode === "preview" ? "We'll build a full-body 3D you from this photo. You can customise everything next." : "A front-facing photo gives us the best starting point for your character."}
          </p>
        </div>
        {mode !== "preview" && (
          <ul className="flex flex-col gap-1 text-caption text-text-muted">
            {TIPS.map((tip) => (
              <li key={tip} className="flex gap-2">
                <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-green-500" />
                {tip}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-caption text-red-500">
            {SELFIE_ERRORS[error]}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {mode === "choose" && (
            <>
              <Button onClick={startCamera}>Open camera</Button>
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                Choose a photo
              </Button>
            </>
          )}
          {mode === "camera" && (
            <>
              <Button variant="relationship" onClick={capture}>
                Take photo
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  stopCamera();
                  setMode("choose");
                }}
              >
                Cancel
              </Button>
            </>
          )}
          {mode === "preview" && (
            <>
              <Button onClick={() => onConfirm(photo)}>Use this photo</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setPhoto(null);
                  setMode("choose");
                }}
              >
                Retake
              </Button>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept={SELFIE_RULES.types.join(",")} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pickFile} />
        <p className="text-caption text-text-muted">Your photo is only used to create your character. Our Place never stores it.</p>
        {onCancel && (
          <Button variant="ghost" size="sm" className="self-start" onClick={onCancel}>
            ← Back
          </Button>
        )}
      </div>
    </div>
  );
}
