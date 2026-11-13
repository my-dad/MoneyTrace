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
import { firebase, firebaseInvoke } from "../../shared/firebase";
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
      return onAuthStateChanged(firebase().auth, (user) => {
        callback(toAuthUser(user));
      });
    },
    async signIn() {
      if (process.env.NEXT_PUBLIC_USE_EMULATORS === "1") {
        await signInAnonymously(firebase().auth);
      } else {
        const provider = new GoogleAuthProvider();
        await signInWithFallback({
          standalone: isStandalone(),
          popup: () => signInWithPopup(firebase().auth, provider),
          redirect: () => signInWithRedirect(firebase().auth, provider),
        });
      }
    },
    async signOut() {
      await signOut(firebase().auth);
    },
    async bootstrap() {
      const request = COMMANDS.bootstrapUser.request.parse({});
      COMMANDS.bootstrapUser.response.parse(await firebaseInvoke("bootstrapUser", request));
    },
  };
}
