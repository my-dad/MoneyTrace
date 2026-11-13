"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AuthGateway } from "../features/auth/auth-gateway";
import { createFixtureAuthGateway } from "../features/auth/fixture-auth-gateway";
import { createSupabaseAuthGateway } from "../features/auth/supabase-auth-gateway";
import { createApiCall } from "./api-client";
import { createCommands, type Commands } from "./commands";
import { isFixtureMode } from "./data-source";
import { createFixtureCommands } from "./fixture-commands";
import { createFixtureReadModels } from "./fixtures/fixture-read-models";
import { FIXTURE_NOW_MS } from "./fixtures/household";
import type { ReadModelGateway } from "./read-model-gateway";
import { apiUrl, supabase } from "./supabase";
import { readSupabaseEnv, resolveSupabaseConfig } from "./supabase-config";
import { createDocsReadModelGateway, createSupabaseDocsSource } from "./supabase-read-model-gateway";

export type AppServices = {
  auth: AuthGateway;
  readModels: ReadModelGateway;
  commands: Commands;
  fixture: boolean;
  /** The app's "now". The demo is pinned to 6 Nov 2026 20:00 Dhaka so its figures never drift. */
  nowMs: () => number;
};

const AppServicesContext = createContext<AppServices | null>(null);

export function createAppServices(): AppServices {
  if (isFixtureMode()) {
    return {
      auth: createFixtureAuthGateway(),
      readModels: createFixtureReadModels(),
      commands: createFixtureCommands(),
      fixture: true,
      nowMs: () => FIXTURE_NOW_MS,
    };
  }
  const client = supabase();
  let uid: string | null = null;
  client.auth.onAuthStateChange((_event, session) => {
    uid = session?.user.id ?? null;
  });
  const env = readSupabaseEnv();
  const call = createApiCall({
    url: apiUrl(),
    anonKey: resolveSupabaseConfig(env).anonKey,
    accessToken: async () => (await client.auth.getSession()).data.session?.access_token ?? null,
    fetchImpl: (input, init) => fetch(input, init),
  });
  return {
    auth: createSupabaseAuthGateway(client.auth, call, () => window.location.origin, {
      localSignIn: env.localSignIn === "1",
    }),
    readModels: createDocsReadModelGateway(createSupabaseDocsSource(client, () => uid)),
    commands: createCommands((name, request) => call(name, request)),
    fixture: false,
    nowMs: () => Date.now(),
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
