import { Suspense } from "react";
import type { Metadata } from "next";
import { PageLoading } from "@/components/shared/page-loading";
import { SalaryClient } from "./salary-client";

export const metadata: Metadata = { title: "Salary" };

export default function SalaryPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <SalaryClient />
    </Suspense>
  );
}
