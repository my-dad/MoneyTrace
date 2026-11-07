import { COMMANDS } from "@moneytrace/contracts";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../../shared/firebase";
import type { AuthGateway, AuthUser } from "./auth-gateway";

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
      await signInWithPopup(auth, new GoogleAuthProvider());
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
