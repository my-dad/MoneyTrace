export type Status = "verified" | "pending" | "needsAnswer";

const LABEL: Record<Status, string> = {
  verified: "Verified",
  pending: "Pending",
  needsAnswer: "Needs answer",
};

const MARK: Record<Status, string[]> = {
  verified: ["m8.5 12.5 2.5 2.5 4.5-5"],
  pending: ["M12 7v5l3 2"],
  needsAnswer: ["M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14", "M12 17h.01"],
};

/** Status is always icon plus text, never color alone. */
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`mt-status mt-status--${status}`}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        {MARK[status].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      {LABEL[status]}
    </span>
  );
}
