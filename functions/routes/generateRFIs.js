const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const OpenAI = require("openai");
const { buildEstimatorSystemPrompt } = require("./lib/estimatorPrompt");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

const MAX_PLAN_CONTEXT_LENGTH = 120000;

const normalizeWhitespace = (value) =>
  String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const buildPlanContext = (files) => {
  const sections = files.map((file) => {
    const headerParts = [
      file.fileName ? `FILE: ${file.fileName}` : null,
      file.detectedSheetNumber ? `SHEET: ${file.detectedSheetNumber}` : null,
      file.detectedTitle ? `TITLE: ${file.detectedTitle}` : null,
      file.discipline ? `DISCIPLINE: ${file.discipline}` : null,
      file.revisionDate ? `REVISION DATE: ${file.revisionDate}` : null,
    ].filter(Boolean);

    return `${headerParts.join(" | ")}\n${normalizeWhitespace(file.rawText || "")}`.trim();
  });

  return sections.join("\n\n====================\n\n").slice(0, MAX_PLAN_CONTEXT_LENGTH);
};

const sanitizeStringList = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  );
};

const generateRfiPackage = async (files, openAiApiKey) => {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }

  const planContext = buildPlanContext(files);
  if (!planContext) {
    throw new Error("No extracted plan text is available for this project");
  }

  const openai = new OpenAI({ apiKey: openAiApiKey });

  const completion = await openai.chat.completions.create({
    model: "gpt-5",
    reasoning_effort: "medium",
    messages: [
      {
        role: "system",
        content: buildEstimatorSystemPrompt(`
Review the OCR-extracted plan text before bid submission and identify missing information, unclear
assemblies, incomplete details, and coordination risks that should affect bid qualifications.

Additional task rules:
- Each array must contain plain strings only.
- RFIs should be written like concise preconstruction or bid RFIs.
- assumptions should be reasonable estimator assumptions caused by incomplete plans.
- estimatorQuestions should be internal questions the estimator should resolve before final pricing.
- contingencyNotes should capture pricing or scope-risk qualifiers tied to missing, unclear, or unsupported information.
- Focus on genuine plan gaps, not generic boilerplate.
- Do not include assumptions that contradict the plans.
- Do not create RFIs for items already clearly answered in the extracted text.

Return exactly this JSON shape:
{
  "rfis": [],
  "assumptions": [],
  "estimatorQuestions": [],
  "contingencyNotes": []
}
        `),
      },
      {
        role: "user",
        content: planContext,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON returned from AI RFI generation: ${content || "empty response"}`);
  }

  return {
    rfis: sanitizeStringList(parsed?.rfis),
    assumptions: sanitizeStringList(parsed?.assumptions),
    estimatorQuestions: sanitizeStringList(parsed?.estimatorQuestions),
    contingencyNotes: sanitizeStringList(parsed?.contingencyNotes),
  };
};

module.exports = async function generateRFIsHandler(req, res, openAiApiKey) {
  const projectId = String(req.body?.projectId || "").trim();

  try {
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        rfiStatus: "processing",
        rfiRequestedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const fileSnapshot = await firestore.collection(`planProjects/${projectId}/files`).get();
    if (fileSnapshot.empty) {
      return res.status(404).json({
        error: "No analyzed plan files found for this project.",
      });
    }

    const files = fileSnapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      .filter((file) => typeof file.rawText === "string" && normalizeWhitespace(file.rawText).length > 0)
      .sort((left, right) => {
        const leftSheet = String(left.detectedSheetNumber || "");
        const rightSheet = String(right.detectedSheetNumber || "");
        return leftSheet.localeCompare(rightSheet) || String(left.fileName || "").localeCompare(String(right.fileName || ""));
      });

    if (!files.length) {
      return res.status(400).json({
        error: "Analyzed files exist, but no extracted plan text is available.",
      });
    }

    const rfiPackage = await generateRfiPackage(files, openAiApiKey);

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        ...rfiPackage,
        rfiStatus: "completed",
        rfiGeneratedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({
      projectId,
      ...rfiPackage,
    });
  } catch (error) {
    console.error("RFI generation failed:", error);

    if (projectId) {
      await firestore.doc(`planProjects/${projectId}`).set(
        {
          rfiStatus: "failed",
          rfiGeneratedAt: FieldValue.serverTimestamp(),
          rfiError: error instanceof Error ? error.message : "Unknown error",
        },
        { merge: true }
      );
    }

    return res.status(500).json({
      error: "Failed to generate RFIs.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
