"use client";

import { AVATAR_COLORS, type Avatar as AvatarChoice, type AvatarColor } from "@moneytrace/contracts";
import { Button } from "@moneytrace/ui-kit";
import { useState } from "react";
import type { CommandRequest, CommandResponse } from "../../shared/commands";
import { PROFILE_COPY } from "../../shared/copy";
import type { ProfileRow } from "../../shared/read-model-gateway";
import { useAction } from "../../shared/use-action";
import { useModalFocus } from "../../shared/use-modal-focus";
import type { AuthUser } from "../auth/auth-gateway";
import { ActionStatus } from "../shell/ActionStatus";
import { Avatar } from "./Avatar";
import styles from "./profile.module.css";

export type UpdateProfile = (request: CommandRequest<"updateProfile">) => Promise<CommandResponse<"updateProfile">>;

/**
 * The user's name and picture, with the sign-in email shown but not editable. `setup` is the page
 * a new account lands on; `edit` is the same form in a dialog, opened from the menu.
 */
export function ProfileScreen({
  mode,
  user,
  profile,
  updateProfile,
  onDone,
}: {
  mode: "setup" | "edit";
  user: AuthUser;
  profile: ProfileRow;
  updateProfile: UpdateProfile;
  onDone: () => void;
}) {
  const hasPhoto = user.photoUrl !== undefined;
  const start: AvatarChoice = profile.avatar ?? (hasPhoto ? { kind: "google" } : { kind: "initials", color: "teal" });
  const [name, setName] = useState(profile.displayName ?? user.displayName ?? "");
  const [avatar, setAvatar] = useState<AvatarChoice>(start.kind === "google" && !hasPhoto ? { kind: "initials", color: "teal" } : start);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const focus = useModalFocus(onDone);
  const tidy = name.trim().replace(/\s+/g, " ");
  const ready = tidy !== "" && tidy.length <= 60;

  const save = () =>
    void action.run(async () => {
      setSaved(false);
      await updateProfile({ displayName: tidy, avatar });
      setSaved(true);
      if (mode === "setup") onDone();
    });

  const form = (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className={styles.preview}>
        <Avatar name={tidy || "?"} avatar={avatar} photoUrl={user.photoUrl} size={84} />
      </div>
      <fieldset className={styles.choices}>
        <legend>{PROFILE_COPY.picture}</legend>
        {hasPhoto && (
          <label className={styles.choice}>
            <input type="radio" name="avatar" checked={avatar.kind === "google"} onChange={() => { setAvatar({ kind: "google" }); }} aria-label={PROFILE_COPY.googlePhoto} />
            <Avatar name={tidy || "?"} avatar={{ kind: "google" }} photoUrl={user.photoUrl} size={40} />
          </label>
        )}
        {AVATAR_COLORS.map((color: AvatarColor) => (
          <label key={color} className={styles.choice}>
            <input
              type="radio"
              name="avatar"
              checked={avatar.kind === "initials" && avatar.color === color}
              onChange={() => { setAvatar({ kind: "initials", color }); }}
              aria-label={PROFILE_COPY.initialsOn(color)}
            />
            <Avatar name={tidy || "?"} avatar={{ kind: "initials", color }} size={40} />
          </label>
        ))}
      </fieldset>
      <label className={styles.field}>
        <span>{PROFILE_COPY.name}</span>
        <input data-autofocus autoComplete="name" maxLength={60} value={name} onChange={(e) => { setName(e.target.value); }} />
      </label>
      <div className={styles.field}>
        <label htmlFor="profile-email">{PROFILE_COPY.email}</label>
        <input id="profile-email" readOnly value={user.email ?? ""} aria-describedby="email-note" />
        <small id="email-note">{PROFILE_COPY.emailNote}</small>
      </div>
      <div className={styles.actions}>
        {mode === "edit" && (
          <button type="button" className={styles.secondary} onClick={onDone}>{PROFILE_COPY.close}</button>
        )}
        <Button type="submit" disabled={!ready || action.busy}>{mode === "setup" ? PROFILE_COPY.saveContinue : PROFILE_COPY.save}</Button>
      </div>
      {saved && mode === "edit" && <p role="status" className={styles.saved}>{PROFILE_COPY.saved}</p>}
      <ActionStatus busy={action.busy} failed={action.failed} unavailable={action.unavailable} />
    </form>
  );

  if (mode === "setup") {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>{PROFILE_COPY.setupTitle}</h1>
          <p className={styles.lead}>{PROFILE_COPY.setupLead}</p>
          {form}
        </div>
      </main>
    );
  }
  return (
    <div className={styles.backdrop} onClick={onDone}>
      <div ref={focus.ref} role="dialog" aria-modal="true" aria-labelledby="edit-profile-title" tabIndex={-1} className={styles.sheet} onKeyDown={focus.onKeyDown} onClick={(e) => { e.stopPropagation(); }}>
        <h2 id="edit-profile-title" className={styles.title}>{PROFILE_COPY.editTitle}</h2>
        {form}
      </div>
    </div>
  );
}
