import React, {
  useState,
  ChangeEvent,
  KeyboardEvent,
  FormEvent,
} from "react";
import "./BidForm.css";
import surosLogo from "@/assets/suros-logo-new.png";

// ------------------------------------
// TYPES
// ------------------------------------
interface LineItem {
  trade: string;
  scope: string;
  material_labor_included: "Yes" | "No";
  line_total: string;
}

interface BidFormState {
  company_address: string;
  company_phone: string;
  company_email: string;
  invoice_date: string;
  invoice_number: string;
  salesperson: string;
  job: string;
  payment_terms: string;
  approx_weeks: number | string;
  contingency_coverage: string;
  total_costs: string;
  deposit_required: string;
  weekly_payments: number | string;
  final_amount_due: string;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  customer_email: string;
}

// ------------------------------------
// INITIAL FILLED TEST DATA
// ------------------------------------
const initialTestState: BidFormState = {
  company_address: "4829 Rolling Brook Dr, Tampa, FL 33625",
  company_phone: "(813) 555-9082",
  company_email: "office@lastcallhomesolutions.com",
  invoice_date: "2025-11-28",
  invoice_number: "LC-2025-1178",
  salesperson: "Dennis Call",
  job: "Kitchen Remodel – 2290 Maple Ridge Ct, Tampa FL",
  payment_terms:
    "50% deposit required before work begins. Weekly progress payments due every Friday. Final amount due upon project completion.",
  approx_weeks: 5,
  contingency_coverage:
    "Covers miscellaneous materials, unexpected repairs, hardware replacements, drywall patching, plumbing seals, tile work, and fixture adjustments.",
  total_costs: "$18750",
  deposit_required: "$9375",
  weekly_payments: 4,
  final_amount_due: "$1875",
  customer_name: "Michael Thompson",
  customer_address: "2290 Maple Ridge Ct, Tampa FL 33625",
  customer_phone: "(813) 445-7710",
  customer_email: "michael.thompson@example.com",
};

// ------------------------------------
// MONEY HELPERS
// ------------------------------------
const moneyToNumber = (value: string) => {
  if (!value) return 0;
  return parseFloat(value.replace(/[^0-9.]/g, "")) || 0;
};

// ------------------------------------
// TEST LINE ITEM OPTIONS (2–5)
// ------------------------------------
const testLineItemSets: Record<number, LineItem[]> = {
  2: [
    {
      trade: "Plumbing",
      scope: `- Disconnect old plumbing
- Install new PEX water lines
- Replace garbage disposal
- Install new shutoff valves`,
      line_total: "$5200",
      material_labor_included: "Yes",
    },
    {
      trade: "Drywall",
      scope: `- Remove damaged drywall
- Install new 1/2" drywall
- Tape and mud seams
- Sand and prep for paint`,
      line_total: "$4100",
      material_labor_included: "Yes",
    },
  ],

  3: [
    {
      trade: "Electrical",
      scope: `- Add recessed lighting
- Install two GFCI outlets
- Replace breaker for kitchen circuit`,
      line_total: "$2600",
      material_labor_included: "Yes",
    },
    {
      trade: "Flooring",
      scope: `- Remove old tile
- Install new LVP flooring
- Add new baseboards`,
      line_total: "$4800",
      material_labor_included: "Yes",
    },
    {
      trade: "Painting",
      scope: `- Prime all walls
- Apply two coats interior paint
- Paint trim and baseboards`,
      line_total: "$2300",
      material_labor_included: "Yes",
    },
  ],

  // ⭐ NEW OPTION 4
  4: [
    {
      trade: "Demolition",
      scope: `- Remove cabinetry
- Remove countertops
- Dispose of debris`,
      line_total: "$1800",
      material_labor_included: "Yes",
    },
    {
      trade: "Cabinet Installation",
      scope: `- Install RTA cabinets
- Level and secure bases
- Hang uppers`,
      line_total: "$6200",
      material_labor_included: "Yes",
    },
    {
      trade: "Countertops",
      scope: `- Template for quartz slabs
- Install quartz countertops
- Seal and finish`,
      line_total: "$5400",
      material_labor_included: "Yes",
    },
    {
      trade: "Backsplash",
      scope: `- Install subway tile
- Apply grout
- Seal tile and grout`,
      line_total: "$2200",
      material_labor_included: "Yes",
    },
  ],

  // ⭐ NEW OPTION 5
  5: [
    {
      trade: "Appliance Installation",
      scope: `- Install refrigerator
- Install dishwasher & connect water line
- Install over-the-range microwave
- Test all electrical and water connections`,
      line_total: "$1500",
      material_labor_included: "Yes",
    },
    {
      trade: "Interior Painting",
      scope: `- Patch wall imperfections
- Apply primer to all walls
- Apply two coats interior paint
- Paint trim and baseboards`,
      line_total: "$2800",
      material_labor_included: "Yes",
    },
    {
      trade: "Plumbing Fixtures",
      scope: `- Replace kitchen faucet
- Install under-sink plumbing kit
- Install garbage disposal
- Test for leaks and drainage`,
      line_total: "$950",
      material_labor_included: "Yes",
    },
    {
      trade: "Tile Flooring",
      scope: `- Remove existing flooring
- Install cement board
- Lay porcelain tile
- Apply grout and seal flooring`,
      line_total: "$4200",
      material_labor_included: "Yes",
    },
  ],
};

// ------------------------------------
// COMPONENT
// ------------------------------------
const TestBidForm: React.FC = () => {
  const [form, setForm] = useState<BidFormState>(initialTestState);
  const [numLineItems, setNumLineItems] = useState<string>("2");
  const [lineItems, setLineItems] = useState<LineItem[]>(testLineItemSets[2]);

  // -------------------------
  // FORM CHANGE
  // -------------------------
  const handleFormChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;
    setForm((prev) => ({ ...prev, [id]: value }));
  };

  // -------------------------
  // UPDATE A LINE ITEM
  // -------------------------
  const handleLineItemChange = (
    index: number,
    field: keyof LineItem,
    value: string
  ) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // -------------------------
  // AUTO-BULLET LOGIC
  // -------------------------
  const handleScopeKeyDown = (
    index: number,
    e: KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();

      const current = lineItems[index].scope;
      const cursor = (e.target as HTMLTextAreaElement).selectionStart;

      const before = current.substring(0, cursor);
      const after = current.substring(cursor);

      const updated = before + "\n- " + after;
      handleLineItemChange(index, "scope", updated);

      setTimeout(() => {
        const ta = e.target as HTMLTextAreaElement;
        ta.selectionStart = ta.selectionEnd = cursor + 3;
      }, 0);
    }
  };

  // -------------------------
  // GENERATE PRE-FILLED TEST ITEMS
  // -------------------------
  const generateTestItems = () => {
    const count = parseInt(numLineItems);
    const chosen = testLineItemSets[count] || testLineItemSets[2];
    setLineItems(chosen);
  };

  // -------------------------
  // SUBMIT HANDLER (WEBHOOK)
  // -------------------------
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const preparedLineItems = lineItems.map((item) => ({
      trade: item.trade,
      scope: item.scope
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
      material_labor_included: item.material_labor_included,
      line_total: moneyToNumber(item.line_total),
    }));

    const payload = {
      ...form,
      approx_weeks: Number(form.approx_weeks),
      total_costs: moneyToNumber(form.total_costs),
      deposit_required: moneyToNumber(form.deposit_required),
      weekly_payments: Number(form.weekly_payments),
      final_amount_due: moneyToNumber(form.final_amount_due),
      line_items: preparedLineItems,
    };

    try {
      const res = await fetch(
        "https://astutearc7.app.n8n.cloud/webhook/lastcall-bid",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        alert("Bid submitted successfully!");
      } else {
        alert("Error submitting bid.");
      }
    } catch {
      alert("Network error.");
    }
  };

  // ------------------------------------
  // RENDER
  // ------------------------------------
  return (
    <div className="page-bg bid-form-page">
      <div className="container">
        {/* LOGO */}
        <div className="logo">
          <img src={surosLogo} alt="Suros Logic Systems Logo" />
        </div>

        <h1>
          <b>Last Call Home Solutions LLC</b>
        </h1>

        {/* HEADER INFO */}
        <label>Address:</label>
        <input
          id="company_address"
          value={form.company_address}
          onChange={handleFormChange}
        />

        <label>Phone:</label>
        <input
          id="company_phone"
          value={form.company_phone}
          onChange={handleFormChange}
        />

        <label>Email:</label>
        <input
          id="company_email"
          type="email"
          value={form.company_email}
          onChange={handleFormChange}
        />

        <p style={{ textAlign: "center", marginTop: 10 }}>
          <em>
            “Last call you’ll make for all your contracting and remodeling
            needs.”
          </em>
        </p>

        {/* FORM */}
        <form onSubmit={handleSubmit}>
          {/* INVOICE INFO */}
          <h2>Invoice Information</h2>

          <label>Invoice Date:</label>
          <input
            type="date"
            id="invoice_date"
            value={form.invoice_date}
            onChange={handleFormChange}
          />

          <label>Invoice #:</label>
          <input
            id="invoice_number"
            value={form.invoice_number}
            onChange={handleFormChange}
          />

          {/* PROJECT INFO */}
          <h2>Project & Payment Info</h2>

          <label>Salesperson Name:</label>
          <input
            id="salesperson"
            value={form.salesperson}
            onChange={handleFormChange}
          />

          <label>Job Name or Address:</label>
          <input id="job" value={form.job} onChange={handleFormChange} />

          <label>
            <strong>Payment Terms:</strong>
          </label>
          <textarea
            id="payment_terms"
            rows={2}
            value={form.payment_terms}
            onChange={handleFormChange}
          />

          <label>Approximate Working Weeks:</label>
          <input
            id="approx_weeks"
            type="number"
            value={form.approx_weeks}
            onChange={handleFormChange}
          />

          {/* LINE ITEMS */}
          <h2>Line Items</h2>

          <label>How many line items?</label>
          <input
            type="number"
            min="1"
            max="20"
            value={numLineItems}
            onChange={(e) => setNumLineItems(e.target.value)}
          />

          <button type="button" onClick={generateTestItems}>
            Generate Line Item Sections
          </button>

          <div>
            {lineItems.map((item, index) => (
              <div key={index} className="line-item">
                <h3>{index + 1} LINE ITEM</h3>

                <label>Trade Name:</label>
                <input
                  value={item.trade}
                  onChange={(e) =>
                    handleLineItemChange(index, "trade", e.target.value)
                  }
                />

                <label>Scope of Work:</label>
                <textarea
                  className="scope-input"
                  value={item.scope}
                  onKeyDown={(e) => handleScopeKeyDown(index, e)}
                  onChange={(e) =>
                    handleLineItemChange(index, "scope", e.target.value)
                  }
                />

                <label>Material and Labor Included?</label>
                <select
                  value={item.material_labor_included}
                  onChange={(e) =>
                    handleLineItemChange(
                      index,
                      "material_labor_included",
                      e.target.value
                    )
                  }
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>

                <label>Line Total ($):</label>
                <input
                  value={item.line_total}
                  onChange={(e) =>
                    handleLineItemChange(index, "line_total", e.target.value)
                  }
                />
              </div>
            ))}
          </div>

          {/* CONTINGENCY */}
          <h2>Contingency (10%)</h2>
          <textarea
            id="contingency_coverage"
            rows={3}
            value={form.contingency_coverage}
            onChange={handleFormChange}
          />
          <p>
            <strong>
              CONTINGENCY FUNDS NOT UTILIZED WILL BE RETURNED TO THE CUSTOMER.
            </strong>
          </p>

          {/* TOTALS */}
          <h2>Totals & Payment</h2>

          <label>Total Costs:</label>
          <input
            id="total_costs"
            value={form.total_costs}
            onChange={handleFormChange}
          />

          <label>Deposit Required:</label>
          <input
            id="deposit_required"
            value={form.deposit_required}
            onChange={handleFormChange}
          />

          <label>Weekly Progress Payments × ____:</label>
          <input
            id="weekly_payments"
            type="number"
            value={form.weekly_payments}
            onChange={handleFormChange}
          />

          <label>Final Amount Due Upon Completion:</label>
          <input
            id="final_amount_due"
            value={form.final_amount_due}
            onChange={handleFormChange}
          />

          {/* CUSTOMER INFO */}
          <h2>Customer Info</h2>

          <label>Customer Name:</label>
          <input
            id="customer_name"
            value={form.customer_name}
            onChange={handleFormChange}
          />

          <label>Customer Address:</label>
          <input
            id="customer_address"
            value={form.customer_address}
            onChange={handleFormChange}
          />

          <label>Customer Phone:</label>
          <input
            id="customer_phone"
            value={form.customer_phone}
            onChange={handleFormChange}
          />

          <label>Customer Email:</label>
          <input
            id="customer_email"
            type="email"
            value={form.customer_email}
            onChange={handleFormChange}
          />

          {/* SUBMIT */}
          <div className="submit-area">
            <button type="submit">Generate My Bid</button>
            <p className="powered">POWERED by Suros Logic Systems, LLC</p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TestBidForm;
