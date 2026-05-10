const DEFAULT_SECTION_SEPARATOR = "\n\n====================\n\n";
const DEFAULT_CHUNK_CHAR_LIMIT = 75000;
const DEFAULT_CHUNK_CONCURRENCY = 3;

const normalizeWhitespace = (value) =>
  String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const uniqueStrings = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

const toComparableNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const sortPlanFiles = (files) =>
  [...(Array.isArray(files) ? files : [])].sort((left, right) => {
    const leftPage = toComparableNumber(left?.sourcePageNumber);
    const rightPage = toComparableNumber(right?.sourcePageNumber);

    if (leftPage !== null && rightPage !== null && leftPage !== rightPage) {
      return leftPage - rightPage;
    }

    const leftSheet = String(left?.detectedSheetNumber || "");
    const rightSheet = String(right?.detectedSheetNumber || "");
    const sheetCompare = leftSheet.localeCompare(rightSheet);
    if (sheetCompare) return sheetCompare;

    return String(left?.fileName || "").localeCompare(String(right?.fileName || ""));
  });

const buildPlanSectionHeader = (file, options = {}) => {
  const { includeRevisionDate = true, partLabel = "" } = options;
  const headerParts = [
    file?.fileName ? `FILE: ${file.fileName}` : null,
    Number.isFinite(Number(file?.sourcePageNumber)) ? `PAGE: ${Number(file.sourcePageNumber)}` : null,
    file?.detectedSheetNumber ? `SHEET: ${file.detectedSheetNumber}` : null,
    file?.detectedTitle ? `TITLE: ${file.detectedTitle}` : null,
    file?.discipline ? `DISCIPLINE: ${file.discipline}` : null,
    includeRevisionDate && file?.revisionDate ? `REVISION DATE: ${file.revisionDate}` : null,
    partLabel ? `PART: ${partLabel}` : null,
  ].filter(Boolean);

  return headerParts.join(" | ");
};

const splitTextNearBoundary = (text, maxChars) => {
  if (text.length <= maxChars) {
    return [text];
  }

  const parts = [];
  let cursor = 0;

  while (cursor < text.length) {
    const remaining = text.slice(cursor).trim();
    if (!remaining) break;
    if (remaining.length <= maxChars) {
      parts.push(remaining);
      break;
    }

    const window = remaining.slice(0, maxChars);
    const boundary =
      window.lastIndexOf("\n\n") > maxChars * 0.55
        ? window.lastIndexOf("\n\n")
        : window.lastIndexOf("\n") > maxChars * 0.55
          ? window.lastIndexOf("\n")
          : window.lastIndexOf(" ") > maxChars * 0.55
            ? window.lastIndexOf(" ")
            : -1;

    const splitIndex = boundary > 0 ? boundary : maxChars;
    parts.push(remaining.slice(0, splitIndex).trim());
    cursor += splitIndex;
  }

  return parts.filter(Boolean);
};

const expandFileIntoPromptSections = (file, maxChars, options = {}) => {
  const includeRevisionDate = options.includeRevisionDate !== false;
  const bodyText = normalizeWhitespace(file?.rawText || "");
  if (!bodyText) return [];

  const baseHeader = buildPlanSectionHeader(file, { includeRevisionDate });
  const reservedChars = Math.max(1000, maxChars - baseHeader.length - 64);
  const textParts = splitTextNearBoundary(bodyText, reservedChars);

  return textParts.map((text, index) => {
    const partLabel = textParts.length > 1 ? `${index + 1} of ${textParts.length}` : "";
    const header = buildPlanSectionHeader(file, { includeRevisionDate, partLabel });
    return {
      fileId: String(file?.id || ""),
      sourcePageNumber: toComparableNumber(file?.sourcePageNumber),
      detectedSheetNumber: String(file?.detectedSheetNumber || "").trim(),
      label:
        Number.isFinite(Number(file?.sourcePageNumber))
          ? `Page ${Number(file.sourcePageNumber)}${partLabel ? ` (${partLabel})` : ""}`
          : String(file?.fileName || `Section ${index + 1}`),
      text: `${header}\n${text}`.trim(),
    };
  });
};

const buildChunkLabel = (sections) => {
  const pageNumbers = sections
    .map((section) => section.sourcePageNumber)
    .filter((value) => Number.isFinite(value));

  if (pageNumbers.length) {
    const start = Math.min(...pageNumbers);
    const end = Math.max(...pageNumbers);
    return start === end ? `Page ${start}` : `Pages ${start}-${end}`;
  }

  const sheetNumbers = uniqueStrings(sections.map((section) => section.detectedSheetNumber));
  if (sheetNumbers.length === 1) {
    return `Sheet ${sheetNumbers[0]}`;
  }
  if (sheetNumbers.length > 1) {
    return `Sheets ${sheetNumbers[0]}-${sheetNumbers[sheetNumbers.length - 1]}`;
  }

  return `Chunk ${sections[0]?.label || "1"}`;
};

const createPlanContextChunks = (files, maxChars = DEFAULT_CHUNK_CHAR_LIMIT, options = {}) => {
  const separator = options.separator || DEFAULT_SECTION_SEPARATOR;
  const normalizedFiles = sortPlanFiles(files);
  const sections = normalizedFiles.flatMap((file) =>
    expandFileIntoPromptSections(file, maxChars, options)
  );

  const chunks = [];
  let currentSections = [];
  let currentLength = 0;

  const pushChunk = () => {
    if (!currentSections.length) return;
    chunks.push({
      chunkIndex: chunks.length,
      label: buildChunkLabel(currentSections),
      fileIds: uniqueStrings(currentSections.map((section) => section.fileId)),
      text: currentSections.map((section) => section.text).join(separator),
    });
    currentSections = [];
    currentLength = 0;
  };

  sections.forEach((section) => {
    const nextLength = currentSections.length
      ? currentLength + separator.length + section.text.length
      : section.text.length;

    if (currentSections.length && nextLength > maxChars) {
      pushChunk();
    }

    currentSections.push(section);
    currentLength = currentSections.length
      ? currentSections.reduce(
          (total, currentSection, index) =>
            total + currentSection.text.length + (index > 0 ? separator.length : 0),
          0
        )
      : 0;
  });

  pushChunk();

  return chunks;
};

const normalizeConcurrency = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getChunkProcessingConcurrency = (override) =>
  normalizeConcurrency(override) ||
  normalizeConcurrency(process.env.PLAN_ANALYZER_CHUNK_CONCURRENCY) ||
  DEFAULT_CHUNK_CONCURRENCY;

const formatElapsedMs = (value) => {
  const elapsedMs = Number(value);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return "unknown";
  }

  if (elapsedMs < 1000) {
    return `${Math.round(elapsedMs)}ms`;
  }

  return `${(elapsedMs / 1000).toFixed(2)}s`;
};

const normalizeUsage = (usage) => {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const inputTokens = Number(usage.prompt_tokens);
  const outputTokens = Number(usage.completion_tokens);
  const totalTokens = Number(usage.total_tokens);

  if (
    !Number.isFinite(inputTokens) &&
    !Number.isFinite(outputTokens) &&
    !Number.isFinite(totalTokens)
  ) {
    return null;
  }

  return {
    prompt_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    completion_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    total_tokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
};

const formatUsageMetrics = (usage) => {
  const normalized = normalizeUsage(usage);
  if (!normalized) {
    return "";
  }

  const parts = [];
  parts.push(`input ${normalized.prompt_tokens}`);
  parts.push(`output ${normalized.completion_tokens}`);
  parts.push(`total ${normalized.total_tokens}`);

  return parts.join(" | ");
};

const formatUsageSummary = (usage) => {
  const metrics = formatUsageMetrics(usage);
  return metrics ? ` | ${metrics}` : "";
};

const sumUsage = (usages) =>
  (Array.isArray(usages) ? usages : []).reduce(
    (totals, usage) => {
      const normalized = normalizeUsage(usage);
      if (!normalized) {
        return totals;
      }

      totals.prompt_tokens += normalized.prompt_tokens;
      totals.completion_tokens += normalized.completion_tokens;
      totals.total_tokens += normalized.total_tokens;
      return totals;
    },
    {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    }
  );

const logUsageTotals = (label, sections) => {
  const sectionParts = (Array.isArray(sections) ? sections : [])
    .map((section) => {
      const title = String(section?.title || "").trim();
      const metrics = formatUsageMetrics(section?.usage);
      if (!title || !metrics) {
        return "";
      }

      return `${title}: ${metrics}`;
    })
    .filter(Boolean);

  if (!sectionParts.length) {
    return;
  }

  console.log(`[${label}] Token totals | ${sectionParts.join(" | ")}`);
};

const mapWithConcurrency = async (items, mapper, options = {}) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return [];
  }

  const concurrency = Math.min(getChunkProcessingConcurrency(options.concurrency), list.length);
  const logLabel = String(options.label || "chunk-runner").trim();
  const results = new Array(list.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIndex < list.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const currentItem = list[currentIndex];
        const startedAt = Date.now();
        const mapped = await mapper(currentItem, currentIndex);
        const elapsed = formatElapsedMs(Date.now() - startedAt);
        const resultData =
          mapped && typeof mapped === "object" && "data" in mapped ? mapped.data : mapped;
        const usageSummary = formatUsageSummary(
          mapped && typeof mapped === "object" ? mapped.usage : null
        );
        results[currentIndex] = resultData;

        const chunkLabel = String(currentItem?.label || `Chunk ${currentIndex + 1}`).trim();
        console.log(
          `[${logLabel}] Finished chunk ${currentIndex + 1}/${list.length}${chunkLabel ? ` (${chunkLabel})` : ""} in ${elapsed}${usageSummary}`
        );
      }
    })
  );

  return results;
};

const buildScopeContext = (scopes, maxChars) => {
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

  const combined = sections.join("\n\n").trim();
  return typeof maxChars === "number" && maxChars > 0 ? combined.slice(0, maxChars) : combined;
};

const serializeChunkResults = (chunks, results, label = "CHUNK") =>
  results
    .map((result, index) =>
      `${label} ${index + 1} | ${chunks[index]?.label || `Chunk ${index + 1}`}\n${JSON.stringify(
        result,
        null,
        2
      )}`
    )
    .join(DEFAULT_SECTION_SEPARATOR);

const createJsonCompletion = async ({
  openai,
  model,
  reasoningEffort = "medium",
  systemPrompt,
  userContent,
  responseFormat,
}) => {
  const payload = {
    model,
    reasoning_effort: reasoningEffort,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userContent,
      },
    ],
  };

  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  const completion = await openai.chat.completions.create(payload);
  const content = completion.choices[0]?.message?.content;

  try {
    return {
      parsed: JSON.parse(content),
      usage: completion.usage || null,
    };
  } catch (error) {
    throw new Error(`Invalid JSON returned from AI analysis: ${content || "empty response"}`);
  }
};

const loadProjectPlanFiles = async (firestore, projectId) => {
  const fileSnapshot = await firestore.collection(`planProjects/${projectId}/files`).get();

  if (fileSnapshot.empty) {
    return [];
  }

  return sortPlanFiles(
    fileSnapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      .filter((file) => normalizeWhitespace(file?.rawText || "").length > 0)
  );
};

const getPlanModuleDocPath = (projectId, moduleType) =>
  `planProjects/${projectId}/modules/${moduleType}`;

const buildPlanModuleSummaryData = (projectId, moduleType, status, extra = {}) => ({
  moduleType,
  docPath: getPlanModuleDocPath(projectId, moduleType),
  status,
  ...extra,
});

const isOptionalPlanModuleEnabled = (analysisOptions, key) => {
  if (!analysisOptions || typeof analysisOptions !== "object") {
    return true;
  }

  return analysisOptions[key] === true;
};

const getProjectStatusAfterModuleUpdate = (projectData, moduleType, nextStatus) => {
  if (nextStatus === "failed") {
    return "failed";
  }

  const overviewStatus = projectData?.modules?.overview?.status;
  const overviewDone = overviewStatus === "completed" || overviewStatus === "completed_with_errors";

  if (!overviewDone || nextStatus !== "completed") {
    return "processing";
  }

  const modules = {
    ...(projectData?.modules || {}),
    [moduleType]: {
      ...(projectData?.modules?.[moduleType] || {}),
      status: nextStatus,
    },
  };
  const analysisOptions = projectData?.analysisOptions || {};
  const moduleDone = (key) => modules[key]?.status === "completed" || modules[key]?.status === "skipped";

  const allModulesDone =
    modules.scopes?.status === "completed" &&
    (!isOptionalPlanModuleEnabled(analysisOptions, "verification") || moduleDone("verification")) &&
    (!isOptionalPlanModuleEnabled(analysisOptions, "safety") || moduleDone("safety")) &&
    (!isOptionalPlanModuleEnabled(analysisOptions, "conflicts") || moduleDone("conflicts")) &&
    (!isOptionalPlanModuleEnabled(analysisOptions, "rfi") || moduleDone("rfi"));

  return allModulesDone ? "completed" : "processing";
};

module.exports = {
  DEFAULT_CHUNK_CHAR_LIMIT,
  DEFAULT_CHUNK_CONCURRENCY,
  DEFAULT_SECTION_SEPARATOR,
  buildScopeContext,
  createJsonCompletion,
  createPlanContextChunks,
  formatUsageMetrics,
  getChunkProcessingConcurrency,
  buildPlanModuleSummaryData,
  getProjectStatusAfterModuleUpdate,
  getPlanModuleDocPath,
  loadProjectPlanFiles,
  logUsageTotals,
  mapWithConcurrency,
  normalizeWhitespace,
  sumUsage,
  serializeChunkResults,
  sortPlanFiles,
  uniqueStrings,
};
