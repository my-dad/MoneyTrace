"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "../../features/auth/AuthGate";
import { createFirebaseAuthGateway } from "../../features/auth/firebase-auth-gateway";
import { AccountsScreen } from "../../features/accounts/AccountsScreen";
import { createFirebaseCommands } from "../../shared/commands";
import { createFirebaseReadModelGateway } from "../../shared/firebase-read-model-gateway";
import type { AccountRow } from "../../shared/read-model-gateway";

export default function AccountsPage() {
  const auth = useMemo(() => createFirebaseAuthGateway(), []);
  const gateway = useMemo(() => createFirebaseReadModelGateway(), []);
  const commands = useMemo(() => createFirebaseCommands(), []);
  return (
    <AuthGate gateway={auth}>
      <AccountData gateway={gateway} commands={commands} />
    </AuthGate>
  );
}

function AccountData({
  gateway,
  commands,
}: {
  gateway: ReturnType<typeof createFirebaseReadModelGateway>;
  commands: ReturnType<typeof createFirebaseCommands>;
}) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [readFailed, setReadFailed] = useState(false);
  useEffect(
    () =>
      gateway.watchAccounts(setAccounts, () => {
        setReadFailed(true);
      }),
    [gateway],
  );
  return <AccountsScreen accounts={accounts} commands={commands} readFailed={readFailed} />;
}
