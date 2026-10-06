import { describe, expect, it } from "vitest";
import { getSessionUser } from "./session";

const client = (impl) => ({ auth: { getUser: impl } });

describe("getSessionUser", () => {
  it("returns the verified user for a valid session", async () => {
    const user = { id: "u1", email: "a@example.test" };
    await expect(getSessionUser(client(async () => ({ data: { user }, error: null })))).resolves.toEqual({
      state: "authenticated",
      user,
    });
  });

  it("treats a missing session as signed out", async () => {
    const error = Object.assign(new Error("Auth session missing!"), { name: "AuthSessionMissingError", status: 400 });
    await expect(getSessionUser(client(async () => ({ data: { user: null }, error })))).resolves.toEqual({ state: "signed_out" });
  });

  it("treats an expired or invalid token as signed out", async () => {
    const error = Object.assign(new Error("invalid JWT"), { name: "AuthApiError", status: 401 });
    await expect(getSessionUser(client(async () => ({ data: { user: null }, error })))).resolves.toEqual({ state: "signed_out" });
    const forbidden = Object.assign(new Error("User from sub claim in JWT does not exist"), { name: "AuthApiError", status: 403 });
    await expect(getSessionUser(client(async () => ({ data: { user: null }, error: forbidden })))).resolves.toEqual({
      state: "signed_out",
    });
  });

  it("does not mistake a network failure for a sign-out", async () => {
    const error = Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError", status: 0 });
    await expect(getSessionUser(client(async () => ({ data: { user: null }, error })))).resolves.toEqual({ state: "unavailable" });
    await expect(getSessionUser(client(async () => Promise.reject(new TypeError("fetch failed"))))).resolves.toEqual({
      state: "unavailable",
    });
    const outage = Object.assign(new Error("Bad gateway"), { name: "AuthApiError", status: 502 });
    await expect(getSessionUser(client(async () => ({ data: { user: null }, error: outage })))).resolves.toEqual({
      state: "unavailable",
    });
  });
});
