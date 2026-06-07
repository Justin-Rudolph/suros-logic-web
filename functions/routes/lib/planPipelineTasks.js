const { CloudTasksClient } = require("@google-cloud/tasks");

const client = new CloudTasksClient();

const enqueuePipelineStep = async (projectId) => {
  const project = process.env.GCLOUD_PROJECT || "suros-logic";
  const queue = `projects/${project}/locations/us-central1/queues/plan-pipeline`;
  const url = `https://us-central1-${project}.cloudfunctions.net/runPlanPipelineStep`;
  const serviceAccountEmail = `plan-pipeline-invoker@${project}.iam.gserviceaccount.com`;

  await client.createTask({
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

module.exports = { enqueuePipelineStep };
