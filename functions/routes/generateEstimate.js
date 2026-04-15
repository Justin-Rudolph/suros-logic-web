const OpenAI = require("openai");

module.exports = async function generateEstimateHandler(
  req,
  res,
  OPENAI_API_KEY
) {
  try {
    const {
      description,
      zipCode,
      bypass,
      forceQuestions,
      questionsAlreadyAsked,
      mode,
      responses,
    } = req.body || {};

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
        questions: [
          "What type of project is this?",
          "What is the square footage?",
          "What materials are being used?",
          "Where is the project located?",
        ],
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "low",
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
- When bypassing, use regional material and labor cost averages based on the provided zip code (ONLY if no zip code assume reasonable contractor industry averages for missing information).
- If FORCE QUESTION MODE is TRUE, you must return "status": "incomplete" with 3 to 6 useful clarification questions and you must not return an estimate.
- FORCE QUESTION MODE takes priority over all other estimate-generation instructions.
- If QUESTIONS ALREADY ASKED is TRUE, you must generate a complete estimate using the available details and reasonable contractor assumptions for missing information.
- Do NOT return "incomplete" when bypass mode is TRUE or QUESTIONS ALREADY ASKED is TRUE.

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
  - description: a detailed explanation (maximum 10 sentences) explaining how you determined the material and labor costs for that specific tier. Base your calculations strictly on the information given in the request, and clearly break out how each cost was derived.
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

Scope of Work:
${description}
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
          ? questions.slice(0, 6)
          : [
              "What materials should be used?",
              "What are the approximate dimensions or square footage?",
              "Are there any demolition, prep, or disposal needs?",
              "Are there any access, timeline, or site conditions that could affect labor?",
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
