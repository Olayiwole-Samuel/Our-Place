"use client";

import { useEffect, useState } from "react";

/**
 * DEVELOPMENT ONLY — two-browser voice check (see app/dev/voice/page.js).
 * Credentials arrive in the URL fragment (never sent to the server or logged).
 */
export function VoiceSelfTestClient() {
  const [lines, setLines] = useState([]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const report = (window.__voiceTest = { state: "starting", published: false, remoteUsers: [], remoteLevels: [], localLevels: [], errors: [] });
    const log = (line) => setLines((current) => [...current.slice(-12), line]);
    let client = null;
    let mic = null;
    let timer = null;
    (async () => {
      try {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        AgoraRTC.setLogLevel(3);
        AgoraRTC.disableLogUpload?.();
        client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        client.on("connection-state-change", (state) => {
          report.state = state;
          log(`connection: ${state}`);
        });
        client.on("user-published", async (user, mediaType) => {
          if (mediaType !== "audio") return;
          await client.subscribe(user, "audio");
          user.audioTrack.play();
          report.remoteUsers = client.remoteUsers.map((u) => String(u.uid));
          log(`hearing ${user.uid}`);
        });
        await client.join(params.get("appId"), params.get("channel"), params.get("token"), params.get("uid"));
        mic = await AgoraRTC.createMicrophoneAudioTrack({ AEC: false, ANS: false, AGC: false, encoderConfig: "speech_standard" });
        await client.publish(mic);
        report.published = true;
        log("microphone published");
        timer = setInterval(() => {
          report.localLevels.push(Number(mic.getVolumeLevel().toFixed(3)));
          const remote = client.remoteUsers.find((u) => u.audioTrack);
          report.remoteLevels.push(remote ? Number(remote.audioTrack.getVolumeLevel().toFixed(3)) : -1);
        }, 500);
      } catch (error) {
        report.state = "error";
        report.errors.push(String(error?.code ?? error?.message ?? error));
        log(`error: ${error?.code ?? error?.message}`);
      }
    })();
    return () => {
      clearInterval(timer);
      mic?.close();
      client?.leave();
    };
  }, []);
  return (
    <main className="p-6 font-mono text-caption text-white-soft">
      <h1 className="mb-2 font-semibold">Voice self-test (dev)</h1>
      {lines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </main>
  );
}
