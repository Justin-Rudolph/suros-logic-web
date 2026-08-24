const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { sendEmail } = require("./lib/resend");

if (!admin.apps.length) {
  admin.initializeApp();
}

const NOTIFY_TO = "support@suroslogic.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]
  );

const trimmedString = (value) => (typeof value === "string" ? value.trim() : "");
const isNonEmptyWithinLimit = (value, maxLen) => value.length > 0 && value.length <= maxLen;
const isWithinLimit = (value, maxLen) => value.length <= maxLen;

/**
 * Handles a direct submission of the landing page's "Get More Info" form.
 * Validates the payload, writes the record to Firestore via the Admin SDK
 * (bypassing client security rules — this endpoint is the trusted writer),
 * and emails a notification. The email only ever fires as a result of this
 * endpoint being called, not as a side effect of the Firestore doc existing.
 */
module.exports = async function submitInquiryHandler(req, res) {
  const body = req.body || {};

  const firstName = trimmedString(body.firstName);
  const lastName = trimmedString(body.lastName);
  const email = trimmedString(body.email).toLowerCase();
  const companyName = trimmedString(body.companyName);
  const phone = trimmedString(body.phone);
  const website = trimmedString(body.website);
  const companyDescription = trimmedString(body.companyDescription);

  const missingFields = [
    !isNonEmptyWithinLimit(firstName, 200) && "First Name",
    !isNonEmptyWithinLimit(lastName, 200) && "Last Name",
    !email && "Email",
    !isNonEmptyWithinLimit(companyName, 200) && "Company Name",
  ].filter(Boolean);

  if (missingFields.length > 0) {
    const verb = missingFields.length === 1 ? "is" : "are";
    return res.status(400).json({ error: `${missingFields.join(", ")} ${verb} required.` });
  }

  if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  if (!isWithinLimit(phone, 40) || !isWithinLimit(website, 300) || !isWithinLimit(companyDescription, 2000)) {
    return res.status(400).json({ error: "One of the fields is too long." });
  }

  const inquiry = {
    firstName,
    lastName,
    email,
    companyName,
    ...(phone && { phone }),
    ...(website && { website }),
    ...(companyDescription && { companyDescription }),
    createdAt: FieldValue.serverTimestamp(),
  };

  try {
    await admin.firestore().collection("inquiries").add(inquiry);
  } catch (error) {
    console.error("Failed to save inquiry:", error);
    return res.status(500).json({ error: "Unable to submit your info right now. Please try again." });
  }

  const rows = [
    ["Name", `${firstName} ${lastName}`],
    ["Email", email],
    ["Phone", phone],
    ["Company", companyName],
    ["Website", website],
    ["Description", companyDescription],
  ].filter(([, value]) => value);

  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 12px 6px 0; font-weight:600; vertical-align:top; white-space:nowrap;">${escapeHtml(label)}</td>
          <td style="padding:6px 0; vertical-align:top;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");

  try {
    await sendEmail({
      to: NOTIFY_TO,
      from: "Suros Logic Support <support@suroslogic.com>",
      subject: `New website inquiry from ${firstName} ${lastName}`,
      html: `
        <div style="font-family: Arial; padding: 20px;">
          <h2>New "Get More Info" inquiry</h2>
          <p>Someone submitted the inquiry form on the website.</p>
          <table style="border-collapse: collapse; margin-top: 12px;">
            ${rowsHtml}
          </table>
        </div>
      `,
    });
  } catch (error) {
    // The inquiry is already saved — a notification hiccup shouldn't fail the request.
    console.error("Failed to send new-inquiry notification email:", error);
  }

  return res.json({ success: true });
};
