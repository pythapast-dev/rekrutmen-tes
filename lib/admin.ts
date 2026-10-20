import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "admin_session";
const TTL_MS = 12 * 60 * 60 * 1000; // sesi 12 jam

function sign(payload: string) {
  return createHmac("sha256", process.env.ADMIN_SECRET ?? "")
    .update(payload)
    .digest("hex");
}

export function checkPassword(input: string) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return b.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export async function createSession() {
  const exp = Date.now() + TTL_MS;
  const token = `${exp}.${sign(String(exp))}`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: TTL_MS / 1000,
  });
}

export async function isAdmin() {
  if (!process.env.ADMIN_SECRET) return false;
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  const expected = sign(exp);
  const ok =
    sig.length === expected.length &&
    timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return ok && Number(exp) > Date.now();
}

export async function destroySession() {
  (await cookies()).delete({ name: COOKIE, path: "/admin" });
}