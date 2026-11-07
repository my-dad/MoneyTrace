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
  it("leaves amounts readable", () => {
    expect(maskIdentifiers("Avl Bal:90000.40")).toBe("Avl Bal:90000.40");
  });
});
