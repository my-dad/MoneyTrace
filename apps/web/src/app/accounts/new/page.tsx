"use client";

import { AddAccountScreen } from "../../../features/accounts/AddAccountScreen";
import { useAppServices } from "../../../shared/app-services";

export default function NewAccountPage() {
  const { commands } = useAppServices();
  return <AddAccountScreen commands={commands} />;
}
