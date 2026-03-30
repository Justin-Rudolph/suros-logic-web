const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

if (!admin.apps.length) {
  admin.initializeApp();
}

const app = express();
app.use(cors());
app.use(express.json());

let sendgridInitialized = false;

const getSendGrid = () => {
  if (!sendgridInitialized) {
    const key = process.env.SENDGRID_API_KEY;

    if (!key || !key.startsWith("SG.")) {
      console.error("❌ Invalid SendGrid API key:", key);
      throw new Error("Invalid SendGrid API key");
    }

    sgMail.setApiKey(key);
    sendgridInitialized = true;
  }

  return sgMail;
};

const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

const BASE_URL = isEmulator
  ? "http://localhost:5173"
  : "https://suroslogic.com";

const sendPasswordResetEmail = async (toEmail, resetLink) => {
  const msg = {
    to: toEmail,
    from: {
      email: "support@suroslogic.com",
      name: "Suros Logic Support",
    },
    subject: "Reset your password - Suros Logic",
    html: `
      <div style="font-family: Arial; padding: 20px;">
        <h2>Reset your Suros Logic password</h2>
        <p>We received a request to reset your password.</p>
        <p>Click below to choose a new password:</p>
        <a href="${resetLink}"
           style="
             display:inline-block;
             padding:12px 20px;
             background:#1e73be;
             color:white;
             text-decoration:none;
             border-radius:6px;
             margin-top:10px;
           ">
          Reset Password
        </a>
        <p style="margin-top:20px;">If you didn’t request this, you can safely ignore this email.</p>
      </div>
    `,
  };

  await getSendGrid().send(msg);
};

app.post("/forgot-password", async (req, res) => {
  const email = typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase()
    : "";

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    await admin.auth().getUserByEmail(email);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";

    if (code === "auth/user-not-found") {
      return res.json({
        message: "If that account exists, a password reset email has been sent.",
      });
    }

    console.error("Lookup user by email failed:", error);
    return res.status(500).json({ error: "Unable to process password reset." });
  }

  try {
    const resetLink = await admin.auth().generatePasswordResetLink(email, {
      url: `${BASE_URL}/auth`,
      handleCodeInApp: false,
    });

    await sendPasswordResetEmail(email, resetLink);

    return res.json({
      message: "If that account exists, a password reset email has been sent.",
    });
  } catch (error) {
    console.error("Password reset email failed:", error);
    return res.status(500).json({ error: "Unable to send password reset email." });
  }
});

module.exports = { app };
