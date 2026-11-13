import { COMMANDS } from "@moneytrace/contracts";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import type { ApiCall } from "../../shared/api-client";
import type { AuthGateway, AuthUser } from "./auth-gateway";

type AuthClient = Pick<SupabaseClient["auth"], "onAuthStateChange" | "signInWithOAuth" | "signInAnonymously" | "signOut">;

function toAuthUser(user: User | null | undefined): AuthUser | null {
  if (user === null || user === undefined) return null;
  const meta = user.user_metadata as { full_name?: unknown; name?: unknown };
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : undefined;
  return { uid: user.id, ...(name === undefined ? {} : { displayName: name }) };
}

/**
 * Google sign-in through Supabase Auth (CR-010). A full-page redirect works the same in a tab and in
 * an installed PWA, so there is no pop-up path to fall back from. `localSignIn` is the end-to-end
 * suite's anonymous sign-in; the build refuses it unless the project is a local Supabase.
 */
export function createSupabaseAuthGateway(
  auth: AuthClient,
  call: ApiCall,
  origin: () => string,
  options: { localSignIn?: boolean } = {},
): AuthGateway {
  return {
    onChange(callback) {
      const { data } = auth.onAuthStateChange((_event, session: Session | null) => {
        callback(toAuthUser(session?.user));
      });
      return () => {
        data.subscription.unsubscribe();
      };
    },
    async signIn() {
      if (options.localSignIn === true) {
        const { error } = await auth.signInAnonymously();
        if (error !== null) throw error;
        return;
      }
      const { error } = await auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${origin()}/` } });
      if (error !== null) throw error;
    },
    async signOut() {
      const { error } = await auth.signOut();
      if (error !== null) throw error;
    },
    async bootstrap() {
      const request = COMMANDS.bootstrapUser.request.parse({});
      COMMANDS.bootstrapUser.response.parse(await call("bootstrapUser", request));
    },
  };
}
