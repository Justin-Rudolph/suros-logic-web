const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const OpenAI = require("openai");
const pdfParse = require("pdf-parse");
const path = require("path");
const Tesseract = require("tesseract.js");
const { buildEstimatorSystemPrompt } = require("./lib/estimatorPrompt");
const { formatTradeLabelList, isFullTradeSelection } = require("./lib/tradeScopes");
const { AI_MODELS } = require("./lib/aiModels");
const {
  buildPlanModuleSummaryData,
  createJsonCompletion,
  createResponsesJsonCompletion,
  createPlanContextChunks,
  getPlanModuleDocPath,
  logUsageTotals,
  mapWithConcurrency,
  normalizeWhitespace,
  serializeChunkResults,
  sumUsage,
  uniqueStrings,
  readPageTextField,
} = require("./lib/planAnalyzerContext");
const {
  assertPlanAnalysisCanProcess,
  markPlanAnalysisFailed,
  shouldReleasePlanAnalysisReservationAfterError,
  shouldSkipPlanAnalysisFailureMutation,
  verifyPlanProjectOwner,
} = require("./lib/planAnalyzerQuota");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();
const storage = admin.storage();

const DISCIPLINE_CODES = ["A", "S", "M", "E", "P", "C", "L", "T", "F", "FP", "R", "I", "G"];
const MAX_SUMMARY_CHUNK_LENGTH = 75000;
const MIN_PDF_TEXT_LENGTH = 800;
const MIN_IMAGE_TEXT_LENGTH = 800;
const PDF_VISION_FALLBACK_MIN_TEXT_LENGTH = 5000;
const PDF_VISION_FALLBACK_MIN_AVG_PAGE_TEXT_LENGTH = 800;
const PDF_VISION_FALLBACK_MIN_USEFUL_PAGE_RATIO = 0.85;
// Each page renders up to 18 megapixels and is held again as PNG and base64; 8 in
// flight is what 2GiB allows.
const VISUAL_PAGE_CONCURRENCY = 12;
const PDF_PAGE_RENDER_BASE_SCALE = 4;
const PDF_PAGE_RENDER_MAX_DIMENSION = 4096;
const PDF_PAGE_RENDER_MAX_PIXELS = 18000000;

let pdfRendererDependenciesPromise = null;
let pdfjsStandardFontDataUrl = null;

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

// Labels this file writes into page text. They are never sheet content.
const GENERATED_HEADER_PATTERN =
  /^(HYBRID (PLAN|PDF) ANALYSIS|LOCAL (PDF )?TEXT EXTRACTION|VISUAL (PDF |DOCUMENT )?ANALYSIS|SOURCE KIND|VISIBLE (SHEET NUMBER|TITLE|DISCIPLINE|TEXT)|VISUAL SUMMARY|NOTABLE WORK ITEMS|COUNTED ITEMS|STATED DIMENSIONS|MEASURED DIMENSIONS):/;

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

const downloadUploadedPlanFile = async (uploadedFile) => {
  if (!uploadedFile?.storagePath) {
    const error = new Error("Uploaded file storage path is missing.");
    error.statusCode = 400;
    throw error;
  }

  const storageFile = storage.bucket().file(uploadedFile.storagePath);
  const [[buffer], [metadata]] = await Promise.all([
    storageFile.download(),
    storageFile.getMetadata(),
  ]);

  return {
    buffer,
    contentType: metadata.contentType || uploadedFile.type || "",
  };
};

const renderPdfPage = async (pageData) => {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  });

  let lastY;
  let text = "";

  for (const item of textContent.items) {
    if (lastY === item.transform[5] || !lastY) {
      text += item.str;
    } else {
      text += `\n${item.str}`;
    }
    lastY = item.transform[5];
  }

  return normalizeWhitespace(text);
};

const extractPdfPages = async (buffer) => {
  const pageTexts = [];

  const parsed = await pdfParse(buffer, {
    pagerender: async (pageData) => {
      const pageText = await renderPdfPage(pageData);
      pageTexts.push(pageText);
      return pageText;
    },
  });

  return {
    pageCount: Number(parsed?.numpages || pageTexts.length || 0),
    rawText: normalizeWhitespace(parsed?.text || pageTexts.join("\n\n")),
    pages: pageTexts.map((text, index) => ({
      pageNumber: index + 1,
      rawText: normalizeWhitespace(text),
    })),
  };
};

const extractImageText = async (buffer) => {
  const result = await Tesseract.recognize(buffer, "eng");
  return normalizeWhitespace(result?.data?.text || "");
};

const getImageMimeType = (fileName, contentType) => {
  const normalizedType = String(contentType || "").toLowerCase();
  if (/^image\/(png|jpe?g|webp|gif)$/.test(normalizedType)) {
    return normalizedType === "image/jpg" ? "image/jpeg" : normalizedType;
  }

  const normalizedName = String(fileName || "").toLowerCase();
  if (normalizedName.endsWith(".png")) return "image/png";
  if (normalizedName.endsWith(".webp")) return "image/webp";
  if (normalizedName.endsWith(".gif")) return "image/gif";
  if (/\.(jpe?g)$/i.test(normalizedName)) return "image/jpeg";
  return null;
};

const buildBase64FileDataUrl = (buffer, mimeType) =>
  `data:${mimeType};base64,${buffer.toString("base64")}`;

const loadPdfRendererDependencies = async () => {
  if (!pdfRendererDependenciesPromise) {
    pdfRendererDependenciesPromise = (async () => {
      const canvas = require("@napi-rs/canvas");

      if (!globalThis.DOMMatrix && canvas.DOMMatrix) {
        globalThis.DOMMatrix = canvas.DOMMatrix;
      }
      if (!globalThis.ImageData && canvas.ImageData) {
        globalThis.ImageData = canvas.ImageData;
      }
      if (!globalThis.Path2D && canvas.Path2D) {
        globalThis.Path2D = canvas.Path2D;
      }

      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      return {
        createCanvas: canvas.createCanvas,
        pdfjs,
      };
    })();
  }

  return pdfRendererDependenciesPromise;
};

const getPdfPageRenderScale = (viewport) => {
  const width = Number(viewport?.width || 0);
  const height = Number(viewport?.height || 0);
  const dimensionScale = Math.min(
    PDF_PAGE_RENDER_BASE_SCALE,
    width > 0 ? PDF_PAGE_RENDER_MAX_DIMENSION / width : PDF_PAGE_RENDER_BASE_SCALE,
    height > 0 ? PDF_PAGE_RENDER_MAX_DIMENSION / height : PDF_PAGE_RENDER_BASE_SCALE
  );
  const pixelScale =
    width > 0 && height > 0
      ? Math.sqrt(PDF_PAGE_RENDER_MAX_PIXELS / (width * height))
      : PDF_PAGE_RENDER_BASE_SCALE;

  return Math.max(1, Math.min(PDF_PAGE_RENDER_BASE_SCALE, dimensionScale, pixelScale));
};

const encodeCanvasAsPng = async (canvas) => {
  if (typeof canvas.encode === "function") {
    return Buffer.from(await canvas.encode("png"));
  }

  if (typeof canvas.toBuffer === "function") {
    return canvas.toBuffer("image/png");
  }

  throw new Error("PDF page renderer could not encode the rendered page image.");
};

const renderPdfPageToPng = async (pdfDocument, pageNumber) => {
  const { createCanvas } = await loadPdfRendererDependencies();
  const page = await pdfDocument.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = getPdfPageRenderScale(baseViewport);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const canvasContext = canvas.getContext("2d");

  await page.render({
    canvasContext,
    viewport,
  }).promise;

  const buffer = await encodeCanvasAsPng(canvas);
  page.cleanup();

  return {
    buffer,
    contentType: "image/png",
    width: Math.ceil(viewport.width),
    height: Math.ceil(viewport.height),
    scale,
  };
};

const loadPdfForRendering = async (buffer) => {
  const { pdfjs } = await loadPdfRendererDependencies();
  if (!pdfjsStandardFontDataUrl) {
    pdfjsStandardFontDataUrl = `${path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts")}${path.sep}`;
  }

  return pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    standardFontDataUrl: pdfjsStandardFontDataUrl,
    useSystemFonts: true,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  }).promise;
};

const createVisionAnalysisError = (fileName, error) => {
  const detail = error instanceof Error ? error.message : "Unknown vision analysis error";
  return new Error(`Vision analysis failed for ${fileName || "PDF file"}: ${detail}`);
};

const logPlanAnalysisMethod = ({ projectId, fileName, method, pageCount, reason = "" }) => {
  console.log(
    `[analyzePlanFiles] Extraction method | projectId=${projectId || "unknown"} | file="${fileName || "unknown"}" | method=${method} | pages=${pageCount || 0}${reason ? ` | reason=${reason}` : ""}`
  );
};

const getPdfTextExtractionMetrics = (extracted) => {
  const pageCount = Math.max(Number(extracted?.pageCount || 0), 1);
  const rawTextLength = normalizeWhitespace(extracted?.rawText || "").length;
  const averagePageTextLength = rawTextLength / pageCount;
  const pages = Array.isArray(extracted?.pages) ? extracted.pages : [];
  const pagesWithUsefulText = pages.filter(
    (page) => normalizeWhitespace(page?.rawText || "").length >= MIN_PDF_TEXT_LENGTH
  ).length;
  const usefulPageRatio = pages.length ? pagesWithUsefulText / pages.length : 0;
  const isWeak =
    rawTextLength < PDF_VISION_FALLBACK_MIN_TEXT_LENGTH ||
    averagePageTextLength < PDF_VISION_FALLBACK_MIN_AVG_PAGE_TEXT_LENGTH ||
    usefulPageRatio < PDF_VISION_FALLBACK_MIN_USEFUL_PAGE_RATIO;

  return {
    pageCount,
    rawTextLength,
    averagePageTextLength,
    pagesWithUsefulText,
    usefulPageRatio,
    isWeak,
  };
};

const formatPdfTextQualityReason = (metrics) =>
  [
    `text_quality=${metrics.isWeak ? "weak" : "strong"}`,
    `chars=${metrics.rawTextLength}`,
    `avg_chars_per_page=${Math.round(metrics.averagePageTextLength)}`,
    `useful_page_ratio=${metrics.usefulPageRatio.toFixed(2)}`,
  ].join(" ");

const MIN_SCALE_BAR_PIXELS = 20;

const pixelDistance = (from, to) =>
  Math.hypot(Number(to.x) - Number(from.x), Number(to.y) - Number(from.y));

const polygonPixelArea = (points) =>
  Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + Number(point.x) * Number(next.y) - Number(next.x) * Number(point.y);
    }, 0)
  ) / 2;

const formatMeasuredValue = (value) => String(Number(value.toFixed(1)));

/**
 * Lengths and areas the vision pass traced on the drawing, converted to feet with the
 * graphic scale bar of the same view. A page with a single scale bar uses it for every
 * trace; traces with no usable scale bar are dropped.
 */
const computeMeasuredDimensions = (page) => {
  const scaleBars = (Array.isArray(page?.scaleBars) ? page.scaleBars : [])
    .map((bar) => {
      const lengthFeet = Number(bar?.lengthFeet);
      const pixels = pixelDistance({ x: bar?.startX, y: bar?.startY }, { x: bar?.endX, y: bar?.endY });

      return {
        view: String(bar?.view || "").trim().toLowerCase(),
        lengthFeet,
        feetPerPixel: lengthFeet / pixels,
        usable: Number.isFinite(lengthFeet) && lengthFeet > 0 && Number.isFinite(pixels) && pixels >= MIN_SCALE_BAR_PIXELS,
      };
    })
    .filter((bar) => bar.usable);

  if (!scaleBars.length) return [];

  return (Array.isArray(page?.measurements) ? page.measurements : [])
    .map((measurement) => {
      const item = String(measurement?.item || "").trim();
      const view = String(measurement?.view || "").trim();
      const scaleBar =
        scaleBars.find((bar) => bar.view && bar.view === view.toLowerCase()) ||
        (scaleBars.length === 1 ? scaleBars[0] : null);
      const points = (Array.isArray(measurement?.points) ? measurement.points : []).filter(
        (point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y))
      );
      const isArea = measurement?.kind === "area";

      if (!item || !scaleBar || points.length < (isArea ? 3 : 2)) return "";

      const value = isArea
        ? polygonPixelArea(points) * scaleBar.feetPerPixel ** 2
        : points.slice(1).reduce((sum, point, index) => sum + pixelDistance(points[index], point), 0) *
          scaleBar.feetPerPixel;

      if (!(value > 0)) return "";

      const note = String(measurement?.note || "").trim();
      return `${item}${view ? ` (${view})` : ""}: ${formatMeasuredValue(value)} ${isArea ? "SF" : "LF"}, measured against the ${formatMeasuredValue(scaleBar.lengthFeet)} FT scale bar${note ? `; ${note}` : ""}`;
    })
    .filter(Boolean);
};

const formatCountedItems = (countedItems) =>
  (Array.isArray(countedItems) ? countedItems : [])
    .map((entry) => {
      const item = String(entry?.item || "").trim();
      const count = Number(entry?.count);
      if (!item || !Number.isFinite(count)) return "";
      const note = String(entry?.note || "").trim();
      return `- ${item}: ${count}${note ? ` (${note})` : ""}`;
    })
    .filter(Boolean);

const buildVisualPageRawText = (page, fileName, sourceKind) => {
  const visibleText = normalizeWhitespace(page?.visibleText || "");
  const visualSummary = normalizeWhitespace(page?.visualSummary || "");
  const notableWorkItems = uniqueStrings(page?.notableWorkItems);
  const countedItems = formatCountedItems(page?.countedItems);
  const statedDimensions = uniqueStrings(page?.statedDimensions);
  const measuredDimensions = computeMeasuredDimensions(page);
  const sheetNumber = String(page?.sheetNumber || "").trim();
  const title = String(page?.title || "").trim();
  const discipline = String(page?.discipline || "").trim();

  return [
    `VISUAL DOCUMENT ANALYSIS: ${fileName}`,
    `SOURCE KIND: ${sourceKind}`,
    sheetNumber ? `VISIBLE SHEET NUMBER: ${sheetNumber}` : "",
    title ? `VISIBLE TITLE: ${title}` : "",
    discipline ? `VISIBLE DISCIPLINE: ${discipline}` : "",
    visibleText ? `VISIBLE TEXT:\n${visibleText}` : "",
    visualSummary ? `VISUAL SUMMARY:\n${visualSummary}` : "",
    notableWorkItems.length ? `NOTABLE WORK ITEMS:\n${notableWorkItems.map((item) => `- ${item}`).join("\n")}` : "",
    countedItems.length ? `COUNTED ITEMS:\n${countedItems.join("\n")}` : "",
    statedDimensions.length
      ? `STATED DIMENSIONS:\n${statedDimensions.map((entry) => `- ${entry}`).join("\n")}`
      : "",
    measuredDimensions.length
      ? `MEASURED DIMENSIONS:\n${measuredDimensions.map((entry) => `- ${entry}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
};

const createVisualPageEntries = ({ fileName, fileUrl, fileKind, sourceKind, pages }) => {
  const normalizedPages = Array.isArray(pages) ? pages : [];
  const sourcePageCount = Math.max(normalizedPages.length, 1);

  return normalizedPages
    .map((page, index) => {
      const pageNumber = Number(page?.pageNumber || index + 1);
      const rawText = buildVisualPageRawText(page, fileName, sourceKind);
      if (!rawText) return null;

      return createPageEntry({
        fileName,
        fileUrl,
        fileKind,
        analysisMethod: sourceKind,
        rawText,
        sourcePageNumber: Number.isFinite(pageNumber) ? pageNumber : index + 1,
        sourcePageCount,
      });
    })
    .filter(Boolean);
};

const buildHybridPageRawText = ({ fileName, extractedText, visualText }) =>
  [
    `HYBRID PLAN ANALYSIS: ${fileName}`,
    normalizeWhitespace(extractedText)
      ? `LOCAL TEXT EXTRACTION:\n${normalizeWhitespace(extractedText)}`
      : "",
    normalizeWhitespace(visualText)
      ? `VISUAL ANALYSIS:\n${normalizeWhitespace(visualText)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

const createPdfHybridPageEntries = ({
  fileName,
  fileUrl,
  fileKind,
  analysisMethod,
  extracted,
  visualPages,
}) => {
  const extractedPages = Array.isArray(extracted?.pages) ? extracted.pages : [];
  const sourcePageCount = Math.max(
    Number(extracted?.pageCount || 0),
    extractedPages.length,
    Array.isArray(visualPages) ? visualPages.length : 0,
    1
  );
  const extractedByPage = new Map(
    extractedPages.map((page, index) => [
      Number(page?.pageNumber || index + 1),
      normalizeWhitespace(page?.rawText || ""),
    ])
  );
  const visualByPage = new Map(
    (Array.isArray(visualPages) ? visualPages : []).map((page, index) => [
      Number(page?.sourcePageNumber || index + 1),
      normalizeWhitespace(page?.rawText || ""),
    ])
  );
  const pageNumbers = Array.from(
    new Set([
      ...Array.from({ length: sourcePageCount }, (_, index) => index + 1),
      ...extractedByPage.keys(),
      ...visualByPage.keys(),
    ])
  )
    .filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber > 0)
    .sort((left, right) => left - right);

  return pageNumbers
    .map((pageNumber) => {
      const rawText = buildHybridPageRawText({
        fileName,
        extractedText: extractedByPage.get(pageNumber) || "",
        visualText: visualByPage.get(pageNumber) || "",
      });

      if (!rawText) return null;

      return createPageEntry({
        fileName,
        fileUrl,
        fileKind,
        analysisMethod,
        rawText,
        sourcePageNumber: pageNumber,
        sourcePageCount,
      });
    })
    .filter(Boolean);
};

const WEAK_TEXT_VISUAL_GUIDANCE =
  "Local text extraction was weak for this file, so visibleText is the primary source of readable plan text. Do not collapse readable note blocks, schedules, tables, callouts, or code/general notes into a short summary. Transcribe as much legible construction-relevant text as practical, preserving line breaks, labels, numbers, dimensions, sheet references, and schedule/table relationships, and report every countable item and printed dimension on the page.";

const STRONG_TEXT_VISUAL_GUIDANCE =
  "Local text extraction was strong for this file. Focus visibleText on text that is missing, poorly extracted, or visually structured, and spend the rest of the pass on what extraction cannot carry: countable symbols, fixtures, devices, doors, windows, schedule rows, and printed dimensions.";

const getVisualTextGuidance = (metrics) =>
  metrics?.isWeak ? WEAK_TEXT_VISUAL_GUIDANCE : STRONG_TEXT_VISUAL_GUIDANCE;

const getVisualAnalysisResponseFormat = () => ({
  type: "json_schema",
  json_schema: {
    name: "visual_plan_file_analysis",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pages: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              pageNumber: { type: "integer" },
              sheetNumber: { type: "string" },
              title: { type: "string" },
              discipline: { type: "string" },
              visibleText: { type: "string" },
              visualSummary: { type: "string" },
              notableWorkItems: {
                type: "array",
                items: { type: "string" },
              },
              countedItems: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    item: { type: "string" },
                    count: { type: "integer" },
                    note: { type: "string" },
                  },
                  required: ["item", "count", "note"],
                },
              },
              statedDimensions: {
                type: "array",
                items: { type: "string" },
              },
              scaleBars: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    view: { type: "string" },
                    lengthFeet: { type: "number" },
                    startX: { type: "number" },
                    startY: { type: "number" },
                    endX: { type: "number" },
                    endY: { type: "number" },
                  },
                  required: ["view", "lengthFeet", "startX", "startY", "endX", "endY"],
                },
              },
              measurements: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    item: { type: "string" },
                    view: { type: "string" },
                    kind: { type: "string", enum: ["length", "area"] },
                    points: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          x: { type: "number" },
                          y: { type: "number" },
                        },
                        required: ["x", "y"],
                      },
                    },
                    note: { type: "string" },
                  },
                  required: ["item", "view", "kind", "points", "note"],
                },
              },
            },
            required: [
              "pageNumber",
              "sheetNumber",
              "title",
              "discipline",
              "visibleText",
              "visualSummary",
              "notableWorkItems",
              "countedItems",
              "statedDimensions",
              "scaleBars",
              "measurements",
            ],
          },
        },
      },
      required: ["pages"],
    },
  },
});

const analyzeVisualDocument = async ({
  buffer,
  contentType,
  fileName,
  fileUrl,
  fileKind,
  openai,
  originalPageNumbers = null,
  visualTextGuidance = "",
  visualInputMimeType = "",
}) => {
  if (!openai) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }

  const isPdf = fileKind === "pdf";
  const imageMimeType = visualInputMimeType || (isPdf ? "" : getImageMimeType(fileName, contentType));
  const useImageInput = Boolean(imageMimeType);
  if (!isPdf && !imageMimeType) {
    throw new Error("Visual image analysis supports PNG, JPEG, WEBP, and non-animated GIF files.");
  }

  const fileInput = useImageInput
    ? {
        type: "input_image",
        image_url: buildBase64FileDataUrl(buffer, imageMimeType),
        detail: "original",
      }
    : isPdf
    ? {
        type: "input_file",
        filename: fileName,
        file_data: buildBase64FileDataUrl(buffer, "application/pdf"),
      }
    : null;

  const renderedPageNumber =
    isPdf && Array.isArray(originalPageNumbers) && originalPageNumbers.length
      ? Number(originalPageNumbers[0])
      : null;
  const selectedPageInstruction = renderedPageNumber
    ? `This image is a high-resolution rendering of original PDF page ${renderedPageNumber}. Analyze this page carefully. Return pageNumber as 1.`
    : "Create one page entry per visible page when possible.";
  const fileSpecificGuidance = String(visualTextGuidance || "").trim();

  const { parsed, usage } = await createResponsesJsonCompletion({
    openai,
    model: AI_MODELS.VISION,
    reasoningEffort: "medium",
    responseFormat: getVisualAnalysisResponseFormat(),
    systemPrompt: buildEstimatorSystemPrompt(`
Analyze uploaded construction plan files visually. Every page of every upload is analyzed this way alongside local
text extraction, so this pass is a primary source for material takeoff, not a fallback.

Additional task rules:
- Inspect the page image(s), including drawings, title blocks, notes, diagrams, tables, schedules, dimensions,
  callouts, labels, symbols, and legends.
- For PDFs, this visual analysis is combined with local PDF text extraction. Avoid duplicating text that appears
  to have been captured cleanly by local extraction unless the visual version clarifies formatting, numbers,
  relationships, or table/schedule structure.
- In visibleText, transcribe as much readable construction-relevant text as practical from the page, especially text
  likely to be missing, poorly extracted, visually structured, or important to scope. Prioritize notes, schedules,
  legends, callouts, dimensions, room/material/finish/equipment labels, and sheet identifiers over boilerplate title
  block or legal text.
- Do not only summarize readable text. Put readable text in visibleText first, then use visualSummary for visual
  context, drawings, diagrams, layout, scope implications, and meaningful information that is not plain text.
- In countedItems, count every repeated item and symbol visible on the page: fixtures, devices such as receptacles,
  switches, and lights, doors, windows, equipment, connectors, hangers, posts, and schedule rows. Give each a
  contractor-style name, your count, and a note saying how and where you counted it. When symbols are dense or partly
  unclear, give your best count and say so in the note rather than leaving the item out.
- In statedDimensions, transcribe dimensions, areas, spacings, heights, and slopes exactly as printed, with the label
  they belong to, for example "Bedroom 2: 12'-0\" x 14'-0\"" or "studs at 16\" O.C.". When a dimension string gives
  the segments of a wall or building run, also report their printed total, for example
  "North wall: 9'-8\" + 9'-8\" = 19'-4\"".
- Pixel coordinates refer to the attached image: x from its left edge and y from its top edge, in pixels.
- In scaleBars, report every graphic scale bar on the page: the view it belongs to (use the view title printed under
  the drawing), the pixel coordinates of its zero mark (startX, startY) and of a labeled mark as far along the bar as
  possible (endX, endY), and the distance in feet between those two marks (lengthFeet).
- In measurements, trace the lengths and areas a takeoff needs that no printed dimension gives: wall runs (exterior
  and interior separately, or by wall type), floor, room, deck, and roof areas, and runs of ledger, beam, rail, or
  trim. Give the view name, then either kind "length" with the points along the run in order, or kind "area" with the
  corner points of the outline in order, and a note on what you traced. Do not convert to feet yourself; the
  conversion is done from the scale bar.
- Only trace on views that have a graphic scale bar. Never estimate a distance by eye, and never trace on views
  marked NOT TO SCALE.
- Use cautious language for visual inferences. Say "appears" or "likely" when the page is unclear.
- Do not invent quantities, code requirements, dimensions, or materials that are not visible.
- Keep each visualSummary focused on project scope and plan-relevant information.
- If a field is not visible, return an empty string or an empty array for that field.

Return JSON exactly matching the schema.
    `),
    userContent: [
      fileInput,
      {
        type: "input_text",
        text: [
          `Analyze this ${isPdf ? "PDF plan set" : "uploaded plan image"} named "${fileName}" for plan analysis.`,
          selectedPageInstruction,
          fileSpecificGuidance ? `File-specific visible-text guidance: ${fileSpecificGuidance}` : "",
        ].filter(Boolean).join(" "),
      },
    ],
  });

  // Each page is rendered and analyzed on its own, so the reply numbers it 1.
  const visualPages = renderedPageNumber
    ? (Array.isArray(parsed?.pages) ? parsed.pages : []).map((page) => ({
        ...page,
        pageNumber: renderedPageNumber,
      }))
    : parsed?.pages;

  const pages = createVisualPageEntries({
    fileName,
    fileUrl,
    fileKind,
    sourceKind: isPdf ? "pdf_visual_analysis" : "image_visual_fallback",
    pages: visualPages,
  });

  if (!pages.length) {
    throw new Error("Visual plan analysis did not return usable page details.");
  }

  return {
    pages,
    usage,
  };
};

const createSinglePageBatches = (pageCount) => {
  const normalizedPageCount = Math.max(Number(pageCount || 0), 0);
  return Array.from({ length: normalizedPageCount }, (_, index) => ({
    pageNumber: index + 1,
    label: `Page ${index + 1}`,
  }));
};

const analyzePdfVisualPageBatches = async ({
  buffer,
  contentType,
  fileName,
  fileUrl,
  fileKind,
  openai,
  pageCount,
  visualTextGuidance,
}) => {
  const renderedPdf = await loadPdfForRendering(buffer);
  const pageBatches = createSinglePageBatches(
    Math.min(Number(pageCount || 0), renderedPdf.numPages || 0)
  );

  const batchUsages = [];
  let batchPages = [];

  try {
    batchPages = await mapWithConcurrency(
      pageBatches,
      async (batch, index) => {
        const originalPageNumber = batch.pageNumber;
        const renderedPage = await renderPdfPageToPng(renderedPdf, originalPageNumber);
        const visualAnalysis = await analyzeVisualDocument({
          buffer: renderedPage.buffer,
          contentType: renderedPage.contentType,
          fileName,
          fileUrl,
          fileKind,
          openai,
          originalPageNumbers: [originalPageNumber],
          visualInputMimeType: renderedPage.contentType,
          visualTextGuidance: `${visualTextGuidance} The attached image is a high-resolution ${renderedPage.width}x${renderedPage.height}px rendering of one PDF page; use the rendered image for reading dense or small text.`,
        });

        batchUsages[index] = visualAnalysis.usage;

        return {
          data: visualAnalysis.pages,
          usage: visualAnalysis.usage,
        };
      },
      {
        label: "analyzePlanFilesVisualBatches",
        concurrency: VISUAL_PAGE_CONCURRENCY,
      }
    );
  } finally {
    await renderedPdf.destroy?.();
  }

  return {
    pages: batchPages.flat(),
    usage: sumUsage(batchUsages),
  };
};

const createPageEntry = ({
  fileName,
  fileUrl,
  fileKind,
  analysisMethod,
  rawText,
  sourcePageNumber,
  sourcePageCount,
}) => {
  const lines = extractLines(rawText).filter((line) => !GENERATED_HEADER_PATTERN.test(line));
  const detectedSheetNumber =
    readPageTextField(rawText, "VISIBLE SHEET NUMBER") || detectSheetNumber(lines, rawText);
  const detectedTitle =
    readPageTextField(rawText, "VISIBLE TITLE") || detectTitle(lines, detectedSheetNumber);
  const discipline = detectDiscipline(detectedSheetNumber, detectedTitle, rawText);
  const revisionDate = detectRevisionDate(lines, rawText);

  return {
    fileName:
      typeof sourcePageNumber === "number" && sourcePageCount > 1
        ? `${fileName} (Page ${sourcePageNumber})`
        : fileName,
    sourceFileName: fileName,
    fileUrl,
    fileKind,
    analysisMethod,
    sourcePageNumber: typeof sourcePageNumber === "number" ? sourcePageNumber : 1,
    sourcePageCount: typeof sourcePageCount === "number" ? sourcePageCount : 1,
    detectedSheetNumber,
    detectedTitle,
    discipline,
    revisionDate,
    rawText,
  };
};

const buildAnalyzedFileId = (file, index) => {
  const fileIdBase = sanitizeFileIdPart(file.sourceFileName || file.fileName) || `file-${index + 1}`;
  const pageSuffix = Number.isFinite(Number(file.sourcePageNumber))
    ? `page-${Number(file.sourcePageNumber)}`
    : `${index + 1}`;
  return `${fileIdBase}-${pageSuffix}`;
};

const buildAnalyzedFileDocData = ({
  fileId,
  file,
}) => ({
  fileId,
  projectId: file.projectId,
  fileName: file.fileName,
  sourceFileName: file.sourceFileName,
  fileUrl: file.fileUrl,
  fileKind: file.fileKind,
  analysisMethod: file.analysisMethod,
  sourcePageNumber: file.sourcePageNumber,
  sourcePageCount: file.sourcePageCount,
  detectedSheetNumber: file.detectedSheetNumber,
  detectedTitle: file.detectedTitle,
  discipline: file.discipline,
  revisionDate: file.revisionDate,
  rawText: file.rawText,
  analyzedAt: FieldValue.serverTimestamp(),
});

const writeAnalyzedFiles = async ({
  projectId,
  analyzedFiles,
}) => {
  const writesPerGroup = 20;

  for (let start = 0; start < analyzedFiles.length; start += writesPerGroup) {
    const slice = analyzedFiles.slice(start, start + writesPerGroup);

    await Promise.all(
      slice.map((file, offset) => {
        const index = start + offset;
        const fileId = buildAnalyzedFileId(file, index);
        const fileRef = firestore.doc(`planProjects/${projectId}/files/${fileId}`);

        return fileRef.set(
          buildAnalyzedFileDocData({
            fileId,
            file: {
              ...file,
              projectId,
            },
          })
        );
      })
    );
  }
};

const summarizeProjectFromPlans = async (
  files,
  openAiApiKey,
  userNotes = "",
  selectedTrades = null
) => {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY not found in environment");
  }

  // The overview still has to describe the whole project, so a partial selection only
  // steers emphasis here. It does not drop work the way the other modules do.
  const tradeFocusRule =
    selectedTrades == null || isFullTradeSelection(selectedTrades)
      ? ""
      : `\n- The contractor limited this analysis to these trades: ${formatTradeLabelList(selectedTrades)}. Keep projectType and affectedAreas accurate for the whole project, but weight the summary toward work owned by those trades.`;

  const openai = new OpenAI({ apiKey: openAiApiKey });
  const contextChunks = createPlanContextChunks(files, MAX_SUMMARY_CHUNK_LENGTH);
  const chunkUsages = [];

  if (!contextChunks.length) {
    throw new Error("No extracted plan text is available for this project");
  }

  const chunkSummaries = await mapWithConcurrency(
    contextChunks,
    async (chunk, index) => {
      const { parsed, usage } = await createJsonCompletion({
        openai,
        model: AI_MODELS.STANDARD,
        reasoningEffort: "medium",
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "plan_project_chunk_summary",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                projectTypeSignals: {
                  type: "array",
                  items: { type: "string" },
                },
                affectedAreas: {
                  type: "array",
                  items: { type: "string" },
                },
                scopeSummary: {
                  type: "string",
                },
                notableWorkItems: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["projectTypeSignals", "affectedAreas", "scopeSummary", "notableWorkItems"],
            },
          },
        },
        systemPrompt: buildEstimatorSystemPrompt(`
Review one chunk of a larger plan set and summarize only what this chunk supports. The chunk may contain
OCR-extracted image text, PDF text extraction, and visual PDF/page summaries.

Additional task rules:
- projectTypeSignals should list likely project categories suggested by this chunk, such as remodel, addition,
  tenant improvement, new construction, repair, site work, exterior improvement, interior finish-out, or unknown.
- affectedAreas must be a deduplicated array of concise room, zone, or site area names.
- scopeSummary should be 2 to 4 sentences focused on work scope, not metadata.
- notableWorkItems should be concise contractor-style work items or systems present in this chunk.
- Do not describe anything as confirmed unless supported by the extracted text or visual page summary.
- Write scopeSummary as client-facing project scope language. Do not mention chunks, chunk summaries,
  extracted text, OCR, visual analysis, page records, or the analyzer process.

Return exactly:
{
  "projectTypeSignals": ["string"],
  "affectedAreas": ["Area 1", "Area 2"],
  "scopeSummary": "string",
  "notableWorkItems": ["string"]
}
      `),
        userContent: chunk.text,
      });
      chunkUsages[index] = usage;

      return {
        data: {
          projectTypeSignals: uniqueStrings(parsed?.projectTypeSignals),
          affectedAreas: uniqueStrings(parsed?.affectedAreas),
          scopeSummary: String(parsed?.scopeSummary || "").trim(),
          notableWorkItems: uniqueStrings(parsed?.notableWorkItems),
        },
        usage,
      };
    },
    { label: "analyzePlanFiles" }
  );

  const { parsed: aggregated, usage: aggregationUsage } = await createJsonCompletion({
    openai,
    model: AI_MODELS.STANDARD,
    reasoningEffort: "medium",
    responseFormat: {
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
              items: { type: "string" },
            },
            summary: {
              type: "string",
            },
          },
          required: ["projectType", "affectedAreas", "summary"],
        },
      },
    },
    systemPrompt: buildEstimatorSystemPrompt(`
Combine chunk-level summaries from a full plan set into one complete project overview. Some chunks may include
hybrid PDF context that combines local text extraction with visual page summaries.

Additional task rules:
- Use all chunk summaries together.
- projectType must be the single best-supported overall category.
- affectedAreas must be a deduplicated array of concise area names for the full project.
- summary should be 3 to 6 sentences and reflect the overall work, not sheet metadata.
- Weigh repeated signals more heavily than one-off hints.
- Do not describe anything as confirmed unless supported by the provided chunk summaries.
- Write summary as a direct project description for a contractor or estimator. Do not mention chunks,
  chunk summaries, extracted text, OCR, visual analysis, page records, or the analyzer process.${tradeFocusRule}

Return exactly:
{
  "projectType": "string",
  "affectedAreas": ["Area 1", "Area 2"],
  "summary": "string"
}
    `, { userNotes }),
    userContent: serializeChunkResults(contextChunks, chunkSummaries, "SOURCE SUMMARY"),
  });

  const projectType = String(aggregated?.projectType || "").trim();
  const affectedAreas = uniqueStrings(aggregated?.affectedAreas);
  const summary = String(aggregated?.summary || "").trim();

  if (!projectType || !summary) {
    throw new Error("AI project analysis did not return required fields");
  }

  logUsageTotals("analyzePlanFiles", [
    { title: "chunks", usage: sumUsage(chunkUsages) },
    { title: "aggregation", usage: aggregationUsage },
    { title: "overall", usage: sumUsage([...chunkUsages, aggregationUsage]) },
  ]);

  return {
    projectType,
    affectedAreas,
    summary,
  };
};

const analyzeSingleFile = async (uploadedFile, index, openai, options = {}) => {
  const { projectId = "" } = options;
  const { buffer, contentType } = await downloadUploadedPlanFile(uploadedFile);
  const fileName = uploadedFile.name || getFileNameFromUrl(uploadedFile.downloadURL || "", index);
  const fileUrl = uploadedFile.downloadURL || "";
  const fileKind = detectFileKind(fileName, contentType);

  if (fileKind === "pdf") {
    const extracted = await extractPdfPages(buffer);
    const metrics = getPdfTextExtractionMetrics(extracted);

    logPlanAnalysisMethod({
      projectId,
      fileName,
      method: "pdf_hybrid_pages",
      pageCount: metrics.pageCount,
      reason: formatPdfTextQualityReason(metrics),
    });

    let visualAnalysis;
    try {
      visualAnalysis = await analyzePdfVisualPageBatches({
        buffer,
        contentType,
        fileName,
        fileUrl,
        fileKind,
        openai,
        pageCount: metrics.pageCount,
        visualTextGuidance: getVisualTextGuidance(metrics),
      });
    } catch (error) {
      throw createVisionAnalysisError(fileName, error);
    }

    logUsageTotals("analyzePlanFilesHybrid", [
      { title: `pdf_hybrid_pages pages=${metrics.pageCount}`, usage: visualAnalysis.usage },
    ]);

    return createPdfHybridPageEntries({
      fileName,
      fileUrl,
      fileKind,
      analysisMethod: "pdf_hybrid_pages",
      extracted,
      visualPages: visualAnalysis.pages,
    });
  }

  if (fileKind === "image") {
    const rawText = await extractImageText(buffer);
    const isWeak = rawText.length < MIN_IMAGE_TEXT_LENGTH;

    logPlanAnalysisMethod({
      projectId,
      fileName,
      method: "image_hybrid",
      pageCount: 1,
      reason: isWeak ? "weak_image_ocr" : "image_ocr_ok",
    });

    let visualAnalysis;
    try {
      visualAnalysis = await analyzeVisualDocument({
        buffer,
        contentType,
        fileName,
        fileUrl,
        fileKind,
        openai,
        visualTextGuidance: getVisualTextGuidance({ isWeak }),
      });
    } catch (error) {
      throw createVisionAnalysisError(fileName, error);
    }

    logUsageTotals("analyzePlanFilesImageHybrid", [
      { title: "image_hybrid", usage: visualAnalysis.usage },
    ]);

    return [
      createPageEntry({
        fileName,
        fileUrl,
        fileKind,
        analysisMethod: "image_hybrid",
        rawText: buildHybridPageRawText({
          fileName,
          extractedText: rawText,
          visualText: visualAnalysis.pages.map((page) => page.rawText).join("\n\n"),
        }),
        sourcePageNumber: 1,
        sourcePageCount: 1,
      }),
    ];
  }

  throw new Error(`Unsupported file type for ${fileName}`);
};

module.exports = async function analyzePlanFilesHandler(req, res, openAiApiKey, adminContext = null) {
  const projectId = String(req.body?.projectId || "").trim();
  let fileErrors = [];
  let uploadedFile = null;

  try {
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required." });
    }

    const { projectData } = adminContext
      ? adminContext
      : await verifyPlanProjectOwner(firestore, req, projectId);
    assertPlanAnalysisCanProcess(projectData);

    uploadedFile = Array.isArray(projectData.uploadedFiles) ? projectData.uploadedFiles[0] : null;
    if (!uploadedFile?.storagePath) {
      return res.status(400).json({ error: "Uploaded file is missing for this plan analysis." });
    }

    const startedAt = FieldValue.serverTimestamp();

    await firestore.doc(`planProjects/${projectId}`).set(
      {
        projectId,
        status: "processing",
        modules: {
          overview: buildPlanModuleSummaryData(projectId, "overview", "processing", {
            startedAt,
            error: null,
          }),
        },
      },
      { merge: true }
    );
    await firestore.doc(getPlanModuleDocPath(projectId, "overview")).set(
      {
        projectId,
        moduleType: "overview",
        status: "processing",
        startedAt,
        error: null,
      },
      { merge: true }
    );

    let analyzedFiles = [];
    const visualOpenai = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;

    try {
      analyzedFiles = await analyzeSingleFile(uploadedFile, 0, visualOpenai, { projectId });
    } catch (error) {
      const fileName = uploadedFile?.name || getFileNameFromUrl(uploadedFile?.downloadURL || "", 0);
      console.error(`Plan analysis failed for ${fileName}:`, error);
      fileErrors = [
        {
          fileName,
          fileUrl: uploadedFile?.downloadURL || "",
          error: error instanceof Error ? error.message : "Unknown analysis error",
        },
      ];
    }

    if (!analyzedFiles.length) {
      throw new Error("No uploaded files could be analyzed.");
    }

    const projectSummary = await summarizeProjectFromPlans(
      analyzedFiles,
      openAiApiKey,
      projectData?.userNotes,
      projectData?.selectedTrades
    );

    const latestProjectSnap = await firestore.doc(`planProjects/${projectId}`).get();
    assertPlanAnalysisCanProcess(latestProjectSnap.data() || {});

    await writeAnalyzedFiles({
      projectId,
      analyzedFiles,
    });

    const overviewStatus = fileErrors.length ? "completed_with_errors" : "completed";
    const completedAt = FieldValue.serverTimestamp();
    const overviewResult = {
      projectType: projectSummary.projectType,
      areas: projectSummary.affectedAreas,
      summary: projectSummary.summary,
    };

    await Promise.all([
      firestore.doc(getPlanModuleDocPath(projectId, "overview")).set(
        {
          projectId,
          moduleType: "overview",
          status: overviewStatus,
          completedAt,
          error: null,
          result: overviewResult,
        },
        { merge: true }
      ),
      firestore.doc(`planProjects/${projectId}`).set(
        {
          status: fileErrors.length ? "completed_with_errors" : "processing",
          modules: {
            overview: buildPlanModuleSummaryData(projectId, "overview", overviewStatus, {
              completedAt,
              error: null,
            }),
          },
          analyzedFileCount: analyzedFiles.length,
          failedFileCount: fileErrors.length,
        },
        { merge: true }
      ),
    ]);

    return res.json({
      projectId,
      projectType: projectSummary.projectType,
      areas: projectSummary.affectedAreas,
      summary: projectSummary.summary,
      files: analyzedFiles.map((file, index) => ({
        fileId: buildAnalyzedFileId(file, index),
        fileName: file.fileName,
        sourceFileName: file.sourceFileName,
        sourcePageNumber: file.sourcePageNumber,
        detectedSheetNumber: file.detectedSheetNumber,
        detectedTitle: file.detectedTitle,
        discipline: file.discipline,
        revisionDate: file.revisionDate,
        analysisMethod: file.analysisMethod,
        rawText: file.rawText,
      })),
      fileErrors,
    });
  } catch (error) {
    console.error("Plan file analysis failed:", error);

    if (projectId && !shouldSkipPlanAnalysisFailureMutation(error)) {
      const completedAt = FieldValue.serverTimestamp();
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await Promise.all([
        firestore.doc(`planProjects/${projectId}`).set(
          {
            status: "failed",
            modules: {
              overview: buildPlanModuleSummaryData(projectId, "overview", "failed", {
                completedAt,
                error: errorMessage,
              }),
            },
            failedFileCount: fileErrors.length,
            analysisFileErrors: fileErrors,
          },
          { merge: true }
        ),
        firestore.doc(getPlanModuleDocPath(projectId, "overview")).set(
          {
            projectId,
            moduleType: "overview",
            status: "failed",
            completedAt,
            error: errorMessage,
          },
          { merge: true }
        ),
      ]);

    }

    if (projectId && shouldReleasePlanAnalysisReservationAfterError(error)) {
      await markPlanAnalysisFailed(firestore, projectId).catch((quotaError) => {
        console.error("Failed to release plan analysis quota after analysis failure:", quotaError);
      });
    }

    return res.status(error.statusCode || 500).json({
      error: "Failed to analyze plan file.",
      details: error instanceof Error ? error.message : "Unknown error",
      fileErrors,
    });
  }
};

module.exports.__test__ = {
  buildBase64FileDataUrl,
  buildHybridPageRawText,
  createSinglePageBatches,
  createPageEntry,
  createVisionAnalysisError,
  getPdfTextExtractionMetrics,
  loadPdfForRendering,
  logPlanAnalysisMethod,
  renderPdfPageToPng,
};

module.exports.VISUAL_PAGE_CONCURRENCY = VISUAL_PAGE_CONCURRENCY;
module.exports.buildVisualPageRawText = buildVisualPageRawText;
module.exports.computeMeasuredDimensions = computeMeasuredDimensions;
module.exports.getVisualAnalysisResponseFormat = getVisualAnalysisResponseFormat;
module.exports.getVisualTextGuidance = getVisualTextGuidance;
