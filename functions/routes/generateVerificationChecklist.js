const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const OpenAI = require("openai");
const { buildEstimatorSystemPrompt } = require("./lib/estimatorPrompt");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

const ALLOWED_CATEGORIES = new Set([
  "dimensions",
  "structure",
  "MEP_conflict",
  "access",
  "existing_conditions",
]);

const MAX_PLAN_CONTEXT_LENGTH = 100000;
const MAX_SCOPE_CONTEXT_LENGTH = 40000;

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
    ].filter(Boolean);

    return `${headerParts.join(" | ")}\n${normalizeWhitespace(file.rawText || "")}`.trim();
  });

  return sections.join("\n\n====================\n\n").slice(0, MAX_PLAN_CONTEXT_LENGTH);
};

const buildScopeContext = (scopes) => {
  if (!scopes || typeof scopes !== "object") {
    return "";
  }

  const sections = Object.entries(scopes).map(([trade, items]) => {
    const normalizedItems = Array.isArray(items) ? items : [];
    const lines = normalizedItems.map((item) => {
      const title = String(item?.title || "").trim();
      const description = String(item?.description || "").trim();
      const classification = String(item?.classification || "").trim();
      return `- ${title}${classification ? ` [${classification}]` : ""}: ${description}`;
    });

    return `TRADE: ${trade}\n${lines.join("\n")}`.trim();
  });

  return sections.join("\n\n").slice(0, MAX_SCOPE_CONTEXT_LENGTH);
};

const sanitizeChecklistItem = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const checklistItem = String(item.item || "").trim();
  const reason = String(item.reason || "").trim();
  const category = String(item.category || "").trim();

  if (!checklistItem || !reason || !ALLOWED_CATEGORIES.has(category)) {
    return null;
  }

  return {
    item: checklistItem,
    reason,
    category,
  };
};

const generateChecklist = async (files, scopes, openAiApiKey) => {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }

  const planContext = buildPlanContext(files);
  const scopeContext = buildScopeContext(scopes);

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
Review the OCR-extracted plan text and generated project scopes. Identify what
should be field-verified before pricing, ordering material, or committing to scope.

Additional task rules:
- Return only issues that genuinely require site verification or coordination confirmation.
- Be specific and practical.
- Do not repeat obvious plan notes unless they create field risk.
- Include dimensions, existing conditions, access, structural tie-ins, rough-in locations, substrate conditions when relevant.
- Prefer concise, actionable checklist items.
- Do not include generic construction reminders.

Allowed categories:
- "dimensions"
- "structure"
- "MEP_conflict"
- "access"
- "existing_conditions"

Return exactly:
[
  {
    "item": "string",
    "reason": "string",
    "category": "dimensions" | "structure" | "MEP_conflict" | "access" | "existing_conditions"
  }
]
        `),
      },
      {
        role: "user",
        content: `
PLAN TEXT:
${planContext}

SCOPES:
${scopeContext || "No generated scopes available."}
        `.trim(),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON returned from AI verification generation: ${content || "empty response"}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("AI verification checklist did not return an array");
  }

  return parsed.map(sanitizeChecklistItem).filter(Boolean);
};

module.exports = async function generateVerificationChecklistHandler(req, res, openAiApiKey) {
  const projectId = String(req.body?.projectId || "").trim();

  try {
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        verificationStatus: "processing",
        verificationRequestedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const [projectSnap, fileSnapshot] = await Promise.all([
      firestore.doc(`planProjects/${projectId}`).get(),
      firestore.collection(`planProjects/${projectId}/files`).get(),
    ]);

    if (!projectSnap.exists) {
      return res.status(404).json({ error: "Project not found." });
    }

    if (fileSnapshot.empty) {
      return res.status(404).json({
        error: "No analyzed plan files found for this project.",
      });
    }

    const projectData = projectSnap.data() || {};
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

    const verification = await generateChecklist(files, projectData.scopes || {}, openAiApiKey);

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        verification,
        verificationStatus: "completed",
        verificationGeneratedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({
      projectId,
      verification,
    });
  } catch (error) {
    console.error("Verification checklist generation failed:", error);

    if (projectId) {
      await firestore.doc(`planProjects/${projectId}`).set(
        {
          verificationStatus: "failed",
          verificationGeneratedAt: FieldValue.serverTimestamp(),
          verificationError: error instanceof Error ? error.message : "Unknown error",
        },
        { merge: true }
      );
    }

    return res.status(500).json({
      error: "Failed to generate verification checklist.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
