"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-card p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-danger-soft text-danger">
        <AlertTriangle className="size-5" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">This page could not be loaded</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A server or database error occurred. Your data has not been changed.{error.digest ? ` (ref ${error.digest})` : ""}
      </p>
      <Button className="mt-6" onClick={reset}>
        <RefreshCw /> Try again
      </Button>
    </div>
  );
}
