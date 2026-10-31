/**
 * Loads the YouTube IFrame API once for the whole app (the TV and the music
 * player share it). Resolves with window.YT.
 */
let youtubeApi = null;

export function loadYouTube() {
  youtubeApi ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return youtubeApi;
}
