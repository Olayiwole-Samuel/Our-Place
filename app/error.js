"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { reportError } from "@/lib/errors";

/** Route-level error boundary for anything under the root layout. */
export default function RouteError({ error, reset }) {
  useEffect(() => {
    reportError(error, { boundary: "route", digest: error.digest });
  }, [error]);

  return <ErrorState error={error} onRetry={reset} />;
}
