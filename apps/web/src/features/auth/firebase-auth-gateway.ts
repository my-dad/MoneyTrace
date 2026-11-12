import { COMMANDS } from "@moneytrace/contracts";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../../shared/firebase";
import type { AuthGateway, AuthUser } from "./auth-gateway";
import { isStandalone, signInWithFallback } from "./sign-in-method";

function toAuthUser(user: User | null): AuthUser | null {
  return user === null
    ? null
    : { uid: user.uid, ...(user.displayName === null ? {} : { displayName: user.displayName }) };
}

export function createFirebaseAuthGateway(): AuthGateway {
  return {
    onChange(callback) {
      return onAuthStateChanged(auth, (user) => {
        callback(toAuthUser(user));
      });
    },
    async signIn() {
      if (process.env.NEXT_PUBLIC_USE_EMULATORS === "1") {
        await signInAnonymously(auth);
      } else {
        const provider = new GoogleAuthProvider();
        await signInWithFallback({
          standalone: isStandalone(),
          popup: () => signInWithPopup(auth, provider),
          redirect: () => signInWithRedirect(auth, provider),
        });
      }
    },
    async signOut() {
      await signOut(auth);
    },
    async bootstrap() {
      const callable = httpsCallable(functions, "bootstrapUser");
      const request = COMMANDS.bootstrapUser.request.parse({});
      const response = await callable(request);
      COMMANDS.bootstrapUser.response.parse(response.data);
    },
  };
}
