const PATHS = {
  home: ["M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"],
  chat: ["M5 18.5 4 21l3.2-1.4A8.5 8.5 0 1 0 5 18.5z"],
  activity: ["M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"],
  accounts: ["M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"],
  reports: ["M5 20V11M12 20V5M19 20v-6"],
  bell: ["M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"],
  settings: ["M4 7h10M18 7h2M4 17h4M12 17h8", "M18 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM12 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"],
} as const;

export type NavIconName = keyof typeof PATHS;

/** Decorative: every use sits beside, or is labelled by, visible text. */
export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
