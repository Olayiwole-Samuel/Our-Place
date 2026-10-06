"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/errors";

/**
 * Last-resort boundary for failures in the root layout itself. It replaces the
 * whole document, so it cannot rely on globals.css or fonts — styles are inline.
 */
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    reportError(error, { boundary: "global", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#080a09",
          color: "#f5f5f2",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div role="alert">
          <h1 style={{ fontWeight: 500, fontSize: 28, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontFamily: "system-ui, sans-serif", opacity: 0.75, margin: "0 0 20px" }}>
            Our Place hit an unexpected problem.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              font: "600 15px system-ui, sans-serif",
              background: "#596b40",
              color: "#ffffff",
              border: 0,
              borderRadius: 10,
              padding: "12px 20px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
