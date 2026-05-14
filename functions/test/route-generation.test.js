const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const ROUTE_MODULES = {
  changeOrder: "../routes/generateChangeOrderProposal",
  bidForm: "../routes/generateBidFormProposal",
  estimate: "../routes/generateEstimate",
  planScopeSelections: "../routes/formatPlanScopeSelectionsForBid",
  downloadProposalPdf: "../routes/downloadBidFormProposalPdf",
};

const createMockResponse = () => {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  return response;
};

const withMockedOpenAI = async (completionContent, run, options = {}) => {
  const originalLoad = Module._load;
  const { onCreate } = options;

  class MockOpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async (payload) => {
            onCreate?.(payload);

            return {
              choices: [
                {
                  message: {
                    content: completionContent,
                  },
                },
              ],
            };
          },
        },
      };
    }
  }

  Module._load = function patchedLoader(request, parent, isMain) {
    if (request === "openai") {
      return MockOpenAI;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return await run();
  } finally {
    Module._load = originalLoad;
  }
};

const loadHandler = (routeKey) => {
  const modulePath = require.resolve(ROUTE_MODULES[routeKey], {
    paths: [__dirname],
  });
  delete require.cache[modulePath];
  return require(modulePath);
};

test("generateChangeOrderProposal stores 0 tax percent and N/A amount when no tax applies", async () => {
  await withMockedOpenAI(
    JSON.stringify({
      reason_for_change_description: "Updated scope due to field conditions.",
      breakdown_material_labor_description: ["Cabinet removal", "- Install new trim"],
      immediate_or_later_payment: "Payment due upon approval",
      original_contract_price: "$10,000.00",
      price_of_change: "$500.00",
      tax_on_price_change: "N/A",
      new_contract_price: "$10,500.00",
      date_of_issue: "March 29, 2026",
      original_completion_date: "March 29, 2026",
      new_completion_date: "April 3, 2026",
      additional_time_for_change: "5",
    }),
    async () => {
      const handler = loadHandler("changeOrder");
      const req = {
        body: {
          payload: {
            title: "Change Order - Kitchen",
            company_name: "Suros Logic",
            company_address: "123 Main",
            company_phone: "555-111-2222",
            company_email: "team@example.com",
            full_name: "Estimator Name",
            job_name: "Kitchen Remodel",
            customer_name: "Taylor",
            date_of_issue: "2026-03-29",
            reason_for_change_description: "Move electrical",
            breakdown_material_labor_description: "Cabinet removal",
            tax_percentage: 8.25,
            tax_on_price_change: "N/A",
            original_contract_price: "$10,000.00",
            price_of_change: "$500.00",
            new_contract_price: "$10,500.00",
            original_completion_date: "2026-03-29",
            additional_time_for_change: "5",
            new_completion_date: "2026-04-03",
            immediate_or_later_payment: "payment_upon_approval",
          },
        },
      };
      const res = createMockResponse();

      await handler(req, res, "fake-key");

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.documentData.tax_percentage, 0);
      assert.equal(res.body.documentData.tax_not_applicable, true);
      assert.equal(res.body.documentData.tax_on_price_change, "N/A");
    }
  );
});

test("generateChangeOrderProposal normalizes multiline breakdown lines", async () => {
  await withMockedOpenAI(
    JSON.stringify({
      reason_for_change_description: "Updated scope due to field conditions.",
      breakdown_material_labor_description: [" Demo existing vanity ", "install new mirror"],
      immediate_or_later_payment: "Payment due upon final weekly payment",
      original_contract_price: "$10,000.00",
      price_of_change: "$500.00",
      tax_on_price_change: "$0.00",
      new_contract_price: "$10,500.00",
      date_of_issue: "March 29, 2026",
      original_completion_date: "March 29, 2026",
      new_completion_date: "April 3, 2026",
      additional_time_for_change: "5",
    }),
    async () => {
      const handler = loadHandler("changeOrder");
      const req = {
        body: {
          payload: {
            company_name: "Suros Logic",
            company_address: "123 Main",
            company_phone: "555-111-2222",
            company_email: "team@example.com",
            full_name: "Estimator Name",
            job_name: "Bathroom Remodel",
            customer_name: "Taylor",
            breakdown_material_labor_description: "demo vanity\ninstall mirror",
            tax_percentage: 0,
            tax_on_price_change: "$0.00",
          },
        },
      };
      const res = createMockResponse();

      await handler(req, res, "fake-key");

      assert.equal(
        res.body.documentData.breakdown_material_labor_description,
        "- Demo existing vanity\n- install new mirror"
      );
    }
  );
});

test("generateBidFormProposal falls back to normalized raw scope lines when AI omits expansions", async () => {
  await withMockedOpenAI(
    JSON.stringify({
      line_items: [
        {
          index: 1,
          expanded_scope_lines: [],
        },
      ],
    }),
    async () => {
      const handler = loadHandler("bidForm");
      const req = {
        body: {
          payload: {
            company_name: "Suros Logic",
            customer_name: "Taylor",
            job: "Bathroom Remodel",
            tax_amount: "N/A",
            tax_percentage: "N/A",
            line_items: [
              {
                trade: "Demo",
                material_labor_included: "Yes",
                line_total: "$250.00",
                scope: "remove vanity\n- haul off debris",
              },
            ],
          },
        },
      };
      const res = createMockResponse();

      await handler(req, res, "fake-key");

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.documentData.tax_percentage, 0);
      assert.deepEqual(res.body.documentData.line_items[0].expanded_scope_lines, [
        "- remove vanity",
        "- haul off debris",
      ]);
    }
  );
});

test("generateBidFormProposal rejects missing line items", async () => {
  const handler = loadHandler("bidForm");
  const req = {
    body: {
      payload: {
        company_name: "Suros Logic",
      },
    },
  };
  const res = createMockResponse();

  await handler(req, res, "fake-key");

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    error: "At least one line item is required.",
  });
});

test("generateEstimate includes trade name in the pricing prompt", async () => {
  let createPayload;

  await withMockedOpenAI(
    JSON.stringify({
      status: "complete",
      questions: [],
      estimate: {
        material_cost: "$0",
        labor_cost: "$250",
        total_cost: "$250",
        description: "Demo pricing applied.",
      },
      explanation: "Demo pricing applied.",
      estimates: {
        average_price: {
          material_cost: "$0",
          labor_cost: "$250",
          total_cost: "$250",
          description: "Demo pricing applied.",
        },
        high_tier_price: {
          material_cost: "$0",
          labor_cost: "$400",
          total_cost: "$400",
          description: "Higher demo pricing applied.",
        },
      },
    }),
    async () => {
      const handler = loadHandler("estimate");
      const req = {
        body: {
          description: "3 5x7 cabinets",
          tradeName: "Demo",
          zipCode: "10001",
          bypass: true,
        },
      };
      const res = createMockResponse();

      await handler(req, res, "fake-key");

      assert.equal(res.statusCode, 200);
      assert.match(
        createPayload.messages[0].content,
        /trade name is "Demo" and the scope mentions cabinets/i
      );
      assert.match(createPayload.messages[1].content, /Trade Name: Demo/);
    },
    {
      onCreate: (payload) => {
        createPayload = payload;
      },
    }
  );
});

test("generateEstimate uses trade-aware fallback questions for short scopes", async () => {
  const handler = loadHandler("estimate");
  const req = {
    body: {
      description: "cabinets",
      tradeName: "Demo",
    },
  };
  const res = createMockResponse();

  await handler(req, res, "fake-key");

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    status: "incomplete",
    questions: [
      "For the Demo trade, what specific work is included?",
      "What are the approximate quantities, dimensions, or square footage?",
      "For the Demo work, what materials, fixtures, or items are involved?",
      "Where is the project located?",
    ],
  });
});

test("formatPlanScopeSelectionsForBid groups selected scope items by trade", async () => {
  await withMockedOpenAI(
    JSON.stringify({
      line_items: [
        {
          trade: "Demo",
          scope_lines: [
            "- Remove existing cabinetry",
            "- Haul off demolition debris",
          ],
        },
        {
          trade: "HVAC",
          scope_lines: [
            "- Install new supply grille",
          ],
        },
      ],
    }),
    async () => {
      const handler = loadHandler("planScopeSelections");
      const req = {
        body: {
          selections: [
            {
              trade: "Demo",
              title: "Remove cabinets",
              description: "Demo and dispose of existing upper cabinets.",
            },
            {
              trade: "Demo",
              title: "Remove countertops",
              description: "Demo laminate tops and remove debris.",
            },
            {
              trade: "HVAC",
              title: "New grille",
              description: "Provide and install one new ceiling grille.",
            },
          ],
        },
      };
      const res = createMockResponse();

      await handler(req, res, "fake-key");

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.line_items, [
        {
          trade: "Demo",
          scope_lines: [
            "- Remove existing cabinetry",
            "- Haul off demolition debris",
          ],
        },
        {
          trade: "HVAC",
          scope_lines: [
            "- Install new supply grille",
          ],
        },
      ]);
    }
  );
});

test("formatPlanScopeSelectionsForBid falls back to normalized source lines when AI omits a trade", async () => {
  await withMockedOpenAI(
    JSON.stringify({
      line_items: [
        {
          trade: "Demo",
          scope_lines: [],
        },
      ],
    }),
    async () => {
      const handler = loadHandler("planScopeSelections");
      const req = {
        body: {
          selections: [
            {
              trade: "Demo",
              title: "Remove cabinets",
              description: "Demo and dispose of existing upper cabinets.",
            },
          ],
        },
      };
      const res = createMockResponse();

      await handler(req, res, "fake-key");

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.line_items, [
        {
          trade: "Demo",
          scope_lines: [
            "- Remove cabinets",
            "- Demo and dispose of existing upper cabinets.",
          ],
        },
      ]);
    }
  );
});

test("downloadBidFormProposalPdf sends HTML to API2PDF chrome endpoint", async () => {
  const originalFetch = global.fetch;
  let capturedUrl;
  let capturedOptions;

  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;

    return {
      ok: true,
      json: async () => ({
        Success: true,
        FileUrl: "https://example.com/generated.pdf",
      }),
    };
  };

  try {
    const handler = loadHandler("downloadProposalPdf");
    const req = {
      body: {
        html: "<html><body>Proposal</body></html>",
        fileName: "Invoice # 123",
      },
    };
    const res = createMockResponse();

    await handler(req, res, "api2pdf-key");

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.downloadUrl, "https://example.com/generated.pdf");
    assert.equal(res.body.fileName, "Invoice-123.pdf");
    assert.equal(capturedUrl, "https://v2.api2pdf.com/chrome/pdf/html");
    assert.equal(capturedOptions.headers.Authorization, "api2pdf-key");

    const payload = JSON.parse(capturedOptions.body);
    assert.equal(payload.html, req.body.html);
    assert.equal(payload.inline, false);
    assert.equal(payload.fileName, "Invoice-123.pdf");
    assert.equal(payload.options.width, "8.5in");
    assert.equal(payload.options.height, "11in");
    assert.equal(payload.options.printBackground, true);
    assert.equal(payload.options.scale, 0.54);
  } finally {
    global.fetch = originalFetch;
  }
});

test("renderBidEditorHtml reflects 0 percent tax with N/A tax dollars", async () => {
  require("sucrase/register");
  require("sucrase/register/tsx");

  const originalLoad = Module._load;
  Module._load = function patchedLoader(request, parent, isMain) {
    if (request === "@/models/BidFormProposals") {
      return {};
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  const templateModulePath = require.resolve("../../src/lib/bidFormProposal/template.ts", {
    paths: [__dirname],
  });
  delete require.cache[templateModulePath];

  try {
    const { renderBidEditorHtml } = require(templateModulePath);

    const html = renderBidEditorHtml({
      company_name: "Suros Logic",
      company_address: "123 Main",
      company_phone: "555-111-2222",
      company_email: "team@example.com",
      company_slogan: "Build it right",
      invoice_date: "2026-03-29",
      invoice_number: "INV-42",
      customer_name: "Taylor",
      customer_address: "456 Oak",
      customer_phone: "N/A",
      customer_email: "N/A",
      salesperson: "Estimator Name",
      job: "Kitchen Remodel",
      payment_terms: "Net 30",
      approx_weeks: "8",
      contingency_percentage: 10,
      contingency_coverage: "Unexpected conditions",
      tax_percentage: 0,
      deposit_percentage: 20,
      weekly_payments: 4,
      line_items: [
        {
          trade: "Demo",
          material_labor_included: "Yes",
          line_total: 1000,
          raw_scope_lines: ["demo existing finishes"],
          expanded_scope_lines: ["- Demo existing finishes and haul off debris."],
        },
      ],
    });

    assert.match(html, /Tax\s*\(0%\)/);
    assert.match(html, />\s*N\/A\s*</);
  } finally {
    Module._load = originalLoad;
  }
});

test("renderChangeOrderProposalHtml reflects 0 percent tax with N/A tax dollars", async () => {
  require("sucrase/register");
  require("sucrase/register/tsx");

  const originalLoad = Module._load;
  Module._load = function patchedLoader(request, parent, isMain) {
    if (request === "@/models/ChangeOrderProposals") {
      return {};
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  const templateModulePath = require.resolve("../../src/lib/changeOrderProposal/template.ts", {
    paths: [__dirname],
  });
  delete require.cache[templateModulePath];

  try {
    const { renderChangeOrderProposalHtml } = require(templateModulePath);

    const html = renderChangeOrderProposalHtml({
      title: "Change Order",
      company_name: "Suros Logic",
      company_address: "123 Main",
      company_phone: "555-111-2222",
      company_email: "team@example.com",
      customer_name: "Taylor",
      job_name: "Kitchen Remodel",
      date_of_issue: "2026-03-29",
      reason_for_change_description: "Updated scope due to field conditions.",
      breakdown_material_labor_description: "- Demo existing finishes",
      tax_percentage: 0,
      tax_not_applicable: true,
      original_contract_price: "$10,000.00",
      price_of_change: "$500.00",
      tax_on_price_change: "N/A",
      new_contract_price: "$10,500.00",
      original_completion_date: "2026-03-29",
      additional_time_for_change: "5",
      new_completion_date: "2026-04-03",
      immediate_or_later_payment: "Payment due upon approval",
      full_name: "Estimator Name",
    });

    assert.match(html, /Tax on Change \(0%\)/);
    assert.match(html, />\s*N\/A\s*</);
  } finally {
    Module._load = originalLoad;
  }
});
