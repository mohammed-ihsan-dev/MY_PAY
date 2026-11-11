"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getSettings } from "@/data/settings";
import { isDefaultPin } from "@/data/pin";
import { SettingsView } from "@/components/settings/settings-view";
import { PageLoading } from "@/components/shared/page-loading";

export function SettingsClient() {
  const data = useLiveQuery(async () => ({ settings: await getSettings(), defaultPin: await isDefaultPin() }), []);
  if (!data) return <PageLoading />;
  return <SettingsView key={data.settings.updatedAt ?? "new"} settings={data.settings} defaultPin={data.defaultPin} />;
}
