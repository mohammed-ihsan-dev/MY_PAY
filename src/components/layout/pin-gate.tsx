"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Delete, Loader2 } from "lucide-react";
import { pinLength, pinWaitSeconds, verifyPin } from "@/data/pin";
import { OWNER_NAME } from "@/lib/app";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand";

// Asks for the PIN when the app is opened (each browser/app session) and again
// after it has been in the background for a while.

const SESSION_KEY = "mypay.unlocked";
const RELOCK_AFTER_MS = 5 * 60 * 1000;

const LockContext = createContext<{ lock: () => void }>({ lock: () => {} });
export const useLock = () => useContext(LockContext);

function readUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}
function writeUnlocked(v: boolean) {
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, "1");
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: the PIN is simply asked again */
  }
}

export function PinGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "unlocked">("checking");

  useEffect(() => {
    // sessionStorage only exists in the browser, so this is read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(readUnlocked() ? "unlocked" : "locked");
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER_MS) {
        writeUnlocked(false);
        setState("locked");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const lock = useCallback(() => {
    writeUnlocked(false);
    setState("locked");
  }, []);

  if (state === "checking") return <div className="min-h-dvh bg-background" aria-busy="true" />;
  if (state === "locked")
    return (
      <PinScreen
        onUnlock={() => {
          writeUnlocked(true);
          setState("unlocked");
        }}
      />
    );
  return <LockContext.Provider value={{ lock }}>{children}</LockContext.Provider>;
}

function PinScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [length, setLength] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pinLength().then(setLength);
    void pinWaitSeconds().then(setWait);
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      const r = await verifyPin(value);
      setBusy(false);
      if (r.ok) return onUnlock();
      setPin("");
      setWait(r.waitSeconds);
      setError(r.waitSeconds ? "Too many wrong PINs." : "Wrong PIN. Try again.");
      navigator.vibrate?.(120);
    },
    [onUnlock]
  );

  const press = (d: string) => {
    if (busy || wait > 0) return;
    setError(null);
    const next = (pin + d).slice(0, 8);
    setPin(next);
    if (next.length === length) void submit(next);
  };
  const back = () => setPin((p) => p.slice(0, -1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="flex w-full max-w-xs flex-col items-center">
        <BrandMark className="size-14 rounded-2xl [&_svg]:size-7" />
        <h1 className="mt-4 text-lg font-semibold tracking-wide">MY PAY</h1>
        <p className="mt-1 text-sm text-muted-foreground">{OWNER_NAME}</p>
        <p className="mt-6 text-sm font-medium" id="pin-label">
          Enter your PIN
        </p>
        <div className="mt-3 flex h-4 gap-3" role="status" aria-live="polite" aria-labelledby="pin-label" aria-label={`${pin.length} of ${length} digits entered`}>
          {Array.from({ length }).map((_, i) => (
            <span key={i} className={cn("size-3.5 rounded-full border-2 border-primary transition", i < pin.length && "bg-primary", error && "border-danger")} />
          ))}
        </div>
        <p className="mt-3 h-5 text-sm font-medium text-danger" role="alert">
          {wait > 0 ? `Too many wrong PINs. Try again in ${wait} s.` : error}
        </p>
        <div className="mt-4 grid w-full grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <PadKey key={d} onClick={() => press(d)} disabled={wait > 0}>
              {d}
            </PadKey>
          ))}
          <span />
          <PadKey onClick={() => press("0")} disabled={wait > 0}>
            0
          </PadKey>
          <PadKey onClick={back} aria-label="Delete last digit" disabled={!pin} subtle>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Delete className="size-5" />}
          </PadKey>
        </div>
      </div>
    </main>
  );
}

function PadKey({ subtle, className, ...props }: React.ComponentProps<"button"> & { subtle?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "grid h-16 place-items-center rounded-2xl text-2xl font-medium transition active:scale-95 disabled:opacity-40",
        subtle ? "text-muted-foreground hover:bg-muted" : "border bg-card shadow-[0_1px_2px_rgba(38,53,45,0.05)] hover:bg-muted",
        className
      )}
      {...props}
    />
  );
}
