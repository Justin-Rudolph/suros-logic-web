export const getFunctionsBaseUrl = () =>
  import.meta.env.DEV
    ? "http://127.0.0.1:5001/suros-logic/us-central1"
    : "https://us-central1-suros-logic.cloudfunctions.net";
