"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CashSource } from "../features/accounts/cash-source";
import { createFixtureCashSource } from "../features/accounts/fixture-cash-source";
import { createFixtureReportSource } from "../features/reports/fixture-report-source";
import type { ReportSource } from "../features/reports/report-source";
import type { AuthGateway } from "../features/auth/auth-gateway";
import { createFirebaseAuthGateway } from "../features/auth/firebase-auth-gateway";
import { createFixtureAuthGateway } from "../features/auth/fixture-auth-gateway";
import { createFirebaseCommands, type Commands } from "./commands";
import { isFixtureMode } from "./data-source";
import { createFirebaseReadModelGateway } from "./firebase-read-model-gateway";
import { createFixtureCommands } from "./fixture-commands";
import { createFixtureReadModels } from "./fixtures/fixture-read-models";
import type { ReadModelGateway } from "./read-model-gateway";

export type AppServices = {
  auth: AuthGateway;
  readModels: ReadModelGateway;
  commands: Commands;
  /** Account details and cash actions; fixture-only until functionality resumes. */
  cash: CashSource | null;
  /** Period reports; fixture-only until functionality resumes. */
  reports: ReportSource | null;
  fixture: boolean;
};

const AppServicesContext = createContext<AppServices | null>(null);

export function createAppServices(): AppServices {
  if (isFixtureMode()) {
    return {
      auth: createFixtureAuthGateway(),
      readModels: createFixtureReadModels(),
      commands: createFixtureCommands(),
      cash: createFixtureCashSource(),
      reports: createFixtureReportSource(),
      fixture: true,
    };
  }
  return {
    auth: createFirebaseAuthGateway(),
    readModels: createFirebaseReadModelGateway(),
    commands: createFirebaseCommands(),
    cash: null,
    reports: null,
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
