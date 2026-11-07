export type AuthUser = { uid: string; displayName?: string };

export type AuthGateway = {
  onChange(callback: (user: AuthUser | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  bootstrap(): Promise<void>;
};
