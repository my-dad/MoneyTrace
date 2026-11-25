/** Who is signed in, as the sign-in provider says. The email and photo can't be edited here. */
export type AuthUser = { uid: string; displayName?: string; email?: string; photoUrl?: string };

export type AuthGateway = {
  onChange(callback: (user: AuthUser | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  bootstrap(): Promise<void>;
};
