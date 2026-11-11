import { Suspense } from "react";
import type { Metadata } from "next";
import { PageLoading } from "@/components/shared/page-loading";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = { title: "Home" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <DashboardClient />
    </Suspense>
  );
}
