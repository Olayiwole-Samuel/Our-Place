"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { reportError } from "@/lib/errors";
import { useAuthStoreApi } from "@/store/authStore";
import { toast } from "@/store/toastStore";

/**
 * Signs this device out, then asks the server for the new state. The app shows
 * the branded loading state in between, so no screen flashes.
 */
export function SignOutButton({ variant = "ghost", size = "sm", className = "", beforeSignOut }) {
  const router = useRouter();
  const authStore = useAuthStoreApi();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    // e.g. leave the presence channel while the session is still valid, so the
    // partner sees a deliberate goodbye rather than a dropped connection.
    await Promise.resolve(beforeSignOut?.()).catch(() => {});
    let result;
    try {
      const { signOut } = await import("@/lib/auth/client");
      result = await signOut();
    } catch (error) {
      result = { ok: false, error };
    }
    const { ok, error } = result;
    if (!ok) {
      reportError(error, { operation: "sign out" });
      toast("We couldn't sign you out. Try again.", "error");
      setPending(false);
      return;
    }
    authStore.getState().setLoading();
    toast("Signed out.");
    router.refresh();
  }

  return (
    <Button variant={variant} size={size} className={className} onClick={handleClick} pending={pending} pendingLabel="Signing out…">
      Sign out
    </Button>
  );
}
