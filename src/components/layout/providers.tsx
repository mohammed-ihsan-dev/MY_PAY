"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { SerwistProvider } from "@serwist/turbopack/react";
import { UpdatePrompt } from "./update-prompt";

// The service worker is only registered in production builds (in `next dev`
// it would cache files that change on every edit).
const SW_ENABLED = process.env.NODE_ENV === "production";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SerwistProvider swUrl="/sw.js" disable={!SW_ENABLED} reloadOnOnline={false} options={{ scope: "/", type: "classic" }}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        {children}
        {SW_ENABLED && <UpdatePrompt />}
        <Toaster position="top-center" richColors closeButton toastOptions={{ className: "!rounded-xl" }} />
      </ThemeProvider>
    </SerwistProvider>
  );
}
