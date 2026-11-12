"use client";

import { ReportsScreen } from "../../features/reports/ReportsScreen";
import { useAppServices } from "../../shared/app-services";

export default function ReportsPage() {
  const { reports } = useAppServices();
  return <ReportsScreen source={reports} />;
}
