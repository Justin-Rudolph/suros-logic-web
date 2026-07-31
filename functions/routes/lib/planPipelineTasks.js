const { CloudTasksClient } = require("@google-cloud/tasks");

// Constructed lazily so the emulator path never needs Cloud Tasks credentials.
let client;
const getClient = () => {
  if (!client) client = new CloudTasksClient();
  return client;
};

/** Firebase sets this to "true" inside the functions emulator. */
const isEmulated = () => process.env.FUNCTIONS_EMULATOR === "true";

/**
 * Dispatch the next plan-analysis pipeline step.
 *
 * In production this goes through Cloud Tasks, which gives retries and keeps
 * each step in its own request.
 *
 * Under the emulator it cannot: Cloud Tasks is a hosted service with no route
 * back to 127.0.0.1, so a queued task invokes the DEPLOYED
 * runPlanPipelineStep instead. That silently splits a local run across two
 * codebases — upload handled locally, analysis handled by whatever happens to
 * be deployed — which makes the pipeline impossible to test offline and lets
 * stale deployed code write to real data. So locally we call the emulator's
 * own endpoint directly.
 */
const enqueuePipelineStep = async (projectId) => {
  const project = process.env.GCLOUD_PROJECT || "suros-logic";

  if (isEmulated()) {
    // Default functions-emulator port; firebase.json declares no override.
    const port = process.env.FUNCTIONS_EMULATOR_PORT || "5001";
    const url = `http://127.0.0.1:${port}/${project}/us-central1/runPlanPipelineStep`;

    // Deliberately NOT awaited. Each step enqueues the next, so awaiting here
    // would collapse the whole chain into one nested request and blow the
    // timeout. Cloud Tasks is fire-and-forget in production and this mirrors
    // it. Safe under the emulator, whose process outlives the response; it
    // would NOT be safe in a real Cloud Functions instance, which can be
    // frozen once the handler returns.
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    }).catch((err) => {
      console.error(`[pipeline] local dispatch failed for ${projectId}:`, err);
    });

    console.log(`[pipeline] dispatched ${projectId} to local emulator at ${url}`);
    return;
  }

  const queue = `projects/${project}/locations/us-central1/queues/plan-pipeline`;
  const url = `https://us-central1-${project}.cloudfunctions.net/runPlanPipelineStep`;
  const serviceAccountEmail = `plan-pipeline-invoker@${project}.iam.gserviceaccount.com`;

  await getClient().createTask({
    parent: queue,
    task: {
      httpRequest: {
        httpMethod: "POST",
        url,
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify({ projectId })).toString("base64"),
        oidcToken: { serviceAccountEmail },
      },
    },
  });
};

module.exports = { enqueuePipelineStep, isEmulated };
