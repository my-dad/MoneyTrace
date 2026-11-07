"use client";

import { useMemo } from "react";
import { AuthGate } from "../../features/auth/AuthGate";
import { createFirebaseAuthGateway } from "../../features/auth/firebase-auth-gateway";
import { ChatScreen } from "../../features/chat/ChatScreen";
import { createFirebaseCommands } from "../../shared/commands";
import { createFirebaseReadModelGateway } from "../../shared/firebase-read-model-gateway";

export default function ChatPage() {
  const auth = useMemo(() => createFirebaseAuthGateway(), []);
  const gateway = useMemo(() => createFirebaseReadModelGateway(), []);
  const commands = useMemo(() => createFirebaseCommands(), []);

  return (
    <AuthGate gateway={auth}>
      <ChatScreen gateway={gateway} commands={commands} />
    </AuthGate>
  );
}
