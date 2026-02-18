const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const cors = require("cors");
const { defineSecret } = require("firebase-functions/params");

const generateEstimateHandler = require("./routes/generateEstimate");

setGlobalOptions({ maxInstances: 10 });

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

exports.generateEstimate = onRequest(
  { secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    cors({ origin: true })(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      await generateEstimateHandler(
        req,
        res,
        OPENAI_API_KEY.value()
      );
    });
  }
);
