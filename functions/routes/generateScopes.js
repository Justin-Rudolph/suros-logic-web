const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const OpenAI = require("openai");
const { buildEstimatorSystemPrompt } = require("./lib/estimatorPrompt");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

const TRADE_KEYS = [
  "demo",
  "framing",
  "drywall",
  "flooring",
  "doors/windows",
  "paint",
  "plumbing",
  "electrical",
  "HVAC",
  "concrete/masonry",
  "roofing",
  "specialty/site",
];

const ALLOWED_CLASSIFICATIONS = new Set(["confirmed", "inferred", "unknown"]);
const MAX_PROJECT_CONTEXT_LENGTH = 120000;

const normalizeWhitespace = (value) =>
  String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const sanitizeScopeItem = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const title = String(item.title || "").trim();
  const description = String(item.description || "").trim();
  const classification = String(item.classification || "").trim();
  const materialCategories = Array.isArray(item.materialCategories)
    ? Array.from(
        new Set(
          item.materialCategories
            .map((entry) => String(entry || "").trim())
            .filter(Boolean)
        )
      )
    : [];

  if (!title || !description || !ALLOWED_CLASSIFICATIONS.has(classification)) {
    return null;
  }

  return {
    title,
    description,
    materialCategories,
    classification,
  };
};

const buildProjectContext = (files) => {
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

  return sections.join("\n\n====================\n\n").slice(0, MAX_PROJECT_CONTEXT_LENGTH);
};

const getTradeScopeTemplate = () =>
  TRADE_KEYS.reduce((acc, trade) => {
    acc[trade] = [];
    return acc;
  }, {});

const generateTradeScopesFromPlans = async (files, openAiApiKey) => {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }

  const combinedContext = buildProjectContext(files);
  if (!combinedContext) {
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
Review the combined OCR-extracted construction plan text and generate trade scopes 
written the way a contractor would prepare bid scope notes.

Additional task rules:
- Use these exact top-level trade keys only:
  "demo"
  "framing"
  "drywall"
  "flooring"
  "doors/windows"
  "paint"
  "plumbing"
  "electrical"
  "HVAC"
  "concrete/masonry"
  "roofing"
  "specialty/site"
- Each trade value must be an array.
- If a trade has no meaningful supported scope, return an empty array for that trade.
- Keep scope descriptions concise, contractor-style, and bid-ready.
- Do not include pricing, labor hours, markup, schedule duration, or unsupported means and methods.
- Do not duplicate the same work under multiple trades.
- Assign each scope item to the most responsible primary trade.
- Include materials only as broad material categories, not exact quantities.
- Use classification carefully:
  confirmed = directly supported by extracted text.
  inferred = reasonable scope implication, but not directly stated.
  unknown = scope appears possible but is not sufficiently supported.
- Each item must be:
  {
    "title": "short scope title",
    "description": "contractor-style scope description",
    "materialCategories": ["string"],
    "classification": "confirmed" | "inferred" | "unknown"
  }

Return exactly this shape:
{
  "demo": [],
  "framing": [],
  "drywall": [],
  "flooring": [],
  "doors/windows": [],
  "paint": [],
  "plumbing": [],
  "electrical": [],
  "HVAC": [],
  "concrete/masonry": [],
  "roofing": [],
  "specialty/site": []
}
        `),
      },
      {
        role: "user",
        content: combinedContext,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON returned from AI scope generation: ${content || "empty response"}`);
  }

  const scopes = getTradeScopeTemplate();

  TRADE_KEYS.forEach((trade) => {
    const items = Array.isArray(parsed?.[trade]) ? parsed[trade] : [];
    scopes[trade] = items
      .map(sanitizeScopeItem)
      .filter(Boolean);
  });

  return scopes;
};

module.exports = async function generateScopesHandler(req, res, openAiApiKey) {
  const projectId = String(req.body?.projectId || "").trim();

  try {
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        scopeGenerationStatus: "processing",
        scopesRequestedAt: FieldValue.serverTimestamp(),
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

    const scopes = await generateTradeScopesFromPlans(files, openAiApiKey);

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        scopes,
        scopeGenerationStatus: "completed",
        scopesGeneratedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({
      projectId,
      scopes,
    });
  } catch (error) {
    console.error("Scope generation failed:", error);

    if (projectId) {
      await firestore.doc(`planProjects/${projectId}`).set(
        {
          scopeGenerationStatus: "failed",
          scopesGeneratedAt: FieldValue.serverTimestamp(),
          scopeGenerationError: error instanceof Error ? error.message : "Unknown error",
        },
        { merge: true }
      );
    }

    return res.status(500).json({
      error: "Failed to generate scopes.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
