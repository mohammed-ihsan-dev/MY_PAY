"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useSerwist } from "@serwist/turbopack/react";

/**
 * When a new version of MY PAY has been downloaded, offer to switch to it.
 * The new service worker only takes over when the user taps Reload, so the
 * page in use never loses the files it is running.
 */
export function UpdatePrompt() {
  const { serwist } = useSerwist();
  useEffect(() => {
    if (!serwist) return;
    const onWaiting = () => {
      toast("A new version of MY PAY is ready", {
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: () => {
            serwist.addEventListener("controlling", () => window.location.reload());
            serwist.messageSkipWaiting();
          },
        },
      });
    };
    serwist.addEventListener("waiting", onWaiting);
    return () => serwist.removeEventListener("waiting", onWaiting);
  }, [serwist]);
  return null;
}
