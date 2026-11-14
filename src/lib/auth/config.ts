import { Google } from "arctic";

// Always has access, can't be removed, and is let back in on every sign-in.
export const OWNER_EMAIL = "bar@dwhdelft.nl";

// "on": Google sign-in guards every page. "open": local development without a
// Google client, where the app stays open like it always did. "misconfigured":
// a production build without a Google client, which refuses everyone rather
// than leaving the app open.
export function authMode(): "on" | "open" | "misconfigured" {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return "on";
  }
  return process.env.NODE_ENV === "production" ? "misconfigured" : "open";
}

// The callback has to match one registered on the Google client exactly, so it
// follows whatever host the visitor came in on (localhost, or the deployment).
export function googleClient(origin: string) {
  return new Google(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${origin}/auth/google/callback`,
  );
}

// Short-lived cookies that carry a sign-in from /auth/google to its callback.
export const OAUTH_COOKIES = {
  state: "google_oauth_state",
  verifier: "google_code_verifier",
  next: "auth_next",
};
