"use client";

import { useEffect, useState } from "react";
import { ensureSettings } from "@/data/settings";
import { AppShell } from "./app-shell";
import { PinGate } from "./pin-gate";

/**
 * Client-side root of the app: opens the on-device database, asks the browser
 * to keep it (persistent storage, so it is not evicted when space runs low),
 * then shows the PIN lock and the app.
 */
export function AppRoot({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    ensureSettings()
      .then(() => setReady(true))
      .catch((err: unknown) => setFailed(err instanceof Error ? err.message : "Storage is not available."));
    void navigator.storage?.persist?.().catch(() => {});
  }, []);

  if (failed)
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 text-center">
        <h1 className="text-lg font-semibold">MY PAY cannot open its storage</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Private or incognito mode, or blocked site data, can prevent saving. Open MY PAY in a normal browser window. ({failed})
        </p>
      </main>
    );
  if (!ready) return <div className="min-h-dvh bg-background" aria-busy="true" />;
  return (
    <PinGate>
      <AppShell>{children}</AppShell>
    </PinGate>
  );
}
