import type { ProfileRow } from "../../shared/read-model-gateway";
import styles from "./profile.module.css";

const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter((w) => w !== "");
  const letters = words.length > 1 ? `${words[0]?.charAt(0) ?? ""}${words[words.length - 1]?.charAt(0) ?? ""}` : (words[0]?.charAt(0) ?? "");
  return letters.toUpperCase() || "?";
};

/** The user's picture: their Google photo if chosen and present, else initials on their colour. */
export function Avatar({ name, avatar, photoUrl, size = 44 }: { name: string; avatar: ProfileRow["avatar"]; photoUrl?: string | undefined; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if ((avatar === undefined || avatar.kind === "google") && photoUrl !== undefined) {
    return <img className={styles.avatar} src={photoUrl} alt="" referrerPolicy="no-referrer" style={style} />;
  }
  const color = avatar?.kind === "initials" ? avatar.color : "teal";
  return (
    <span className={`${styles.avatar ?? ""} ${styles[`color_${color}`] ?? ""}`} aria-hidden="true" style={style}>
      {initialsOf(name)}
    </span>
  );
}
