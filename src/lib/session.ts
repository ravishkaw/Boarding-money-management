import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "boarding_session";
export const SESSION_DAYS = 90;

export type Session = { personId: number; name: string };

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.personId !== "number" || typeof payload.name !== "string")
      return null;
    return { personId: payload.personId, name: payload.name };
  } catch {
    return null;
  }
}
