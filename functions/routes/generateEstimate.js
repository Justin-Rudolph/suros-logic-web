const OpenAI = require("openai");

module.exports = async function generateEstimateHandler(
  req,
  res,
  OPENAI_API_KEY
) {
  try {
    const { description, zipCode } = req.body || {};

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY not found in environment",
      });
    }

    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    // Basic validation before calling OpenAI
    if (!description || description.trim().length < 15) {
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
    "total_cost": ""
  },
  "explanation": ""
}

Requirements:
- If required information is missing, return "status": "incomplete" and include any necessary clarification questions inside the "questions" array. You must add to the "questions" array if missing area dimensions or specific material descriptions.
- A zip code is required to produce a complete estimate. If no zip code is provided, return "incomplete".
- You may not ask the user to provide pricing. You must independently determine pricing based on the details given.
- Use regional material and labor cost averages based on the provided zip code.
- If exact material specifications are unclear, determine a reasonable price range (low-end to high-end), calculate the median between those values, and use that median unless the range difference is extreme.

If sufficient information is available:
- Calculate and provide a material cost estimate as a dollar amount.
- Calculate and provide a labor cost estimate as a dollar amount.
- Provide the combined total cost (labor + materials) as a dollar amount.
- Include a detailed explanation (maximum 10 sentences) explaining how you determined the material and labor costs. Base your calculations strictly on the information given in the request, and clearly break out how each cost was derived.

Formatting Requirements:
- All dollar amounts must be formatted with proper commas and no decimal places (Ex: $1,000).

Do not include any additional commentary outside of the required JSON response.
          `,
        },
        {
          role: "user",
          content: `
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

    return res.json(parsed);

  } catch (error) {
    console.error("OpenAI Error:", error);
    return res.status(500).json({
      error: "Failed to generate estimate",
    });
  }
};
