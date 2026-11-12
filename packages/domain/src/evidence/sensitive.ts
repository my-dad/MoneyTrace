export type SensitiveKind = "otp" | "pin" | "password" | "fullCardNumber";

const OTP_WORD = String.raw`(?:otp|one[- ]?time[- ]?(?:password|pin|code)|verification code)`;
/** An OTP is a secret only with its code: "Your OTP is 482913", "482913 is your OTP". */
const OTP = new RegExp(String.raw`\b${OTP_WORD}\b\D{0,20}\b\d{4,8}\b|\b\d{4,8}\b\D{0,20}\b${OTP_WORD}\b`, "i");
/** Banks' safety footers ("Never share your PIN", "Do not disclose your password") name secrets without containing any. */
const ADVISORY = /\b(?:never|do\s*not|don['’]?t|dont)\s+(?:share|disclose|tell|give|reveal)\b[^.!?\n]{0,60}/gi;
const PIN = /\b(?:t-?)?pin\b.{0,15}\d{4,6}/i;
const PASSWORD = /\b(?:password|passcode)\b/i;
const CARD_RUN = /(?<!\d)\d{13,19}(?!\d)/g;
const CARD_GROUPED = /(?<!\d)\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}(?!\d)/g;

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function hasFullCardNumber(text: string): boolean {
  const runs = [...(text.match(CARD_RUN) ?? []), ...(text.match(CARD_GROUPED) ?? [])];
  return runs.some((run) => {
    const digits = run.replace(/[ -]/g, "");
    return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
  });
}

/** Secrets the product must never store or forward (PRD section 10). */
export function detectSensitiveContent(text: string): SensitiveKind | null {
  const withoutAdvice = text.replace(ADVISORY, " ");
  if (OTP.test(withoutAdvice)) return "otp";
  if (PIN.test(withoutAdvice)) return "pin";
  if (PASSWORD.test(withoutAdvice)) return "password";
  if (hasFullCardNumber(text)) return "fullCardNumber";
  return null;
}

/** Hides account, phone and client numbers before evidence is stored or sent to a provider. */
export function maskIdentifiers(text: string): string {
  return text
    .replace(/(Client ID\s*#?\s*|CL ID\s*:?\s*|ID#\s*)\d+/gi, "$1**")
    .replace(/(?<![A-Za-z0-9])\d{8,}(?![A-Za-z0-9])/g, (run) => `**${run.slice(-4)}`);
}
