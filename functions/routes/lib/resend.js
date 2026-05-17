const RESEND_EMAILS_URL = "https://api.resend.com/emails";

const getResendApiKey = () => {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    throw new Error("Missing Resend API key");
  }

  return key;
};

const sendEmail = async ({ to, from, subject, html }) => {
  const response = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getResendApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend email failed with ${response.status}: ${body}`);
  }

  return response.json();
};

module.exports = {
  sendEmail,
};
