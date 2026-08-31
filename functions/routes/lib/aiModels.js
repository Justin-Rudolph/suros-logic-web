/**
 * Centralized OpenAI model IDs.
 *
 * GPT-5.6 replaced the size-suffix naming (`-nano` / `-mini`) with three durable
 * capability tiers. The number is the generation; the name is the tier.
 *
 * Standard pricing per 1M tokens (input / cached input / output), as of
 * 2026-08-31 — see https://developers.openai.com/api/docs/pricing :
 *
 *   gpt-5.6-luna   fastest / cheapest        $0.20 / $0.02 / $1.20
 *   gpt-5.6-terra  balanced everyday model   $2.00 / $0.20 / $12.00
 *   gpt-5.6-sol    flagship reasoning        $4.00 / $0.40 / $20.00
 *                  (only tier that unlocks `max` reasoning effort;
 *                   Sol's price is promotional at least through 2026-11-21)
 *
 * Prompts past the long-context threshold are billed at higher rates
 * (roughly 2x input / 1.5x output). `gpt-5.6` on its own aliases `gpt-5.6-sol`.
 *
 * Reasoning effort levels for GPT-5.6: "none", "low", "medium", "high", "xhigh",
 * "max" ("max" is Sol-only). The old "minimal" level is gone — use "none".
 * Effort is a ceiling, not a floor: easy prompts may use zero reasoning tokens.
 */

const AI_MODELS = {
  // Cheap, high-volume helper passes: short summaries, formatting, scope merges,
  // proposal drafting from already-structured data.
  FAST: "gpt-5.6-luna",

  // Plan-analysis extraction and synthesis passes that need real reasoning but
  // run often enough that cost matters.
  STANDARD: "gpt-5.6-terra",

  // Highest-stakes single-shot generation where quality outweighs cost.
  DEEP: "gpt-5.6-sol",
};

module.exports = { AI_MODELS };
