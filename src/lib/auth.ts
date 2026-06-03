/* Client-side auth helpers — PBKDF2(SHA-256) password hashing.
 *
 * Note: this is a client-only auth scheme. Passwords are hashed with a
 * per-account salt and 100k PBKDF2 iterations before being stored in
 * localStorage. There is no server, so anything is reachable to a
 * determined attacker with browser access — but the hash protects
 * against casual inspection of stored credentials. For production,
 * delegate to a real IdP (OIDC/SSO/SAML).
 */

const ITERATIONS = 100_000;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const len = hex.length / 2;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function generateSalt(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return toHex(buf.buffer);
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const salt = fromHex(saltHex);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

export async function verifyPassword(
  password: string,
  saltHex: string,
  expectedHashHex: string,
): Promise<boolean> {
  const got = await hashPassword(password, saltHex);
  return constantTimeEq(got, expectedHashHex);
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function validateEmail(s: string): string | null {
  if (!s) return "请输入邮箱";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "邮箱格式不正确";
  return null;
}

export function validatePassword(s: string): string | null {
  if (!s) return "请输入密码";
  if (s.length < 6) return "密码至少 6 位";
  return null;
}
