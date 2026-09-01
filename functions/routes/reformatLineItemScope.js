const OpenAI = require("openai");
const { AI_MODELS } = require("./lib/aiModels");

const normalizeBulletLine = (value) => {
  const next = String(value || "")
    .replace(/^\s*[-•]\s*/, "")
    .trim();

  return next ? `- ${next}` : "";
};

const toScopeLines = (scope) => {
  if (Array.isArray(scope)) {
    return scope.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  return String(scope || "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

module.exports = async function reformatLineItemScopeHandler(
  req,
  res,
  OPENAI_API_KEY
) {
  try {
    const {
      trade,
      scope,
      material_labor_included: materialLaborIncluded,
      company_name: companyName,
      job,
    } = req.body || {};

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY not found in environment",
      });
    }

    const rawScopeLines = toScopeLines(scope);

    if (!rawScopeLines.length) {
      return res.status(400).json({
        error: "A scope of work is required.",
      });
    }

    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    const completion = await openai.chat.completions.create({
      model: AI_MODELS.FAST,
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content: `
You are an estimator and project manager for a residential and light commercial general contractor.

Your job:
- Take one trade scope from a contractor's bid line item.
- Clean up and reword it into clear, professional scope lines.
- Return only valid JSON.

STYLE & TONE
- Sound like a real contractor/estimator writing for homeowners, adjusters, and subs.
- Professional and clear, not salesy, not legalese.
- Use natural jobsite language such as:
  - "demo and haul off"
  - "furnish and install"
  - "set fixtures"
  - "scribe to walls"
  - "caulk and seal at tops and splashes"
  - "leave ready for paint"

RULES FOR THE SCOPE LINES
- Return one line per distinct scope point. Treat each note the estimator entered as its own point: reword it, but never merge two notes into one line. Only split a note if it truly covers separate scopes.
- Reword only. Do not add scope, steps, or detail the estimator did not write, and do not generalize. If a note is short, keep the line short.
- Word each point as a concrete action (demo/removal, furnish and install, prep, finish, cleanup, haul off, testing when relevant) — but only for the work the estimator actually noted, never as extra steps.
- Every line must start with "- " and contain exactly one scope point.
- Each line is one to two sentences at most.
- Only use the jobsite phrasing above when it matches what the estimator actually wrote.
- Do not use <ul>, <li>, bullet symbols, markdown, or HTML.
- Do not use these phrases unless the raw notes already contain them:
  - ensure / ensuring
  - to ensure a perfect fit
  - to ensure a seamless finish
  - to protect against stains and damage
  - guarantee / guaranteeing
  - optimal performance
  - high quality finish
- Do not invent brands, quantities, dimensions, or materials that were not provided.

Return only this JSON shape:
{
  "scope_lines": ["- first line", "- second line"]
}
          `,
        },
        {
          role: "user",
          content: JSON.stringify({
            company_name: String(companyName || "").trim(),
            job: String(job || "").trim(),
            trade: String(trade || "").trim(),
            material_labor_included:
              String(materialLaborIncluded || "").trim() === "No" ? "No" : "Yes",
            raw_scope_lines: rawScopeLines,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      parsed = null;
    }

    const aiScopeLines = Array.isArray(parsed?.scope_lines)
      ? parsed.scope_lines.map(normalizeBulletLine).filter(Boolean)
      : [];

    const scope_lines = aiScopeLines.length
      ? aiScopeLines
      : rawScopeLines.map(normalizeBulletLine).filter(Boolean);

    return res.json({ scope_lines });
  } catch (error) {
    console.error("Line item scope reformat error:", error);
    return res.status(500).json({
      error: "Failed to reformat the scope of work",
    });
  }
};
