"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ProfileRow, ReadModelGateway } from "../../shared/read-model-gateway";
import type { AuthUser } from "../auth/auth-gateway";
import { SettingUp } from "../shell/SettingUp";
import { ProfileScreen, type UpdateProfile } from "./ProfileScreen";

/**
 * A new account lands on its profile first; once a profile has been saved (`profileCompletedAtMs`),
 * the children render with the live profile. Until the profile exists, it says it is setting up.
 */
export function ProfileGate({
  gateway,
  user,
  updateProfile,
  children,
}: {
  gateway: ReadModelGateway;
  user: AuthUser;
  updateProfile: UpdateProfile;
  children: (profile: ProfileRow) => ReactNode;
}) {
  const [profile, setProfile] = useState<ProfileRow | null | undefined>(undefined);
  // Set when the first save succeeds, so the dashboard shows before the read model catches up.
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => gateway.watchProfile(setProfile, () => { setProfile(null); }), [gateway]);

  if (profile === undefined || profile === null) return <SettingUp />;
  if (profile.profileCompletedAtMs === undefined && !justSaved) {
    return <ProfileScreen mode="setup" user={user} profile={profile} updateProfile={updateProfile} onDone={() => { setJustSaved(true); }} />;
  }
  return <>{children(profile)}</>;
}
