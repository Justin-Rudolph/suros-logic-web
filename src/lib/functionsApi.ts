const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const getFunctionsBaseUrl = () => {
  const configuredBaseUrl = import.meta.env.VITE_FUNCTIONS_BASE_URL;

  if (configuredBaseUrl) {
    return trimTrailingSlash(configuredBaseUrl);
  }

  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "suros-logic";

  return import.meta.env.DEV
    ? `http://127.0.0.1:5001/${projectId}/us-central1`
    : `https://us-central1-${projectId}.cloudfunctions.net`;
};
