"use client";

import { ChatScreen } from "../../features/chat/ChatScreen";
import { useAppServices } from "../../shared/app-services";

export default function ChatPage() {
  const { readModels, commands } = useAppServices();
  return <ChatScreen gateway={readModels} commands={commands} />;
}
