import type { ReactNode } from "react";

export interface ChipProps {
  /** Leave unset for a one-shot quick reply; set it for a chip that toggles. */
  selected?: boolean;
  /** The dashed "Not sure yet" style. */
  tentative?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function Chip({ selected, tentative = false, onClick, children }: ChipProps) {
  const classes = ["mt-chip"];
  if (selected === true) classes.push("mt-chip--selected");
  if (tentative) classes.push("mt-chip--tentative");
  return (
    <button
      type="button"
      className={classes.join(" ")}
      onClick={onClick}
      {...(selected === undefined ? {} : { "aria-pressed": selected })}
    >
      {selected === true && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      )}
      {children}
    </button>
  );
}
