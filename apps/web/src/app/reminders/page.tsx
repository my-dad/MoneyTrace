"use client";

import { RemindersScreen } from "../../features/reminders/RemindersScreen";
import { useAppServices } from "../../shared/app-services";

export default function RemindersPage() {
  const { readModels, commands } = useAppServices();
  return <RemindersScreen gateway={readModels} commands={commands} />;
}
