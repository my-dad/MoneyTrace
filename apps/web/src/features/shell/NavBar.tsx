import Link from "next/link";
import { NavIcon, type NavIconName } from "./NavIcon";
import { remindersLabel } from "./nav-labels";
import styles from "./nav.module.css";

export const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/chat", label: "Chat", icon: "chat" },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/accounts", label: "Accounts", icon: "accounts" },
  { href: "/reports", label: "Reports", icon: "reports" },
] as const satisfies readonly { href: string; label: string; icon: NavIconName }[];

const isActive = (href: string, pathname: string): boolean =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

/** Bottom tabs on phones; a side rail on desktop, which also carries Reminders and Settings. */
export function NavBar({ pathname, openReminders }: { pathname: string; openReminders: number }) {
  return (
    <nav aria-label="Main" className={styles.nav}>
      <p className={styles.logo}>MoneyTrace</p>
      <ul aria-label="Destinations" className={styles.tabs}>
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={styles.tab}
              {...(isActive(item.href, pathname) ? { "aria-current": "page" as const } : {})}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <ul aria-label="More" className={styles.more}>
        <li>
          <Link href="/reminders" className={styles.tab} aria-label={remindersLabel(openReminders)} {...(pathname === "/reminders" ? { "aria-current": "page" as const } : {})}>
            <NavIcon name="bell" />
            <span>Reminders</span>
            {openReminders > 0 && <span className={styles.count} aria-hidden="true">{openReminders}</span>}
          </Link>
        </li>
        <li>
          <Link href="/settings" className={styles.tab} {...(pathname.startsWith("/settings") ? { "aria-current": "page" as const } : {})}>
            <NavIcon name="settings" />
            <span>Settings</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
