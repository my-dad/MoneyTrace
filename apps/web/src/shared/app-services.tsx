"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AuthGateway } from "../features/auth/auth-gateway";
import { createFirebaseAuthGateway } from "../features/auth/firebase-auth-gateway";
import { createFixtureAuthGateway } from "../features/auth/fixture-auth-gateway";
import { createFirebaseCommands, type Commands } from "./commands";
import { isFixtureMode } from "./data-source";
import { createFirebaseReadModelGateway } from "./firebase-read-model-gateway";
import { createFixtureCommands } from "./fixture-commands";
import { InMemoryReadModelGateway } from "./in-memory-read-model-gateway";
import type { ReadModelGateway } from "./read-model-gateway";

export type AppServices = {
  auth: AuthGateway;
  readModels: ReadModelGateway;
  commands: Commands;
  fixture: boolean;
};

const AppServicesContext = createContext<AppServices | null>(null);

export function createAppServices(): AppServices {
  if (isFixtureMode()) {
    return {
      auth: createFixtureAuthGateway(),
      readModels: new InMemoryReadModelGateway(),
      commands: createFixtureCommands(),
      fixture: true,
    };
  }
  return {
    auth: createFirebaseAuthGateway(),
    readModels: createFirebaseReadModelGateway(),
    commands: createFirebaseCommands(),
    fixture: false,
  };
}

export function AppServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}

export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (services === null) throw new Error("useAppServices needs AppServicesProvider");
  return services;
}
