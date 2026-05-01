const OpenAI = require("openai");

const normalizeBulletLine = (value) => {
  const next = String(value || "")
    .replace(/^\s*[-•]\s*/, "")
    .trim();

  return next ? `- ${next}` : "";
};

const splitScopeText = (value) =>
  String(value || "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const fallbackScopeLinesForItems = (items) =>
  items
    .flatMap((item) => [
      ...splitScopeText(item?.title),
      ...splitScopeText(item?.description),
    ])
    .map(normalizeBulletLine)
    .filter(Boolean);

const groupSelectionsByTrade = (selections) => {
  const grouped = [];
  const groupedByTrade = new Map();

  selections.forEach((selection) => {
    const trade = String(selection?.trade || "").trim();
    const title = String(selection?.title || "").trim();
    const description = String(selection?.description || "").trim();

    if (!trade || (!title && !description)) {
      return;
    }

    if (!groupedByTrade.has(trade)) {
      const nextGroup = {
        trade,
        items: [],
      };
      groupedByTrade.set(trade, nextGroup);
      grouped.push(nextGroup);
    }

    groupedByTrade.get(trade).items.push({
      title,
      description,
    });
  });

  return grouped;
};

module.exports = async function formatPlanScopeSelectionsForBidHandler(
  req,
  res,
  OPENAI_API_KEY
) {
  try {
    const { selections } = req.body || {};

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY not found in environment",
      });
    }

    if (!Array.isArray(selections) || !selections.length) {
      return res.status(400).json({
        error: "At least one selected scope item is required.",
      });
    }

    const groupedSelections = groupSelectionsByTrade(selections);

    if (!groupedSelections.length) {
      return res.status(400).json({
        error: "Selected scope items must include trade, title, or description.",
      });
    }

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
You convert selected plan-analyzer scope cards into contractor bid line-item scope bullets.

Your job:
- Process one grouped trade at a time.
- Combine multiple selected scope cards for the same trade into one clean scope of work list.
- Turn the titles and descriptions into short, practical dash-mark bullet lines.

Rules:
- Use only information explicitly present in the provided titles and descriptions.
- Do not invent materials, quantities, dimensions, means, methods, sequencing, pricing, exclusions, assumptions, or warranty language.
- Keep each bullet focused on one piece of work.
- Remove duplicates and near-duplicates within the same trade.
- Simplify wording when possible, but keep the meaning accurate.
- Each returned scope line must begin with "- ".
- Return at least one scope line per trade whenever source content exists.
- Do not include commentary, markdown fences, or extra keys.

Return only valid JSON in this format:
{
  "line_items": [
    {
      "trade": "Demo",
      "scope_lines": ["- First line", "- Second line"]
    }
  ]
}
          `,
        },
        {
          role: "user",
          content: JSON.stringify({
            trades: groupedSelections,
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

    const returnedLineItems = Array.isArray(parsed?.line_items) ? parsed.line_items : [];
    const aiItemsByTrade = new Map(
      returnedLineItems
        .map((item) => ({
          trade: String(item?.trade || "").trim(),
          scopeLines: Array.isArray(item?.scope_lines)
            ? item.scope_lines
                .map(normalizeBulletLine)
                .filter(Boolean)
            : [],
        }))
        .filter((item) => item.trade)
        .map((item) => [item.trade, item.scopeLines])
    );

    const line_items = groupedSelections.map((group) => {
      const aiScopeLines = aiItemsByTrade.get(group.trade) || [];
      const fallbackScopeLines = fallbackScopeLinesForItems(group.items);
      const scope_lines = aiScopeLines.length ? aiScopeLines : fallbackScopeLines;

      return {
        trade: group.trade,
        scope_lines: scope_lines.length ? scope_lines : ["- Scope to be defined"],
      };
    });

    return res.json({ line_items });
  } catch (error) {
    console.error("Plan scope selection formatting error:", error);
    return res.status(500).json({
      error: "Failed to format selected plan scopes for bid creation",
    });
  }
};
