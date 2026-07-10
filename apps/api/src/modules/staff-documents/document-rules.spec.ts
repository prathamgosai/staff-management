import { deriveStatus, maskNumber } from "./document-rules";

const TODAY = "2026-07-09";

describe("document-rules: deriveStatus", () => {
  const optional = { requires_number: false, requires_expiry: false };
  const needsNumber = { requires_number: true, requires_expiry: false };
  const needsExpiry = { requires_number: false, requires_expiry: true };

  it("valid when complete and not expired", () => {
    expect(deriveStatus(optional, null, null, TODAY)).toBe("valid");
    expect(deriveStatus(needsNumber, "ABC", "2027-01-01", TODAY)).toBe("valid");
  });

  it("pending when a required number or expiry is missing", () => {
    expect(deriveStatus(needsNumber, null, "2027-01-01", TODAY)).toBe("pending");
    expect(deriveStatus(needsExpiry, "ABC", null, TODAY)).toBe("pending");
  });

  it("expired when expiry is strictly before today (IST)", () => {
    expect(deriveStatus(optional, null, "2026-07-08", TODAY)).toBe("expired");
  });

  it("EDGE: expiry == today is still valid (not yet expired)", () => {
    expect(deriveStatus(optional, null, TODAY, TODAY)).toBe("valid");
  });

  it("EDGE: pending takes precedence over an already-past expiry", () => {
    // required number missing AND expiry past → still 'pending' (incomplete outranks expired here)
    expect(deriveStatus(needsNumber, null, "2020-01-01", TODAY)).toBe("pending");
  });
});

describe("document-rules: maskNumber", () => {
  it("masks Aadhaar to the last 4 in XXXX-XXXX-#### form", () => {
    expect(maskNumber("aadhaar", "1234 5678 9012")).toBe("XXXX-XXXX-9012");
    expect(maskNumber("aadhaar", "123456789012")).toBe("XXXX-XXXX-9012");
  });

  it("masks other numbers keeping the last 4", () => {
    // "ABCDE1234F" → 6 hidden chars + last 4 ("234F")
    expect(maskNumber("pan", "ABCDE1234F")).toBe("XXXXXX234F");
    expect(maskNumber("passport", "M1234567")).toBe("XXXX4567");
  });

  it("returns short numbers as-is and empty as null", () => {
    expect(maskNumber("other", "12")).toBe("12");
    expect(maskNumber("other", "")).toBeNull();
    expect(maskNumber("other", "   ")).toBeNull();
    expect(maskNumber("other", null)).toBeNull();
  });

  it("Aadhaar with no digits returns null", () => {
    expect(maskNumber("aadhaar", "----")).toBeNull();
  });
});
