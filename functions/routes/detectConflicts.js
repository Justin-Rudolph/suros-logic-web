const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const OpenAI = require("openai");
const { buildEstimatorSystemPrompt } = require("./lib/estimatorPrompt");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

const ALLOWED_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
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

const sanitizeConflictItem = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const conflict = String(item.conflict || "").trim();
  const severity = String(item.severity || "").trim().toLowerCase();
  const involvedTrades = Array.isArray(item.involvedTrades)
    ? Array.from(
        new Set(
          item.involvedTrades
            .map((entry) => String(entry || "").trim())
            .filter(Boolean)
        )
      )
    : [];
  const sourceSheets = Array.isArray(item.sourceSheets)
    ? Array.from(
        new Set(
          item.sourceSheets
            .map((entry) => String(entry || "").trim())
            .filter(Boolean)
        )
      )
    : [];

  if (!conflict || !ALLOWED_SEVERITIES.has(severity)) {
    return null;
  }

  return {
    conflict,
    involvedTrades,
    severity,
    sourceSheets,
  };
};

const generateConflictAnalysis = async (files, openAiApiKey) => {
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
Compare across the entire OCR-extracted plan set and detect meaningful cross-sheet or coordination
conflicts that could affect pricing, construction, trade coordination, materials, or change-
order exposure.

Focus on:
- MEP vs framing conflicts
- dimension mismatches
- missing supports, blocking, backing, openings, penetrations, or access
- schedule vs plan conflicts
- finish schedule vs room tag conflicts
- door/window schedule vs opening notes conflicts
- structural vs architectural conflicts
- revision conflicts

Additional task rules:
- Only return meaningful cross-sheet or coordination conflicts.
- Do not return generic warnings.
- Severity must be one of: "low", "medium", "high", "critical".
- sourceSheets should list relevant sheet numbers when available.
- If sheet numbers are unavailable, use an empty array.
- Do not invent sheet references.

Return exactly:
[
  {
    "conflict": "string",
    "involvedTrades": ["string"],
    "severity": "low" | "medium" | "high" | "critical",
    "sourceSheets": ["string"]
  }
]
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
    throw new Error(`Invalid JSON returned from AI conflict analysis: ${content || "empty response"}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("AI conflict analysis did not return an array");
  }

  return parsed.map(sanitizeConflictItem).filter(Boolean);
};

module.exports = async function detectConflictsHandler(req, res, openAiApiKey) {
  const projectId = String(req.body?.projectId || "").trim();

  try {
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        conflictStatus: "processing",
        conflictRequestedAt: FieldValue.serverTimestamp(),
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

    const conflicts = await generateConflictAnalysis(files, openAiApiKey);

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        conflicts,
        conflictStatus: "completed",
        conflictGeneratedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({
      projectId,
      conflicts,
    });
  } catch (error) {
    console.error("Conflict detection failed:", error);

    if (projectId) {
      await firestore.doc(`planProjects/${projectId}`).set(
        {
          conflictStatus: "failed",
          conflictGeneratedAt: FieldValue.serverTimestamp(),
          conflictError: error instanceof Error ? error.message : "Unknown error",
        },
        { merge: true }
      );
    }

    return res.status(500).json({
      error: "Failed to detect conflicts.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
