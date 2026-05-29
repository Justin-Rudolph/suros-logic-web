const parseCsv = (value: string | undefined) =>
  (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const configuredDevHosts = parseCsv(import.meta.env.VITE_DEV_ACCESS_HOSTS);
const protectedDevHosts = Array.from(new Set(configuredDevHosts));

export const allowedDevAccessEmails = parseCsv(
  import.meta.env.VITE_DEV_ACCESS_ALLOWED_EMAILS
).map((email) => email.toLowerCase());

export const publicDevAccessPaths = new Set([
  "/",
  "/auth",
  "/forgot-password",
  "/privacy",
  "/terms",
]);

export const isProtectedDevHost = () =>
  typeof window !== "undefined" &&
  protectedDevHosts.includes(window.location.hostname);
