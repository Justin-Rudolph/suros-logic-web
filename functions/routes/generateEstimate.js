const OpenAI = require("openai");

module.exports = async function generateEstimateHandler(
  req,
  res,
  OPENAI_API_KEY
) {
  try {
    const {
      description,
      tradeName,
      zipCode,
      bypass,
      forceQuestions,
      questionsAlreadyAsked,
      mode,
      responses,
      siblingLineItems,
    } = req.body || {};
    const normalizedTradeName =
      typeof tradeName === "string" ? tradeName.trim() : "";

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY not found in environment",
      });
    }

    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    if (mode === "merge_scope") {
      if (!description || !description.trim()) {
        return res.status(400).json({
          error: "A scope description is required to merge responses",
        });
      }

      const answeredResponses = Array.isArray(responses)
        ? responses.filter(
            (entry) =>
              entry &&
              typeof entry.question === "string" &&
              typeof entry.response === "string" &&
              entry.response.trim()
          )
        : [];

      if (!answeredResponses.length) {
        return res.json({
          merged_scope: description,
        });
      }

      const mergeCompletion = await openai.chat.completions.create({
        model: "gpt-5-mini",
        reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content: `
You rewrite contractor scope of work text.

Your job is to combine the existing scope of work with the user's clarification responses into one updated scope.

Rules:
- Use only information explicitly stated in the existing scope or clarification responses.
- Do not hallucinate, infer, embellish, or add new tasks, materials, quantities, dimensions, sequencing, methods, brands, or assumptions.
- If a clarification answer is vague, keep it vague instead of making it more specific.
- Preserve all valid details already present in the existing scope.
- You may correct obvious spelling mistakes and minor grammar issues so the final scope reads clearly, but you must not change the meaning or add new facts.
- Every line must describe a contractor action or task — something the contractor will do, remove, install, protect, disconnect, or handle. Never write factual statements or observations (e.g. "There are no gas lines" is wrong; "No gas line disconnection required" or "Disconnect electrical connections prior to demo" is correct).
- Phrase each line using active contractor language: remove, demo, disconnect, protect, install, patch, cap, haul, coordinate, etc.
- Return the final scope as clean plain text with one bullet item per line whenever possible.
- Each line should begin with "- ".
- Do not include headings, commentary, notes, or JSON outside the required format.

Respond only in this JSON format:
{
  "merged_scope": "- first line\\n- second line"
}
            `,
          },
          {
            role: "user",
            content: `
Existing scope of work:
${description}

Trade name:
${tradeName || "Not Provided"}

Clarification responses:
${answeredResponses
  .map(
    (entry) =>
      `Question: ${entry.question.trim()}\nResponse: ${entry.response.trim()}`
  )
  .join("\n\n")}
            `,
          },
        ],
      });

      const mergeContent = mergeCompletion.choices[0].message.content;

      let parsedMerge;
      try {
        parsedMerge = JSON.parse(mergeContent);
      } catch (err) {
        return res.status(500).json({
          error: "Invalid JSON returned from AI scope merge",
          raw: mergeContent,
        });
      }

      return res.json({
        merged_scope: parsedMerge?.merged_scope || description,
      });
    }

    // Basic validation before calling OpenAI
    if (
      !bypass &&
      !forceQuestions &&
      !questionsAlreadyAsked &&
      (!description || description.trim().length < 15)
    ) {
      return res.json({
        status: "incomplete",
        questions: normalizedTradeName
          ? [
              `For the ${normalizedTradeName} trade, what specific work is included?`,
              "What are the approximate quantities, dimensions, or square footage?",
              `For the ${normalizedTradeName} work, what materials, fixtures, or items are involved?`,
              "Where is the project located?",
            ]
          : [
              "What type of project is this?",
              "What is the square footage?",
              "What materials are being used?",
              "Where is the project located?",
            ],
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      reasoning_effort: "high",
      messages: [
        {
          role: "system",
          content: `
You are a professional contractor estimator. Based on the information provided, generate a realistic estimate for both labor and material costs.

Respond only in the following JSON format:

{
  "status": "complete" | "incomplete",
  "questions": [],
  "estimate": {
    "material_cost": "",
    "labor_cost": "",
    "total_cost": "",
    "description": ""
  },
  "explanation": "",
  "estimates": {
    "average_price": {
      "material_cost": "",
      "labor_cost": "",
      "total_cost": "",
      "description": ""
    },
    "high_tier_price": {
      "material_cost": "",
      "labor_cost": "",
      "total_cost": "",
      "description": ""
    }
  }
}

Requirements:

- If BYPASS MODE is TRUE, you must generate a complete estimate even if information is missing.
- When bypassing, use regional material and labor cost averages based on the provided zip code 
(ONLY if no zip code assume reasonable contractor industry averages for missing information).
- If FORCE QUESTION MODE is TRUE, you must return "status": "incomplete" with clarification questions and you must not return 
an estimate. Ask only questions where the answer would directly and meaningfully change the price estimate — 
things like scope size, quantity, material tier, structural vs. cosmetic work, demo vs. install, access difficulty, or 
finish level. Do not ask about things that have little pricing impact (scheduling, preferences, contact info, etc.). 
Ask as many questions as are genuinely needed to price accurately based on what was entered — no artificial 
minimum or maximum — but do not ask redundant or low-impact questions. 
NEVER ask confirmation questions that simply restate or paraphrase information already 
present in the scope and ask "is that correct?" or "is that right?" — if something is already stated in the scope, 
treat it as fact and do not ask the user to confirm it. Only ask about information that is genuinely missing or ambiguous and 
where the answer would change the price.
- FORCE QUESTION MODE takes priority over all other estimate-generation instructions.
- If QUESTIONS ALREADY ASKED is TRUE, you must generate a complete estimate using the available details and reasonable contractor assumptions for missing information.
- Do NOT return "incomplete" when bypass mode is TRUE or QUESTIONS ALREADY ASKED is TRUE.
- If a trade name is provided, treat it as the controlling trade context for interpreting the scope of work and pricing the job.
- Use the trade name to decide whether the work is demolition, installation, repair, finishing, etc. Do not price the scope as a different trade just because the scope mentions an item that could belong to multiple trades.
- Example: if the trade name is "Demo" and the scope mentions cabinets, estimate demolition/removal/disposal pricing for cabinets, not cabinet installation pricing.
- If OTHER LINE ITEMS are provided in the request, those scopes are being estimated separately. Never include their costs in this estimate, and never ask questions about work that is already described in those other line items.

Normal behavior (when bypass mode is FALSE and QUESTIONS ALREADY ASKED is FALSE):
- If required information is missing, return "status": "incomplete" and include clarification questions inside the "questions" array.
- A zip code is required to produce a complete estimate unless bypass mode is TRUE or QUESTIONS ALREADY ASKED is TRUE.

Other rules:
- You may not ask the user to provide pricing. You must independently determine pricing based on the details given.
- Use regional material and labor cost averages based on the provided zip code.
- If exact material specifications are unclear, determine a reasonable price range (low-end to high-end), calculate the median between those values, and use that median unless the range difference is extreme.

If sufficient information is available (or bypass mode is TRUE):
- Generate two complete estimate tiers:
  1. "average_price": a realistic median market price using standard quality materials, standard contractor overhead, and typical labor rates for the region.
  2. "high_tier_price": a realistic higher-end market price using premium materials, stronger contractor margin/overhead, and higher-end labor rates for the region.
- For each tier, calculate and provide:
  - material_cost as a dollar amount
  - labor_cost as a dollar amount
  - total_cost as a dollar amount
  - description: a breakdown of how you determined the costs for that specific tier, formatted as bullet points. 
  Each bullet must start with "- " and cover one distinct point (e.g. a specific material cost, a labor rate, 
  a quantity assumption, a regional factor). Base your calculations strictly on the information given in the request. 
  Use as many bullets as needed to clearly explain the estimate, but keep each bullet concise.
- Also set the top-level "estimate" equal to the "average_price" tier and set the top-level "explanation" equal to the "average_price.description" for backward compatibility.

Formatting Requirements:
- All dollar amounts must be formatted with proper commas and no decimal places (Ex: $1,000).

Do not include any additional commentary outside of the required JSON response.
          `,
        },
        {
          role: "user",
          content: `
BYPASS MODE: ${bypass ? "TRUE" : "FALSE"}
FORCE QUESTION MODE: ${forceQuestions ? "TRUE" : "FALSE"}
QUESTIONS ALREADY ASKED: ${questionsAlreadyAsked ? "TRUE" : "FALSE"}

Zip Code: ${zipCode || "Not Provided"}
Trade Name: ${tradeName || "Not Provided"}

Scope of Work:
${description}
${Array.isArray(siblingLineItems) && siblingLineItems.length
  ? `
OTHER LINE ITEMS ALREADY PRICED IN THIS BID (DO NOT DOUBLE-COUNT):
${siblingLineItems.map((li, i) => `${i + 1}. Trade: ${li.trade || "Not Provided"}\n   Scope: ${li.scope || "Not Provided"}`).join("\n")}

IMPORTANT: The line items above are separate scopes of work that have already been (or will be) estimated and priced independently. Do NOT include any costs for work described in those line items in this estimate. Do NOT ask clarifying questions about work that is already described in those other line items.
`
  : ""}
          `,
        },
      ],
    });

    const content = completion.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      return res.status(500).json({
        error: "Invalid JSON returned from AI",
        raw: content,
      });
    }

    if (forceQuestions) {
      const questions = Array.isArray(parsed?.questions)
        ? parsed.questions.filter((question) => typeof question === "string" && question.trim())
        : [];

      return res.json({
        status: "incomplete",
        questions: questions.length
          ? questions
          : [
              "What are the approximate dimensions or square footage?",
              "What material quality level is expected (standard, mid-grade, or premium)?",
              "Does this include demolition or removal of existing materials?",
            ],
      });
    }

    if (
      parsed?.status === "complete" &&
      parsed?.estimates?.average_price &&
      parsed?.estimates?.high_tier_price
    ) {
      parsed.estimate = parsed.estimates.average_price;
      parsed.explanation =
        parsed.estimates.average_price.description || parsed.explanation || "";
    }

    return res.json(parsed);

  } catch (error) {
    console.error("OpenAI Error:", error);
    return res.status(500).json({
      error: "Failed to generate estimate",
    });
  }
};
