"use client";

import { useAuthUser } from "../features/auth/AuthGate";
import { HomeScreen } from "../features/home/HomeScreen";
import { useAppServices } from "../shared/app-services";

export default function HomePage() {
  const { readModels } = useAppServices();
  const user = useAuthUser();
  return (
    <HomeScreen
      gateway={readModels}
      {...(user?.displayName === undefined ? {} : { displayName: user.displayName })}
      onAddAccount={() => {
        window.location.href = "/accounts";
      }}
    />
  );
}
