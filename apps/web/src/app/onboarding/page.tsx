"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OnboardingWizard } from "../../features/onboarding/OnboardingWizard";
import { UNEXPLAINED_CASH_ID } from "../../features/accounts/accounts-view-model";
import { useAppServices } from "../../shared/app-services";
import type { AccountRow } from "../../shared/read-model-gateway";

export default function OnboardingPage() {
  const { readModels, commands } = useAppServices();
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  useEffect(() => readModels.watchAccounts(setAccounts), [readModels]);
  return (
    <OnboardingWizard
      commands={commands}
      accounts={accounts.filter((account) => account.id !== UNEXPLAINED_CASH_ID)}
      onDone={() => { router.push("/"); }}
    />
  );
}
