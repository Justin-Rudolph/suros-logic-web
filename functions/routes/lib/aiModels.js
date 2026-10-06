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

  // Reading the rendered plan pages. Only the per-page vision pass uses this.
  // gpt-6.1-sol leads 5.6-sol on every Roboflow Vision Evals task this pass
  // depends on, by more than the error bars: counting 78.8% vs 74.3%, data
  // extraction 88.0% vs 84.9%, object detection 80.8% vs 68.4%.
  //
  // It is deliberately NOT used for generateScopes. That was tried, and the
  // takeoff got measurably worse: across two completed runs on the same 12-page
  // file it grounded only 14.4% and 19.4% of its quantities in the plans,
  // against 48.7-66.1% for gpt-5.6-sol, with 86% and 81% of materials falling
  // back to an "inferred" standard allowance. It also produced LONGER material
  // lists (209 and 232 entries vs 114-165), so the regression reads as
  // thoroughness unless you check quantityBasis. Those two ranges do not
  // overlap, which no other model comparison here managed.
  //
  // Its advantage is measured on vision tasks. On the takeoff's arithmetic it
  // publishes no mathematics score at all, while gpt-5.6-sol scores 96.8%.
  //
  // It is also slower to emit and ran close to the model's output token cap on
  // the takeoff: 29,170 then 33,528 output tokens on runs that finished, and one
  // run truncated mid-JSON after exceeding it. (The ~906s failures that preceded
  // this were undici's 300s fetch headersTimeout firing three times over, NOT
  // the SDK's 600s timeout, which streaming in planAnalyzerContext.js now avoids
  // entirely.)
  //
  // Not in OpenAI's public model list — ID confirmed by the account owner; fall
  // back to gpt-5.6-sol if it stops resolving.
  VISION: "gpt-6.1-sol",
};

module.exports = { AI_MODELS };
