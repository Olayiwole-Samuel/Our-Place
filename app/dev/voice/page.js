import { notFound } from "next/navigation";
import { VoiceSelfTestClient } from "@/components/dev/VoiceSelfTestClient";

export const dynamic = "force-dynamic";

/**
 * DEVELOPMENT ONLY — not part of the product.
 * /dev/voice#appId=…&channel=…&token=…&uid=… joins an Agora channel with the
 * same SDK and settings as the app's voice (lib/voice/agoraVoiceSession.js),
 * publishes the microphone and reports what it hears in window.__voiceTest.
 * scripts/voice-e2e.mjs runs two of these against each other. 404 in production.
 */
export default function VoiceTestPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <VoiceSelfTestClient />;
}
