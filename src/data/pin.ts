import { db } from "./db";

// App PIN shown when MY PAY is opened. It stops casual snooping on the phone;
// it is NOT encryption (the data itself sits unencrypted in this browser's
// storage, protected by the phone's own lock). Only a salted SHA-256 hash of
// the PIN is stored. Until the owner changes it, the PIN is DEFAULT_PIN.

export const DEFAULT_PIN = "1627";
const MAX_FREE_ATTEMPTS = 5;

interface PinHash {
  salt: string;
  hash: string;
}
interface Attempts {
  failures: number;
  lockedUntil: number;
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function digest(pin: string, salt: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`)));
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

async function storedHash(): Promise<PinHash | null> {
  return ((await db().preferences.get("pinHash"))?.value as PinHash | undefined) ?? null;
}

async function attempts(): Promise<Attempts> {
  return ((await db().preferences.get("pinAttempts"))?.value as Attempts | undefined) ?? { failures: 0, lockedUntil: 0 };
}

/** Seconds to wait before the next attempt is allowed (0 = may try now). */
export async function pinWaitSeconds(now = Date.now()): Promise<number> {
  const a = await attempts();
  return Math.max(0, Math.ceil((a.lockedUntil - now) / 1000));
}

export async function verifyPin(pin: string, now = Date.now()): Promise<{ ok: boolean; waitSeconds: number }> {
  const wait = await pinWaitSeconds(now);
  if (wait > 0) return { ok: false, waitSeconds: wait };
  const stored = await storedHash();
  const ok = stored ? (await digest(pin, stored.salt)) === stored.hash : pin === DEFAULT_PIN;
  if (ok) {
    await db().preferences.put({ key: "pinAttempts", value: { failures: 0, lockedUntil: 0 } });
    return { ok: true, waitSeconds: 0 };
  }
  const a = await attempts();
  const failures = a.failures + 1;
  // After 5 wrong PINs: wait 30 s, then 60 s, 120 s … (max 1 hour).
  const lockedUntil = failures >= MAX_FREE_ATTEMPTS ? now + Math.min(3_600_000, 30_000 * 2 ** (failures - MAX_FREE_ATTEMPTS)) : 0;
  await db().preferences.put({ key: "pinAttempts", value: { failures, lockedUntil } });
  return { ok: false, waitSeconds: Math.max(0, Math.ceil((lockedUntil - now) / 1000)) };
}

export async function changePin(currentPin: string, newPin: string): Promise<void> {
  if (!isValidPin(newPin)) throw new Error("The new PIN must be 4 to 8 digits.");
  const check = await verifyPin(currentPin);
  if (!check.ok) throw new Error(check.waitSeconds ? `Too many wrong PINs. Try again in ${check.waitSeconds} s.` : "Your current PIN is incorrect.");
  const salt = randomSalt();
  const hash = await digest(newPin, salt);
  await db().preferences.bulkPut([
    { key: "pinHash", value: { salt, hash } satisfies PinHash },
    { key: "pinLength", value: newPin.length },
  ]);
}

export async function isDefaultPin(): Promise<boolean> {
  return !(await storedHash());
}

/** Number of digits in the PIN (lets the keypad unlock as soon as it is complete). */
export async function pinLength(): Promise<number> {
  return ((await db().preferences.get("pinLength"))?.value as number | undefined) ?? DEFAULT_PIN.length;
}
