/** Money for display: `৳1,25,000`, with paisa only when there are any. Digits only, never a float. */
export function formatBdt(minor: number): string {
  const digits = String(Math.abs(minor)).padStart(3, "0");
  const whole = digits.slice(0, -2);
  const fraction = digits.slice(-2);
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest === "" ? last3 : `${rest.replace(/\B(?=(\d{2})+$)/g, ",")},${last3}`;
  const sign = minor < 0 ? "-" : "";
  return `${sign}৳${grouped}${fraction === "00" ? "" : `.${fraction}`}`;
}
