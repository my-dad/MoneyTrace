"use client";

import { useEffect, useState } from "react";
import { AccountsScreen } from "../../../features/accounts/AccountsScreen";
import { useAppServices } from "../../../shared/app-services";
import type { AccountRow } from "../../../shared/read-model-gateway";

export default function NewAccountPage() {
  const { readModels, commands } = useAppServices();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [readFailed, setReadFailed] = useState(false);
  useEffect(
    () =>
      readModels.watchAccounts(setAccounts, () => {
        setReadFailed(true);
      }),
    [readModels],
  );
  return <AccountsScreen accounts={accounts} commands={commands} readFailed={readFailed} startAdding />;
}
