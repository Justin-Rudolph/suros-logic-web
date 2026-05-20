const DEV_PROJECT_ID = "suros-logic-dev";
const DEV_APP_BASE_URL = "https://dev.suroslogic.com";
const LOCAL_APP_BASE_URL = "http://localhost:5173";
const PROD_APP_BASE_URL = "https://suroslogic.com";

const getProjectId = () => {
  if (process.env.GCLOUD_PROJECT) {
    return process.env.GCLOUD_PROJECT;
  }

  if (process.env.GCP_PROJECT) {
    return process.env.GCP_PROJECT;
  }

  if (process.env.FIREBASE_CONFIG) {
    try {
      const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
      return firebaseConfig.projectId || "";
    } catch {
      return "";
    }
  }

  return "";
};

const isDevProject = () => getProjectId() === DEV_PROJECT_ID;

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const getAppBaseUrl = () => {
  if (process.env.APP_BASE_URL) {
    return trimTrailingSlash(process.env.APP_BASE_URL);
  }

  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return LOCAL_APP_BASE_URL;
  }

  return isDevProject() ? DEV_APP_BASE_URL : PROD_APP_BASE_URL;
};

const getEnvironmentValue = (name, fallbackNames = []) => {
  const names = [name, ...fallbackNames];
  for (const name of names) {
    const value = process.env[name];

    if (value) {
      return value;
    }
  }

  return "";
};

module.exports = {
  DEV_PROJECT_ID,
  getAppBaseUrl,
  getEnvironmentValue,
  getProjectId,
  isDevProject,
};
