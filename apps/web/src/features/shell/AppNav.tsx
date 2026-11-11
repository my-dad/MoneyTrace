"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAppServices } from "../../shared/app-services";
import { NavBar } from "./NavBar";

/** Reads the open follow-up count for the rail's Reminders badge. Rendered only after sign-in. */
export function AppNav() {
  const { readModels } = useAppServices();
  const pathname = usePathname();
  const [openReminders, setOpenReminders] = useState(0);
  useEffect(
    () => readModels.watchFollowUps((rows) => { setOpenReminders(rows.filter((row) => row.state === "open").length); }),
    [readModels],
  );
  return <NavBar pathname={pathname} openReminders={openReminders} />;
}
