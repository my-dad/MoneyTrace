import { describe, expect, it } from "vitest";
import corpus from "../../../../fixtures/sms/corpus.json";
import { detectSensitiveContent, maskIdentifiers } from "./sensitive";

describe("detectSensitiveContent", () => {
  it.each([
    ["Your OTP is 482913. Do not share", "otp"],
    ["Use one time password 482913 to verify", "otp"],
    ["Your verification code is 482913", "otp"],
    ["Your PIN is 4821", "pin"],
    ["T-PIN: 4821", "pin"],
    ["Your password is hunter2", "password"],
    ["Card 4111 1111 1111 1111 charged Tk 500", "fullCardNumber"],
    ["Card4111111111111111 charged", "fullCardNumber"],
    ["Card 4111-1111-1111-1111 charged", "fullCardNumber"],
  ])("flags %s", (text, kind) => {
    expect(detectSensitiveContent(text)).toBe(kind);
  });

  it.each([
    "Tk 5,000.00 withdrawn from A/C **4821 at ATM DHANMONDI on 06-11-26 18:42. Avl Bal Tk 42,350.00",
    "Paid 1200 at Shwapno, ref 882193",
    "spent 500 on rickshaw",
    "bought a spinach pie for 200",
    "A/C 1234567890123 credited",
  ])("does not flag ordinary evidence: %s", (text) => {
    expect(detectSensitiveContent(text)).toBeNull();
  });

  it("flags nothing in the fixture corpus", () => {
    for (const f of corpus) expect(detectSensitiveContent(f.text), f.text).toBeNull();
  });
});

describe("maskIdentifiers", () => {
  it("masks long digit runs and keeps short ones", () => {
    expect(maskIdentifiers("A/C 1234567890 ref 882193")).toBe("A/C **7890 ref 882193");
  });
  it("masks phone numbers", () => {
    expect(maskIdentifiers("from 01700000004 successful")).toBe("from **0004 successful");
  });
  it.each([
    ["Card# 6666(ID#1234567)", "Card# 6666(ID#**)"],
    ["(Client ID # 1234567)", "(Client ID # **)"],
    ["(CL ID:7654321)", "(CL ID:**)"],
  ])("masks the client ID in %s", (input, masked) => {
    expect(maskIdentifiers(input)).toBe(masked);
  });
  it("keeps alphanumeric transaction IDs whole", () => {
    expect(maskIdentifiers("TrxID: BK00000001 at")).toBe("TrxID: BK00000001 at");
  });
  it.each([
    ["debited from A/C1234567890 on", "debited from A/C**7890 on"],
    ["acct no.0123456789012 debited", "acct no.**9012 debited"],
    ["Account#1234567890", "Account#**7890"],
    ["A/C:XXXX1234567890 credited", "A/C:XXXX**7890 credited"],
    ["card ****12345678 used", "card ******5678 used"],
  ])("masks an account number glued to its label or to a placeholder: %s", (input, masked) => {
    expect(maskIdentifiers(input)).toBe(masked);
  });
  it.each([
    ["credited to A/C 1234-5678-9012 ref", "credited to A/C **9012 ref"],
    ["A/C No: 0123 4567 8901 23 debited", "A/C No: **0123 debited"],
    ["call 017-1234-5678 now", "call **5678 now"],
    ["from 01712-345678 received", "from **5678 received"],
  ])("masks numbers split by spaces or dashes: %s", (input, masked) => {
    expect(maskIdentifiers(input)).toBe(masked);
  });
  it.each([
    "on 12-11-2026 10:30",
    "on 2026-11-12 at",
    "Tk 1,25,630.00 balance",
    "BDT 15,000 and 2,500",
    "TrxID BK00000003 at 12/11/2026",
    "Ref 882193 time 10 30",
  ])("leaves dates, amounts, times and transaction IDs readable: %s", (input) => {
    expect(maskIdentifiers(input)).toBe(input);
  });
  it("leaves amounts readable", () => {
    expect(maskIdentifiers("Avl Bal:90000.40")).toBe("Avl Bal:90000.40");
  });

  it("does not refuse a bank SMS for its safety footer", () => {
    for (const text of [
      "Tk 700.00 debited from A/C **1234 on 12-Nov-26. Never share your PIN. Helpline 16221",
      "Your card **9999 was charged BDT 1,900.00. Never share OTP with anyone.",
      "BDT 500 received. Do not disclose your password or PIN to anyone. Call 16234",
    ]) {
      expect(detectSensitiveContent(text), text).toBeNull();
    }
  });

  it("still refuses a real code even next to a safety footer", () => {
    expect(detectSensitiveContent("Your OTP is 482913. Never share your OTP.")).toBe("otp");
    expect(detectSensitiveContent("482913 is your one-time password for the transfer")).toBe("otp");
    expect(detectSensitiveContent("Your new PIN is 4821. Never share it.")).toBe("pin");
  });
});
