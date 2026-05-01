const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const OpenAI = require("openai");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const { buildEstimatorSystemPrompt } = require("./lib/estimatorPrompt");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

const DISCIPLINE_CODES = ["A", "S", "M", "E", "P", "C", "L", "T", "F", "FP", "R", "I", "G"];
const MAX_TEXT_LENGTH = 50000;
const MAX_PROJECT_CONTEXT_LENGTH = 120000;
const MIN_PDF_TEXT_LENGTH = 80;
const MIN_IMAGE_TEXT_LENGTH = 80;

const normalizeWhitespace = (value) =>
  String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const getFileNameFromUrl = (fileUrl, index) => {
  try {
    const parsedUrl = new URL(fileUrl);
    const lastSegment = parsedUrl.pathname.split("/").filter(Boolean).pop() || "";
    const decoded = decodeURIComponent(lastSegment);
    return decoded || `file-${index + 1}`;
  } catch (error) {
    return `file-${index + 1}`;
  }
};

const sanitizeFileIdPart = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const detectFileKind = (fileName, contentType) => {
  const normalizedName = String(fileName || "").toLowerCase();
  const normalizedType = String(contentType || "").toLowerCase();

  if (normalizedType.includes("pdf") || normalizedName.endsWith(".pdf")) {
    return "pdf";
  }

  if (normalizedType.startsWith("image/")) {
    return "image";
  }

  if (/\.(png|jpe?g|webp|bmp|tif|tiff|heic|heif)$/i.test(normalizedName)) {
    return "image";
  }

  return "unknown";
};

const extractLines = (rawText) =>
  normalizeWhitespace(rawText)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

const parseDate = (value) => {
  const cleaned = String(value || "").trim();
  if (!cleaned) return null;

  const directDate = new Date(cleaned);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toISOString().slice(0, 10);
  }

  const monthDayYearMatch = cleaned.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (monthDayYearMatch) {
    const [, month, day, year] = monthDayYearMatch;
    const normalizedYear = year.length === 2 ? `20${year}` : year;
    const built = new Date(`${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    if (!Number.isNaN(built.getTime())) {
      return built.toISOString().slice(0, 10);
    }
  }

  return cleaned;
};

const pickBestCandidate = (candidates) => {
  const filtered = candidates.filter((candidate) => candidate && candidate.value);
  if (!filtered.length) return null;

  filtered.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.value.length - right.value.length;
  });

  return filtered[0].value;
};

const detectSheetNumber = (lines, rawText) => {
  const candidates = [];
  const patterns = [
    /\b(?:sheet(?: number| no\.?)?|drawing(?: number| no\.?)?|dwg(?: number| no\.?)?)[:#\s-]*([A-Z]{1,3}[-.]?\d{1,4}(?:\.\d{1,3})?(?:[A-Z0-9-]+)?)\b/gi,
    /\b([A-Z]{1,3}[-.]?\d{1,4}(?:\.\d{1,3})?)\b/g,
  ];

  lines.slice(0, 20).forEach((line, index) => {
    patterns.forEach((pattern, patternIndex) => {
      const matches = line.matchAll(pattern);
      for (const match of matches) {
        const value = String(match[1] || match[0] || "").replace(/\s+/g, "").toUpperCase();
        if (!/[A-Z]/.test(value) || !/\d/.test(value)) continue;

        candidates.push({
          value,
          score: 120 - index * 3 - patternIndex * 10,
        });
      }
    });
  });

  if (!candidates.length) {
    const match = rawText.match(/\b([A-Z]{1,3}[-.]?\d{1,4}(?:\.\d{1,3})?)\b/);
    if (match) {
      candidates.push({ value: match[1].replace(/\s+/g, "").toUpperCase(), score: 40 });
    }
  }

  return pickBestCandidate(candidates);
};

const detectTitle = (lines, detectedSheetNumber) => {
  const skipPatterns = [
    /^sheet\b/i,
    /^drawing\b/i,
    /^project\b/i,
    /^scale\b/i,
    /^date\b/i,
    /^rev(?:ision)?\b/i,
  ];

  const candidates = lines
    .slice(0, 30)
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.length >= 5 && line.length <= 120)
    .filter(({ line }) => !skipPatterns.some((pattern) => pattern.test(line)))
    .filter(({ line }) => !detectedSheetNumber || !line.includes(detectedSheetNumber))
    .map(({ line, index }) => ({
      value: line,
      score:
        (line === line.toUpperCase() ? 40 : 0) +
        (/\b(plan|details?|elevation|sections?|schedule|notes?|layout|roof|foundation|mechanical|electrical|plumbing|architectural|structural)\b/i.test(line) ? 40 : 0) +
        Math.max(0, 35 - index * 2),
    }));

  return pickBestCandidate(candidates);
};

const detectDiscipline = (detectedSheetNumber, detectedTitle, rawText) => {
  const sheetPrefixMatch = String(detectedSheetNumber || "").match(/^([A-Z]{1,3})[-.]?\d/i);
  if (sheetPrefixMatch) {
    const prefix = sheetPrefixMatch[1].toUpperCase();
    if (DISCIPLINE_CODES.includes(prefix)) {
      return prefix;
    }
    if (prefix.length > 1 && DISCIPLINE_CODES.includes(prefix[0])) {
      return prefix[0];
    }
  }

  const lookupText = `${detectedTitle || ""}\n${rawText || ""}`.toUpperCase();
  const keywordMap = [
    { code: "A", pattern: /\bARCHITECT|FLOOR PLAN|REFLECTED CEILING|ELEVATION\b/ },
    { code: "S", pattern: /\bSTRUCTURAL|FOUNDATION|FRAMING\b/ },
    { code: "M", pattern: /\bMECHANICAL|HVAC|DUCT\b/ },
    { code: "E", pattern: /\bELECTRICAL|LIGHTING|POWER\b/ },
    { code: "P", pattern: /\bPLUMBING|SANITARY|WATER\b/ },
    { code: "C", pattern: /\bCIVIL|GRADING|SITE PLAN\b/ },
    { code: "FP", pattern: /\bFIRE PROTECTION|SPRINKLER\b/ },
  ];

  const match = keywordMap.find(({ pattern }) => pattern.test(lookupText));
  return match ? match.code : null;
};

const detectRevisionDate = (lines, rawText) => {
  const labeledPatterns = [
    /\brev(?:ision)?(?: date)?[:\s-]*([0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4}|[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i,
    /\bissued(?: for [a-z ]+)?[:\s-]*([0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4}|[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i,
    /\bdate[:\s-]*([0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4}|[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i,
  ];

  for (const line of lines.slice(0, 25)) {
    for (const pattern of labeledPatterns) {
      const match = line.match(pattern);
      if (match) {
        return parseDate(match[1]);
      }
    }
  }

  const anyDateMatch = rawText.match(/\b([0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4}|[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})\b/);
  return anyDateMatch ? parseDate(anyDateMatch[1]) : null;
};

const parseSheetKey = (sheetNumber) => {
  const normalized = String(sheetNumber || "").trim().toUpperCase();
  const match = normalized.match(/^([A-Z]{1,3})[-.]?(\d{1,4})(?:\.(\d{1,3}))?/);
  if (!match) return null;

  return {
    discipline: match[1],
    major: Number(match[2]),
    minor: match[3] ? Number(match[3]) : 0,
    normalized,
  };
};

const detectProjectIssues = (files) => {
  const duplicateSheets = [];
  const conflictingRevisions = [];
  const missingSheetNumbers = [];

  const bySheetNumber = new Map();
  const byDiscipline = new Map();

  files.forEach((file) => {
    if (file.detectedSheetNumber) {
      const normalizedSheetNumber = String(file.detectedSheetNumber).toUpperCase();
      const sheetGroup = bySheetNumber.get(normalizedSheetNumber) || [];
      sheetGroup.push(file);
      bySheetNumber.set(normalizedSheetNumber, sheetGroup);

      const parsed = parseSheetKey(normalizedSheetNumber);
      if (parsed) {
        const disciplineGroup = byDiscipline.get(parsed.discipline) || [];
        disciplineGroup.push(parsed);
        byDiscipline.set(parsed.discipline, disciplineGroup);
      }
    }
  });

  bySheetNumber.forEach((group, sheetNumber) => {
    if (group.length > 1) {
      duplicateSheets.push({
        sheetNumber,
        fileNames: group.map((entry) => entry.fileName),
      });
    }

    const revisionDates = Array.from(
      new Set(
        group
          .map((entry) => entry.revisionDate)
          .filter(Boolean)
      )
    );

    if (revisionDates.length > 1) {
      conflictingRevisions.push({
        sheetNumber,
        revisions: revisionDates,
        fileNames: group.map((entry) => entry.fileName),
      });
    }
  });

  byDiscipline.forEach((entries, discipline) => {
    const uniqueNumbers = Array.from(new Set(entries.map((entry) => entry.major))).sort((a, b) => a - b);
    if (uniqueNumbers.length < 2) return;

    for (let index = 1; index < uniqueNumbers.length; index += 1) {
      const previous = uniqueNumbers[index - 1];
      const current = uniqueNumbers[index];

      if (current - previous <= 1) continue;

      for (let missing = previous + 1; missing < current; missing += 1) {
        missingSheetNumbers.push(`${discipline}${missing}`);
      }
    }
  });

  return {
    duplicateSheets,
    conflictingRevisions,
    missingSheetNumbers,
  };
};

const downloadFile = async (fileUrl) => {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Unable to download file: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || "",
  };
};

const extractPdfText = async (buffer) => {
  const parsed = await pdfParse(buffer);
  return normalizeWhitespace(parsed?.text || "");
};

const extractImageText = async (buffer) => {
  const result = await Tesseract.recognize(buffer, "eng");
  return normalizeWhitespace(result?.data?.text || "");
};

const buildProjectContext = (files) => {
  const sections = files.map((file) => {
    const headerParts = [
      `FILE: ${file.fileName}`,
      file.detectedSheetNumber ? `SHEET: ${file.detectedSheetNumber}` : null,
      file.detectedTitle ? `TITLE: ${file.detectedTitle}` : null,
      file.discipline ? `DISCIPLINE: ${file.discipline}` : null,
      file.revisionDate ? `REVISION DATE: ${file.revisionDate}` : null,
    ].filter(Boolean);

    return `${headerParts.join(" | ")}\n${file.rawText || ""}`.trim();
  });

  return sections.join("\n\n====================\n\n").slice(0, MAX_PROJECT_CONTEXT_LENGTH);
};

const summarizeProjectFromPlans = async (files, openAiApiKey) => {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }

  const combinedContext = buildProjectContext(files);
  const openai = new OpenAI({ apiKey: openAiApiKey });

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    reasoning_effort: "medium",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "plan_project_summary",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            projectType: {
              type: "string",
            },
            affectedAreas: {
              type: "array",
              items: {
                type: "string",
              },
            },
            summary: {
              type: "string",
            },
          },
          required: ["projectType", "affectedAreas", "summary"],
        },
      },
    },
    messages: [
      {
        role: "system",
        content: buildEstimatorSystemPrompt(`
Infer the likely project type from the combined sheets, identify the affected rooms/zones/site areas, 
and write a high-level scope summary that sounds like a contractor's understanding of the work.

Additional task rules:
- Use the combined context from all sheets together.
- Think in terms of scope, affected areas, trades, job intent, and likely construction category.
- Do not summarize sheet metadata.
- If the exact project type is unclear, choose the best-supported category such as remodel, addition, 
  tenant improvement, new construction, repair, site work, exterior improvement, interior finish-out, or unknown.
- affectedAreas must be a deduplicated array of concise area names.
- summary should be 3 to 6 sentences and reflect the overall work, not sheet metadata.
- Do not describe anything as confirmed unless supported by the provided extracted text.

Return exactly:
{
  "projectType": "string",
  "affectedAreas": ["Area 1", "Area 2"],
  "summary": "string"
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
    throw new Error(`Invalid JSON returned from AI project analysis: ${content || "empty response"}`);
  }

  const projectType = String(parsed?.projectType || "").trim();
  const affectedAreas = Array.isArray(parsed?.affectedAreas)
    ? Array.from(
        new Set(
          parsed.affectedAreas
            .map((entry) => String(entry || "").trim())
            .filter(Boolean)
        )
      )
    : [];
  const summary = String(parsed?.summary || "").trim();

  if (!projectType || !summary) {
    throw new Error("AI project analysis did not return required fields");
  }

  return {
    projectType,
    affectedAreas,
    summary,
  };
};

const analyzeSingleFile = async (fileUrl, index) => {
  const { buffer, contentType } = await downloadFile(fileUrl);
  const fileName = getFileNameFromUrl(fileUrl, index);
  const fileKind = detectFileKind(fileName, contentType);

  let rawText = "";

  if (fileKind === "pdf") {
    rawText = await extractPdfText(buffer);
    if (rawText.length < MIN_PDF_TEXT_LENGTH) {
      throw new Error(
        "Text could not be extracted from this PDF. It is likely a scanned or image-based PDF, which this analyzer does not support."
      );
    }
  } else if (fileKind === "image") {
    rawText = await extractImageText(buffer);
    if (rawText.length < MIN_IMAGE_TEXT_LENGTH) {
      throw new Error(
        "Text could not be extracted from this image. Please upload a clearer file with readable text."
      );
    }
  } else {
    throw new Error(`Unsupported file type for ${fileName}`);
  }

  const truncatedText = rawText.slice(0, MAX_TEXT_LENGTH);
  const lines = extractLines(truncatedText);
  const detectedSheetNumber = detectSheetNumber(lines, truncatedText);
  const detectedTitle = detectTitle(lines, detectedSheetNumber);
  const discipline = detectDiscipline(detectedSheetNumber, detectedTitle, truncatedText);
  const revisionDate = detectRevisionDate(lines, truncatedText);

  return {
    fileName,
    fileUrl,
    fileKind,
    detectedSheetNumber,
    detectedTitle,
    discipline,
    revisionDate,
    rawText: truncatedText,
  };
};

module.exports = async function analyzePlanFilesHandler(req, res, openAiApiKey) {
  const projectId = String(req.body?.projectId || "").trim();
  let fileErrors = [];

  try {
    const fileUrl =
      typeof req.body?.fileUrl === "string" && req.body.fileUrl.trim()
        ? req.body.fileUrl.trim()
        : Array.isArray(req.body?.fileUrls)
          ? String(req.body.fileUrls[0] || "").trim()
          : "";

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    if (!fileUrl) {
      return res.status(400).json({ error: "fileUrl is required." });
    }

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        projectId,
        analysisStatus: "processing",
        analysisStartedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    let analyzedFiles = [];

    try {
      const analysis = await analyzeSingleFile(fileUrl, 0);
      analyzedFiles = [analysis];
    } catch (error) {
      const fileName = getFileNameFromUrl(fileUrl, 0);
      console.error(`Plan analysis failed for ${fileName}:`, error);
      fileErrors = [
        {
          fileName,
          fileUrl,
          error: error instanceof Error ? error.message : "Unknown analysis error",
        },
      ];
    }

    if (!analyzedFiles.length) {
      throw new Error("No uploaded files could be analyzed.");
    }

    const projectIssues = detectProjectIssues(analyzedFiles);
    const projectSummary = analyzedFiles.length
      ? await summarizeProjectFromPlans(analyzedFiles, openAiApiKey)
      : {
          projectType: "",
          affectedAreas: [],
          summary: "",
        };

    const duplicateSheetSet = new Set(
      projectIssues.duplicateSheets.flatMap((entry) => entry.fileNames)
    );

    const conflictingRevisionSet = new Set(
      projectIssues.conflictingRevisions.flatMap((entry) => entry.fileNames)
    );

    const batch = firestore.batch();
    analyzedFiles.forEach((file, index) => {
      const fileIdBase = sanitizeFileIdPart(file.fileName) || `file-${index + 1}`;
      const fileId = `${fileIdBase}-${index + 1}`;
      const fileRef = firestore.doc(`planProjects/${projectId}/files/${fileId}`);

      batch.set(fileRef, {
        fileId,
        ...file,
        duplicateSheetDetected: duplicateSheetSet.has(file.fileName),
        conflictingRevisionDetected: conflictingRevisionSet.has(file.fileName),
        missingSheetNumbers: projectIssues.missingSheetNumbers,
        analyzedAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        analysisStatus: fileErrors.length ? "completed_with_errors" : "completed",
        analysisCompletedAt: FieldValue.serverTimestamp(),
        analyzedFileCount: analyzedFiles.length,
        failedFileCount: fileErrors.length,
        projectType: projectSummary.projectType,
        areas: projectSummary.affectedAreas,
        summary: projectSummary.summary,
        duplicateSheets: projectIssues.duplicateSheets,
        missingSheetNumbers: projectIssues.missingSheetNumbers,
        conflictingRevisions: projectIssues.conflictingRevisions,
      },
      { merge: true }
    );

    return res.json({
      projectId,
      projectType: projectSummary.projectType,
      areas: projectSummary.affectedAreas,
      summary: projectSummary.summary,
      files: analyzedFiles.map((file, index) => ({
        fileId: `${sanitizeFileIdPart(file.fileName) || `file-${index + 1}`}-${index + 1}`,
        fileName: file.fileName,
        detectedSheetNumber: file.detectedSheetNumber,
        detectedTitle: file.detectedTitle,
        discipline: file.discipline,
        revisionDate: file.revisionDate,
        rawText: file.rawText,
      })),
      duplicateSheets: projectIssues.duplicateSheets,
      missingSheetNumbers: projectIssues.missingSheetNumbers,
      conflictingRevisions: projectIssues.conflictingRevisions,
      fileErrors,
    });
  } catch (error) {
    console.error("Plan file analysis failed:", error);

    if (projectId) {
      await firestore.doc(`planProjects/${projectId}`).set(
        {
          analysisStatus: "failed",
          analysisCompletedAt: FieldValue.serverTimestamp(),
          failedFileCount: fileErrors.length,
          analysisError: error instanceof Error ? error.message : "Unknown error",
          analysisFileErrors: fileErrors,
        },
        { merge: true }
      );
    }

    return res.status(500).json({
      error: "Failed to analyze plan file.",
      details: error instanceof Error ? error.message : "Unknown error",
      fileErrors,
    });
  }
};
