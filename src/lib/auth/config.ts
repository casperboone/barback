import * as client from "openid-client";

// My DWH (ReMember) is the identity provider. The issuer never changes; it is
// only overridden to log in against a ReMember running locally.
export function issuer() {
  return process.env.MY_DWH_ISSUER || "https://my.dwhdelft.nl";
}

// "on": every page needs a My DWH login. "open": local development without a
// client registered, where the app stays open like it always did.
// "misconfigured": a production build without one, which refuses everyone
// rather than leaving the app open.
export function authMode(): "on" | "open" | "misconfigured" {
  if (process.env.MY_DWH_CLIENT_ID && process.env.MY_DWH_CLIENT_SECRET) {
    return "on";
  }
  return process.env.NODE_ENV === "production" ? "misconfigured" : "open";
}

// The profile scope gives the member's name for the header; members are
// identified by `sub` only.
export const SCOPES = "openid profile";

let discovered: Promise<client.Configuration> | undefined;

// The endpoints come from the discovery document, fetched once per server
// instance. A failed fetch is forgotten so the next request tries again.
export function oidcConfig() {
  discovered ??= discover().catch((error) => {
    discovered = undefined;
    throw error;
  });
  return discovered;
}

async function discover() {
  const server = new URL(issuer());
  const config = await client.discovery(
    server,
    process.env.MY_DWH_CLIENT_ID!,
    undefined,
    client.ClientSecretBasic(process.env.MY_DWH_CLIENT_SECRET!),
    {
      // A local ReMember may run on plain http.
      execute: server.protocol === "http:" ? [client.allowInsecureRequests] : [],
      timeout: 10,
    },
  );
  config.timeout = 10;
  return config;
}

// The redirect URI has to match one registered in Nova exactly, so it follows
// the host the visitor came in on (localhost, or the deployment).
export function redirectUri(origin: string) {
  return `${origin}/auth/callback`;
}
