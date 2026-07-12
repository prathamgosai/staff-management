import { renderMessage } from "./notification.messages";

/**
 * The document-expiry reminder copy (batch: document-expiry reminders). Both variants are
 * IN-APP / EMAIL ONLY — waTemplate must stay null so a document reminder is never sent over
 * WhatsApp even when the channel is enabled (there is no approved WA template for it).
 */
describe("renderMessage — document_expiring", () => {
  it("renders the staff-facing self reminder (no WhatsApp template)", () => {
    const m = renderMessage("document_expiring_self", { typeName: "Aadhaar", expiresOn: "2026-08-01" });
    expect(m.title).toBe("Document expiring soon");
    expect(m.body).toContain("Aadhaar");
    expect(m.body).toContain("2026-08-01");
    expect(m.waTemplate).toBeNull();
    expect(m.waVars).toEqual([]);
  });

  it("renders the outlet-head variant with the staff name + outlet", () => {
    const m = renderMessage("document_expiring_head", {
      typeName: "Visa", expiresOn: "2026-08-10", staffName: "Asha", outletName: "Capiche Vesu",
    });
    expect(m.title).toBe("Staff document expiring");
    expect(m.body).toContain("Asha");
    expect(m.body).toContain("Visa");
    expect(m.body).toContain("Capiche Vesu");
    expect(m.body).toContain("2026-08-10");
    expect(m.waTemplate).toBeNull();
  });

  it("falls back gracefully when optional context is missing", () => {
    const m = renderMessage("document_expiring_head", { typeName: "PAN", expiresOn: "2026-09-01" });
    expect(m.body).toContain("A staff member");
    expect(m.body).toContain("your outlet");
  });
});
