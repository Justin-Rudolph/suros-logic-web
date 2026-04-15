const OpenAI = require("openai");

const asNumber = (value) => {
  const numeric = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const toScopeLines = (scope) => {
  if (Array.isArray(scope)) {
    return scope
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }

  return String(scope || "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

module.exports = async function generateBidWorkspaceOverviewHandler(
  req,
  res,
  OPENAI_API_KEY
) {
  try {
    const { payload } = req.body || {};

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY not found in environment",
      });
    }

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "A bid overview payload is required." });
    }

    const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];

    const overviewContext = {
      title: String(payload.title || "").trim(),
      customer_name: String(payload.customer_name || "").trim(),
      customer_address: String(payload.customer_address || "").trim(),
      job: String(payload.job || "").trim(),
      approx_weeks: String(payload.approx_weeks || "").trim(),
      total_cost: asNumber(payload.total_cost),
      payment_terms: String(payload.payment_terms || "").trim(),
      deposit_percentage: asNumber(payload.deposit_percentage),
      weekly_payments: asNumber(payload.weekly_payments),
      line_items: lineItems.slice(0, 4).map((item) => ({
        trade: String(item?.trade || "").trim(),
        line_total: asNumber(item?.line_total),
        scope_lines: toScopeLines(item?.scope).slice(0, 3),
      })),
    };

    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content: `
You write concise project overview summaries for a contractor bid workspace.

Your job:
- Read only the bid context.
- Return a short project summary in 2 to 4 sentences.
- Mention the client, project scope, and total cost when available.
- Mention schedule and payment structure when available.

Rules:
- Sound professional, helpful, and direct.
- Keep it plain text only.
- Do not use bullets, markdown, headings, emojis, or sales language.
- Do not invent details that are not in the payload.
- Do not mention proposal generation, proposal status, change orders, workspace tabs, missing proposals, or anything outside the bid details.
- If some details are missing, simply omit them.
- Keep the summary under 90 words.

Return only valid JSON in this format:
{
  "summary": "2 to 3 sentence summary"
}
          `,
        },
        {
          role: "user",
          content: JSON.stringify(overviewContext),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return res.status(500).json({
        error: "Invalid JSON returned from AI",
        raw: content,
      });
    }

    const summary = String(parsed?.summary || "").trim();

    if (!summary) {
      return res.status(500).json({
        error: "AI did not return a summary",
      });
    }

    return res.json({ summary });
  } catch (error) {
    console.error("Bid workspace overview generation error:", error);
    return res.status(500).json({
      error: "Failed to generate bid workspace overview",
    });
  }
};
