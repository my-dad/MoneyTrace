"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { isSettingsSection, SettingsScreen } from "../../features/settings/SettingsScreen";
import { useAppServices } from "../../shared/app-services";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsRoute />
    </Suspense>
  );
}

function SettingsRoute() {
  const { settings, commands, auth } = useAppServices();
  const params = useSearchParams();
  const router = useRouter();
  const section = params.get("section");
  return (
    <SettingsScreen
      source={settings}
      commands={commands}
      section={isSettingsSection(section) ? section : null}
      onSection={(next) => { router.push(next === null ? "/settings" : `/settings?section=${next}`); }}
      onSignOut={() => { void auth.signOut(); }}
    />
  );
}
