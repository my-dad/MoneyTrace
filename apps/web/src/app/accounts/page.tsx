"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AccountsHome } from "../../features/accounts/AccountsHome";
import { useAppServices } from "../../shared/app-services";

export default function AccountsPage() {
  return (
    <Suspense>
      <AccountsRoute />
    </Suspense>
  );
}

function AccountsRoute() {
  const { readModels, cash } = useAppServices();
  const params = useSearchParams();
  const router = useRouter();
  return (
    <AccountsHome
      gateway={readModels}
      source={cash}
      selectedId={params.get("id")}
      onSelect={(id) => { router.push(id === null ? "/accounts" : `/accounts?id=${encodeURIComponent(id)}`); }}
    />
  );
}
