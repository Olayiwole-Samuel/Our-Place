import { logConnection } from "@/lib/diagnostics/connectionLog";

export const REJOIN_BASE_MS = 1_000;
export const REJOIN_MAX_MS = 30_000;

/**
 * A private Realtime channel that comes back by itself.
 *
 * supabase-js retries an ERRORED channel on its own, but a CLOSED one is final:
 * the client drops it and never rejoins. The server closes channels when the
 * access token it joined with expires (a phone asleep through the token
 * refresh), on server restarts, and on some network changes — which left a
 * partner "Offline" for good while HTTP (game moves) kept working. Here a
 * channel closed by anyone but us is rebuilt with a fresh token after a short
 * backoff (1s, 2s, 4s … 30s), and `bind` re-attaches its listeners.
 *
 * onStatus(status, error) gets supabase's statuses; after a server close it
 * gets "CLOSED" followed (later) by "SUBSCRIBED" again — treat CLOSED as
 * "reconnecting". `channel` always returns the current channel.
 */
export function openResilientChannel({ supabase, topic, options, bind, onStatus, area = "realtime", log = logConnection, schedule = setTimeout, cancel = clearTimeout }) {
  let channel = null;
  let closed = false;
  let retry = null;
  let attempt = 0;

  function open() {
    if (closed) return;
    const current = supabase.channel(topic, options);
    channel = current;
    bind?.(current);
    // Private channels authorise with the user's access token; fetch a fresh one each join.
    Promise.resolve(supabase.realtime.setAuth())
      .catch(() => {})
      .then(() => {
        if (closed || channel !== current) return;
        current.subscribe((status, error) => {
          if (closed || channel !== current) return;
          if (status === "SUBSCRIBED") attempt = 0;
          onStatus?.(status, error);
          if (status === "CLOSED") rejoinLater();
        });
      });
  }

  function rejoinLater() {
    if (closed || retry) return;
    const delay = Math.min(REJOIN_MAX_MS, REJOIN_BASE_MS * 2 ** attempt);
    attempt += 1;
    log(area, `channel closed by the server — rejoining in ${Math.round(delay / 1000)}s`);
    retry = schedule(() => {
      retry = null;
      open();
    }, delay);
  }

  open();

  return {
    get channel() {
      return channel;
    },
    async close() {
      if (closed) return;
      closed = true;
      cancel(retry);
      retry = null;
      if (channel) await Promise.resolve(supabase.removeChannel(channel)).catch(() => {});
    },
  };
}
