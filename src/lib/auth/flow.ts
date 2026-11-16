import { z } from "zod";

// Carries a login from /auth/login to its callback: the checks My DWH's answer
// has to pass, and where to go afterwards. Lives for the 10 minutes a code is
// valid, and only on /auth.
export const FLOW_COOKIE = "login_flow";

const flowSchema = z.object({
  state: z.string(),
  nonce: z.string(),
  verifier: z.string(),
  next: z.string(),
});

export type LoginFlow = z.infer<typeof flowSchema>;

export const flowCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  // Lax, so the cookie comes along when My DWH sends the member back.
  sameSite: "lax" as const,
  path: "/auth",
  maxAge: 10 * 60,
};

export function encodeFlow(flow: LoginFlow) {
  return Buffer.from(JSON.stringify(flow)).toString("base64url");
}

export function decodeFlow(value: string | undefined): LoginFlow | null {
  if (!value) return null;
  try {
    const parsed = flowSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString()),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
