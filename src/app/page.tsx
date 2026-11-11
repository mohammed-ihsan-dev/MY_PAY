"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The app starts on the dashboard.
export default function Home() {
  const router = useRouter();
  useEffect(() => router.replace("/dashboard"), [router]);
  return <div className="min-h-dvh bg-background" aria-busy="true" />;
}
