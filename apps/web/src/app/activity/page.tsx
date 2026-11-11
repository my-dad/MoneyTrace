"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ActivityScreen } from "../../features/activity/ActivityScreen";
import { useAppServices } from "../../shared/app-services";

export default function ActivityPage() {
  return (
    <Suspense>
      <ActivityRoute />
    </Suspense>
  );
}

function ActivityRoute() {
  const { readModels, commands } = useAppServices();
  const params = useSearchParams();
  const router = useRouter();
  return (
    <ActivityScreen
      gateway={readModels}
      commands={commands}
      selectedId={params.get("id")}
      onSelect={(id) => { router.push(id === null ? "/activity" : `/activity?id=${encodeURIComponent(id)}`); }}
    />
  );
}
