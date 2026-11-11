import { Suspense } from "react";
import type { Metadata } from "next";
import { PageLoading } from "@/components/shared/page-loading";
import { HistoryClient } from "./history-client";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <HistoryClient />
    </Suspense>
  );
}
