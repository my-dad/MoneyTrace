"use client";

import { useState } from "react";
import { DashboardScreen } from "../features/dashboard/DashboardScreen";
import { useAuthUser } from "../features/auth/AuthGate";
import { Avatar } from "../features/profile/Avatar";
import { ProfileGate } from "../features/profile/ProfileGate";
import { ProfileScreen } from "../features/profile/ProfileScreen";
import { WelcomeBack } from "../features/welcome/WelcomeBack";
import { useAppServices } from "../shared/app-services";
import { DemoUnavailableError } from "../shared/demo-unavailable";

export default function HomePage() {
  const { readModels, auth, commands, fixture, nowMs } = useAppServices();
  const user = useAuthUser() ?? { uid: "" };
  // Read the clock once per visit: a new "now" on every render would resubscribe every figure.
  const [now] = useState(nowMs);
  const [editing, setEditing] = useState(false);
  const updateProfile = (request: Parameters<typeof commands.updateProfile>[0]) => commands.updateProfile(request);
  return (
    // A new account sets up its profile first (name, picture; the email is read-only).
    <ProfileGate gateway={readModels} user={user} updateProfile={updateProfile}>
      {(profile) => {
        const name = profile.displayName ?? user.displayName ?? "";
        return (
          <>
            <DashboardScreen
              gateway={readModels}
              nowMs={now}
              displayName={name}
              avatar={<Avatar name={name} avatar={profile.avatar} photoUrl={user.photoUrl} />}
              onEditProfile={() => { setEditing(true); }}
              tagMerchant={(request) => commands.tagMerchant(request)}
              refreshTips={(request) => commands.refreshTips(request)}
              cashIncome={{ recordCashIncome: (request) => commands.recordCashIncome(request), editManualIncome: (request) => commands.editManualIncome(request) }}
              // The demo can't sign out: say so rather than doing nothing.
              onSignOut={fixture ? () => Promise.reject(new DemoUnavailableError()) : () => auth.signOut()}
              // Deleting also ends the session: the sign-in is gone on the server (CR-009).
              onDeleteAccount={
                fixture
                  ? () => Promise.reject(new DemoUnavailableError())
                  : async (confirmation) => {
                      await commands.requestAccountDeletion({ confirmation: confirmation as "DELETE MY ACCOUNT" });
                      await auth.signOut();
                    }
              }
            />
            {/* Once per visit: what happened while you were away. The demo replays its stored last visit. */}
            <WelcomeBack
              gateway={readModels}
              nowMs={now}
              name={name}
              recordVisit={fixture ? () => Promise.resolve({ previousSeenAtMs: profile.lastSeenAtMs ?? null }) : () => commands.recordVisit({})}
            />
            {editing && <ProfileScreen mode="edit" user={user} profile={profile} updateProfile={updateProfile} onDone={() => { setEditing(false); }} />}
          </>
        );
      }}
    </ProfileGate>
  );
}
