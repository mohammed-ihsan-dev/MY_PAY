import type { Metadata } from "next";
import { DebtsClient } from "./debts-client";

export const metadata: Metadata = { title: "Debts" };

export default function DebtsPage() {
  return <DebtsClient />;
}
