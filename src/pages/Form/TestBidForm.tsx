import React, {
  useState,
  ChangeEvent,
  KeyboardEvent,
  FormEvent,
  FocusEvent,
  useEffect,
} from "react";

import "./BidForm.css";
import surosLogo from "@/assets/suros-logo-new.png";
import { useNavigate } from "react-router-dom";
import "@/styles/gradients.css";

/* ======================================================
   TYPES (MATCHES PROD STYLE, BUT KEEPS TEST DATA)
====================================================== */
type FormErrors = Record<string, boolean>;

interface LineItem {
  trade: string;
  scope: string;
  material_labor_included: "Yes" | "No";
  line_total: string;
}

// Base fields from your test form (kept)
interface BidFormState {
  company_name: string;
  company_slogan: string;
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
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  customer_email: string;

  // This existed in your original test state.
  // We keep it in state/payload to preserve mock data,
  // but the UI mirrors the FIRST (prod) snippet (no final due input).
  final_amount_due?: string;
}

// Extend like prod (tax/contingency %)
type ExtendedBidFormState = BidFormState & {
  tax_percentage: string; // numeric string (e.g., "7")
  contingency_percentage: string; // numeric string (e.g., "10")
};

/* ======================================================
   INITIAL FILLED TEST DATA (KEPT)
====================================================== */
const initialTestState: ExtendedBidFormState = {
  company_name: "Last Call Home Solutions LLC",
  company_slogan:
    "Last call you’ll make for all your contracting and remodeling needs.",
  company_address: "4829 Rolling Brook Dr, Tampa, FL 33625",
  company_phone: "(813) 555-9082",
  company_email: "email@lastcallhomesolutions.com",
  invoice_date: "2025-11-28",
  invoice_number: "LC-2025-1178",
  salesperson: "Dennis Call",
  job: "Kitchen Remodel – 2290 Maple Ridge Ct, Tampa FL",
  payment_terms:
    "50% deposit required before work begins. Weekly progress payments due every Friday. Final amount due upon project completion.",
  approx_weeks: 5,

  // PROD has both % + coverage
  contingency_percentage: "10",
  contingency_coverage:
    "Covers miscellaneous materials, unexpected repairs, hardware replacements, drywall patching, plumbing seals, tile work, and fixture adjustments.",

  // PROD has readOnly tax field (you had 7% in prod)
  tax_percentage: "7",

  // total_costs is computed in prod; we keep your mock value as initial,
  // but it will auto-sync once line items render.
  total_costs: "$18,750",

  deposit_required: "$9,375",
  weekly_payments: 4,

  // Kept (not shown in UI, but stays in payload)
  final_amount_due: "$1,875",

  customer_name: "Michael Thompson",
  customer_address: "2290 Maple Ridge Ct, Tampa FL 33625",
  customer_phone: "(813) 445-7710",
  customer_email: "michael.thompson@example.com",
};

/* ======================================================
   TEST LINE ITEM SETS (KEPT)
====================================================== */
// 🔽 ONLY CHANGE IS THE ADDED "6" PRESET BELOW 🔽

const testLineItemSets: Record<number, LineItem[]> = {
  2: [
    {
      trade: "Plumbing",
      scope: `- Disconnect old plumbing
- Install new PEX water lines
- Replace garbage disposal
- Install new shutoff valves`,
      line_total: "$5,200",
      material_labor_included: "Yes",
    },
    {
      trade: "Drywall",
      scope: `- Remove damaged drywall
- Install new 1/2" drywall
- Tape and mud seams
- Sand and prep for paint`,
      line_total: "$4,100",
      material_labor_included: "Yes",
    },
  ],

  3: [
    {
      trade: "Electrical",
      scope: `- Add recessed lighting
- Install two GFCI outlets
- Replace breaker for kitchen circuit`,
      line_total: "$2,600",
      material_labor_included: "Yes",
    },
    {
      trade: "Flooring",
      scope: `- Remove old tile
- Install new LVP flooring
- Add new baseboards`,
      line_total: "$4,800",
      material_labor_included: "Yes",
    },
    {
      trade: "Painting",
      scope: `- Prime all walls
- Apply two coats interior paint
- Paint trim and baseboards`,
      line_total: "$2,300",
      material_labor_included: "Yes",
    },
  ],

  4: [
    {
      trade: "Demolition",
      scope: `- Remove cabinetry
- Remove countertops
- Dispose of debris`,
      line_total: "$1,800",
      material_labor_included: "Yes",
    },
    {
      trade: "Cabinet Installation",
      scope: `- Install RTA cabinets
- Level and secure bases
- Hang uppers`,
      line_total: "$6,200",
      material_labor_included: "Yes",
    },
    {
      trade: "Countertops",
      scope: `- Template for quartz slabs
- Install quartz countertops
- Seal and finish`,
      line_total: "$5,400",
      material_labor_included: "Yes",
    },
    {
      trade: "Backsplash",
      scope: `- Install subway tile
- Apply grout
- Seal tile and grout`,
      line_total: "$2,200",
      material_labor_included: "Yes",
    },
  ],

  5: [
    {
      trade: "Appliance Installation",
      scope: `- Install refrigerator
- Install dishwasher & connect water line
- Install over-the-range microwave
- Test all electrical and water connections`,
      line_total: "$1,500",
      material_labor_included: "Yes",
    },
    {
      trade: "Interior Painting",
      scope: `- Patch wall imperfections
- Apply primer to all walls
- Apply two coats interior paint
- Paint trim and baseboards`,
      line_total: "$2,800",
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
      line_total: "$4,200",
      material_labor_included: "Yes",
    },
    {
      trade: "Final Cleanup",
      scope: `- Remove all debris
- Clean floors and surfaces
- Final walkthrough prep`,
      line_total: "$850",
      material_labor_included: "Yes",
    },
  ],

  // 🆕 NEW 6-LINE-ITEM PRESET
  6: [
    {
      trade: "Demolition",
      scope: `- Remove existing cabinetry
- Remove countertops
- Dispose of debris`,
      line_total: "$1,700",
      material_labor_included: "Yes",
    },
    {
      trade: "Framing",
      scope: `- Frame new wall sections
- Adjust doorway openings
- Reinforce load points`,
      line_total: "$2,300",
      material_labor_included: "Yes",
    },
    {
      trade: "Electrical",
      scope: `- Add recessed lighting
- Install dedicated appliance circuits
- Replace breaker`,
      line_total: "$2,900",
      material_labor_included: "Yes",
    },
    {
      trade: "Plumbing",
      scope: `- Install new supply lines
- Replace drain lines
- Pressure test system`,
      line_total: "$3,100",
      material_labor_included: "Yes",
    },
    {
      trade: "Cabinet Installation",
      scope: `- Install base and upper cabinets
- Level and secure
- Install hardware`,
      line_total: "$5,800",
      material_labor_included: "Yes",
    },
    {
      trade: "Final Finishes",
      scope: `- Install trim
- Touch-up paint
- Final cleanup and walkthrough`,
      line_total: "$1,400",
      material_labor_included: "Yes",
    },
  ],
  // 🆕 10-LINE-ITEM PRESET (LARGE / FULL REMODEL)
  10: [
    {
      trade: "Demolition",
      scope: `- Remove existing cabinetry
- Remove countertops
- Remove flooring
- Haul away debris`,
      line_total: "$2,400",
      material_labor_included: "Yes",
    },
    {
      trade: "Framing",
      scope: `- Frame new wall sections
- Modify openings
- Reinforce structural points`,
      line_total: "$3,100",
      material_labor_included: "Yes",
    },
    {
      trade: "Electrical",
      scope: `- Install recessed lighting
- Add appliance circuits
- Replace breakers
- Code compliance check`,
      line_total: "$4,200",
      material_labor_included: "Yes",
    },
    {
      trade: "Plumbing Rough-In",
      scope: `- Replace supply lines
- Replace drain lines
- Pressure test system`,
      line_total: "$3,600",
      material_labor_included: "Yes",
    },
    {
      trade: "HVAC Adjustments",
      scope: `- Reroute ductwork
- Install new vents
- Balance airflow`,
      line_total: "$2,800",
      material_labor_included: "Yes",
    },
    {
      trade: "Drywall",
      scope: `- Hang new drywall
- Tape and mud seams
- Sand smooth`,
      line_total: "$3,400",
      material_labor_included: "Yes",
    },
    {
      trade: "Cabinet Installation",
      scope: `- Install base cabinets
- Install uppers
- Level and secure
- Install hardware`,
      line_total: "$6,900",
      material_labor_included: "Yes",
    },
    {
      trade: "Countertops",
      scope: `- Template quartz
- Install slabs
- Seal and finish`,
      line_total: "$5,700",
      material_labor_included: "Yes",
    },
    {
      trade: "Flooring",
      scope: `- Install underlayment
- Lay flooring material
- Install baseboards`,
      line_total: "$4,300",
      material_labor_included: "Yes",
    },
    {
      trade: "Final Finishes & Cleanup",
      scope: `- Touch-up paint
- Install trim
- Final walkthrough
- Job site cleanup`,
      line_total: "$2,200",
      material_labor_included: "Yes",
    },
  ],
};


const placeholderTrades = ["Plumbing", "Drywall", "Electrical", "Flooring"];

const emptyLineItem: LineItem = {
  trade: "",
  scope: "",
  material_labor_included: "Yes",
  line_total: "",
};

/* ======================================================
   COMPONENT (MATCHES PROD UX + VALIDATION)
====================================================== */
const TestBidForm: React.FC = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState<ExtendedBidFormState>(initialTestState);
  const [numLineItems, setNumLineItems] = useState<string>("2");
  const [lineItems, setLineItems] = useState<LineItem[]>(
    testLineItemSets[2] ?? []
  );
  const [errors, setErrors] = useState<FormErrors>({});

  const isInvalid = (key: string) => !!errors[key];

  type ModalType = "success" | "error" | "warning" | "info";

  const [modal, setModal] = useState<{
    open: boolean;
    type: ModalType;
    title: string;
    message: string;
  }>({
    open: false,
    type: "info",
    title: "",
    message: "",
  });

  const showModal = (
    type: ModalType,
    title: string,
    message: string
  ) => {
    setModal({ open: true, type, title, message });
  };

  /** -------------------------------
   * FORMAT PHONE FIELD
   --------------------------------*/
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").substring(0, 10);
    const len = digits.length;

    if (len < 4) return digits;
    if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  /** -------------------------------
   * FORMAT DOLLAR INPUT ($ + commas only)
   --------------------------------*/
  const formatDollarWithCommas = (value: string | number) => {
    const digits = String(value).replace(/\D/g, "");
    if (!digits) return "";
    const number = Number(digits);
    return `$${number.toLocaleString("en-US")}`;
  };

  const parseMoney = (value: string | number) =>
    Number(String(value).replace(/[^0-9]/g, "")) || 0;

  const parsePercent = (value: string) =>
    Number(value.replace(/[^0-9.]/g, "")) || 0;

  /** --------------------------------------------------
   * AUTO CALCULATE TOTAL COSTS (subtotal + contingency + tax)
   ---------------------------------------------------*/
  const subtotal = lineItems.reduce(
    (sum, item) => sum + parseMoney(item.line_total),
    0
  );

  const taxPct = parsePercent(form.tax_percentage);
  const contingencyPct = parsePercent(form.contingency_percentage);

  const taxAmount = subtotal * (taxPct / 100);
  const contingencyAmount = subtotal * (contingencyPct / 100);

  const totalWithExtras = subtotal + taxAmount + contingencyAmount;

  const depositAmount = parseMoney(form.deposit_required);
  const weeklyCount =
    Number(String(form.weekly_payments).replace(/[^0-9]/g, "")) || 0;

  const remainingAfterDeposit = totalWithExtras - depositAmount;

  const weeklyAmount =
    weeklyCount > 0 && remainingAfterDeposit > 0
      ? remainingAfterDeposit / weeklyCount
      : 0;

  useEffect(() => {
    // keep total_costs always in sync with line items + contingency + tax (prod behavior)
    setForm((prev) => ({
      ...prev,
      total_costs:
        totalWithExtras > 0
          ? formatDollarWithCommas(Math.round(totalWithExtras))
          : "",
    }));

    // clear "total_costs" error once it becomes computed
    if (totalWithExtras > 0) {
      setErrors((prev) => ({ ...prev, total_costs: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItems, form.tax_percentage, form.contingency_percentage]);

  /** -------------------------------
   * FORM CHANGE HANDLER (prod rules)
   --------------------------------*/
  const handleFormChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;

    // clear error as soon as user edits the field
    setErrors((prev) => ({ ...prev, [id]: false }));

    // phones
    if (id === "company_phone" || id === "customer_phone") {
      setForm((prev) => ({ ...prev, [id]: formatPhone(value) }));
      return;
    }

    // percents (contingency editable; tax readOnly below)
    if (id === "tax_percentage" || id === "contingency_percentage") {
      const cleaned = value.replace(/[^0-9.]/g, "");
      setForm((prev) => ({ ...prev, [id]: cleaned }));
      return;
    }

    // money fields ($ + commas)
    if (id === "deposit_required") {
      setForm((prev) => ({ ...prev, [id]: formatDollarWithCommas(value) }));
      return;
    }

    // weekly payments = number only
    if (id === "weekly_payments") {
      const cleaned = value.replace(/[^0-9]/g, "");
      setForm((prev) => ({ ...prev, weekly_payments: cleaned }));
      return;
    }

    // ignore attempts to edit computed total_costs
    if (id === "total_costs") return;

    // default
    setForm((prev) => ({ ...prev, [id]: value }));
  };

  /** -------------------------------
   * GENERATE LINE ITEMS (prod behavior, but uses test sets)
   --------------------------------*/
  const handleGenerateLineItems = () => {
    const count = parseInt(numLineItems);

    if (!count || count < 1) {
      showModal(
        "warning",
        "Invalid Line Item Count",
        "Please enter a valid number of line items before generating sections."
      );
      return;
    }

    // Use your test preset if available; otherwise fall back to empty items
    const chosenPreset = testLineItemSets[count];
    const items = chosenPreset
      ? chosenPreset.map((x) => ({ ...x }))
      : Array.from({ length: count }, () => ({ ...emptyLineItem }));

    setLineItems(items);

    // Clear line item validation errors when re-generating
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith("line_")) delete next[k];
      });
      return next;
    });

    // clear missing line items error
    setErrors((prev) => ({ ...prev, line_items_missing: false }));
  };

  /** -------------------------------
   * LINE ITEM CHANGE
   --------------------------------*/
  const handleLineItemChange = (
    index: number,
    field: keyof LineItem,
    value: string
  ) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );

    // clear specific line-item error on change
    const key = `line_${field}_${index}`;
    setErrors((prev) => ({ ...prev, [key]: false }));
  };

  /** -------------------------------
   * BULLET LIST BEHAVIOR (prod)
   --------------------------------*/
  const handleScopeKeyDown = (
    index: number,
    e: KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();

      const current = lineItems[index].scope;
      const cursorPos = (e.target as HTMLTextAreaElement).selectionStart;

      const before = current.substring(0, cursorPos);
      const after = current.substring(cursorPos);

      const newValue = before + "\n- " + after;
      handleLineItemChange(index, "scope", newValue);

      setTimeout(() => {
        const textarea = e.target as HTMLTextAreaElement;
        textarea.selectionStart = cursorPos + 3;
        textarea.selectionEnd = cursorPos + 3;
      }, 0);
    }
  };

  const handleScopeChange = (
    index: number,
    e: ChangeEvent<HTMLTextAreaElement>
  ) => {
    let value = e.target.value;

    if (lineItems[index].scope === "" && value.length === 1) {
      value = "- " + value;
    }

    handleLineItemChange(index, "scope", value);
  };

  /** -------------------------------
   * EMAIL VALIDATION (prod)
   --------------------------------*/
  const validateEmail = (e: FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value) return;

    const valid = /\S+@\S+\.\S+/.test(value);
    if (!valid) {
      showModal(
        "warning",
        "Invalid Email Address",
        "Please enter a valid email address so we can deliver your bid."
      );
    }
  };

  /** -------------------------------
   * REQUIRED FIELD VALIDATION (prod-style)
   --------------------------------*/
  const validateForm = () => {
    const newErrors: FormErrors = {};

    const req = (key: keyof ExtendedBidFormState) => {
      if (!String(form[key] ?? "").trim()) newErrors[String(key)] = true;
    };

    // All form fields required (matching prod snippet)
    req("company_name");
    req("company_address");
    req("company_phone");
    req("company_email");
    req("company_slogan");
    req("invoice_date");
    req("invoice_number");
    req("salesperson");
    req("job");
    req("payment_terms");
    req("approx_weeks");

    // Contingency fields required
    req("contingency_percentage");
    req("contingency_coverage");

    // Tax field required
    req("tax_percentage");

    // total_costs required but computed
    req("total_costs");

    req("deposit_required");
    req("weekly_payments");
    req("customer_name");
    req("customer_address");
    req("customer_phone");
    req("customer_email");

    // Line items required: must exist AND each one must be complete
    if (!lineItems.length) {
      newErrors["line_items_missing"] = true;
    } else {
      lineItems.forEach((li, idx) => {
        if (!String(li.trade ?? "").trim()) newErrors[`line_trade_${idx}`] = true;
        if (!String(li.scope ?? "").trim()) newErrors[`line_scope_${idx}`] = true;
        if (!String(li.material_labor_included ?? "").trim())
          newErrors[`line_material_labor_included_${idx}`] = true;
        if (!String(li.line_total ?? "").trim()) newErrors[`line_line_total_${idx}`] = true;
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /** -------------------------------
   * SUBMIT FORM (prod payload pattern + keeps your test fields)
   --------------------------------*/
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showModal(
        "warning",
        "Incomplete Form",
        "Please complete all required fields before submitting your bid."
      );
      return;
    }

    const convertMoney = (v: string | number) =>
      Number(String(v).replace(/[^0-9]/g, "")) || 0;

    const preparedLineItems = lineItems.map((item) => ({
      trade: item.trade,
      scope: item.scope.split(/\r?\n/).filter(Boolean),
      material_labor_included: item.material_labor_included,
      line_total: convertMoney(item.line_total),
    }));

    const payload = {
      ...form,

      // numeric fields like prod payload
      tax_percentage: taxPct,
      contingency_percentage: contingencyPct,
      tax_amount: taxAmount,
      contingency_amount: contingencyAmount,
      approx_weeks: form.approx_weeks,

      // computed totals
      subtotal: subtotal,
      total_costs: convertMoney(form.total_costs),
      deposit_required: convertMoney(form.deposit_required),
      weekly_payments: weeklyCount,
      weekly_amount: weeklyAmount,

      // keep your test-only field in payload if present
      final_amount_due: form.final_amount_due
        ? convertMoney(form.final_amount_due)
        : undefined,

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
        showModal(
          "success",
          "Bid Submitted Successfully",
          `
          Your bid is being generated now.<br/><br/>
          Please check your inbox shortly — delivery typically takes a few minutes while we finalize the document and send it over.
          `
        );
        // keep test behavior: reset back to mock defaults & initial 2 items
        setForm(initialTestState);
        setLineItems(testLineItemSets[2] ?? []);
        setNumLineItems("2");
        setErrors({});
      } else {
        showModal(
          "error",
          "Submission Failed",
          "We ran into an issue while submitting your bid. Please try again in a moment."
        );
      }
    } catch (err) {
      showModal(
        "error",
        "Network Error",
        "We could not connect to our servers. Please check your connection and try again."
      );
    }
  };

  return (
    <div className="suros-gradient">
      <div className="bid-form-page">
        {/* 🔙 BACK BUTTON (same as prod snippet) */}
        <button
          onClick={() => navigate("/dashboard")}
          style={{
            position: "fixed",
            top: "20px",
            left: "20px",
            background: "#1e73be",
            color: "#fff",
            padding: "10px 18px",
            fontSize: "15px",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 600,
            border: "none",
            zIndex: 10,
          }}
        >
          ← Back
        </button>

        <div className="page-bg">
          <div className="container">
            <div className="logo">
              <img src={surosLogo} alt="Suros Logic Systems Logo" />
            </div>

            <h1>
              <b>{form.company_name}</b>
            </h1>

            {/* HEADER INFO (matches prod snippet) */}
            <div className="header-info">
              <label>Address:</label>
              <input
                type="text"
                id="company_address"
                value={form.company_address}
                onChange={handleFormChange}
                className={isInvalid("company_address") ? "input-error" : ""}
              />

              <label>Phone:</label>
              <input
                type="text"
                id="company_phone"
                value={form.company_phone}
                onChange={handleFormChange}
                className={isInvalid("company_phone") ? "input-error" : ""}
              />

              <label>Email:</label>
              <input
                type="email"
                id="company_email"
                value={form.company_email}
                onChange={handleFormChange}
                onBlur={validateEmail}
                className={isInvalid("company_email") ? "input-error" : ""}
              />

              <p className="slogan">{form.company_slogan}</p>

              {isInvalid("company_slogan") && (
                <div className="field-error-text">Company slogan is required.</div>
              )}
              {isInvalid("company_name") && (
                <div className="field-error-text">Company name is required.</div>
              )}
            </div>

            {/* FULL FORM (matches prod snippet) */}
            <form onSubmit={handleSubmit}>
              {/* INVOICE INFO */}
              <h2>Invoice Information</h2>

              <label>Invoice Date:</label>
              <input
                type="date"
                id="invoice_date"
                value={form.invoice_date}
                onChange={handleFormChange}
                className={isInvalid("invoice_date") ? "input-error" : ""}
              />

              <label>Invoice #:</label>
              <input
                type="text"
                id="invoice_number"
                placeholder="LC-2025-1178"
                value={form.invoice_number}
                onChange={handleFormChange}
                className={isInvalid("invoice_number") ? "input-error" : ""}
              />

              {/* CUSTOMER INFO */}
              <h2>Customer Info</h2>

              <label>Customer Name:</label>
              <input
                type="text"
                id="customer_name"
                value={form.customer_name}
                onChange={handleFormChange}
                placeholder="John Doe"
                className={isInvalid("customer_name") ? "input-error" : ""}
              />

              <label>Customer Address:</label>
              <input
                type="text"
                id="customer_address"
                value={form.customer_address}
                onChange={handleFormChange}
                placeholder="1234 Main St, Tampa FL"
                className={isInvalid("customer_address") ? "input-error" : ""}
              />

              <label>Customer Phone:</label>
              <input
                type="text"
                id="customer_phone"
                value={form.customer_phone}
                onChange={handleFormChange}
                placeholder="(000) 000-0000"
                className={isInvalid("customer_phone") ? "input-error" : ""}
              />

              <label>Customer Email:</label>
              <input
                type="email"
                id="customer_email"
                value={form.customer_email}
                onChange={handleFormChange}
                onBlur={validateEmail}
                placeholder="example@email.com"
                className={isInvalid("customer_email") ? "input-error" : ""}
              />

              {/* PROJECT */}
              <h2>Project & Payment Info</h2>

              <label>Salesperson Name:</label>
              <input
                type="text"
                id="salesperson"
                placeholder="Dennis Call"
                value={form.salesperson}
                onChange={handleFormChange}
                className={isInvalid("salesperson") ? "input-error" : ""}
              />

              <label>Job Name or Address:</label>
              <input
                type="text"
                id="job"
                placeholder="Kitchen Remodel, Tampa FL"
                value={form.job}
                onChange={handleFormChange}
                className={isInvalid("job") ? "input-error" : ""}
              />

              <label>
                <strong>Payment Terms:</strong>
              </label>
              <textarea
                id="payment_terms"
                rows={2}
                value={form.payment_terms}
                onChange={handleFormChange}
                placeholder="Deposit of 50% prior to work commencing and weekly progress payments."
                className={isInvalid("payment_terms") ? "input-error" : ""}
              ></textarea>

              <label>Approximate Working Weeks:</label>
              <input
                type="text"
                id="approx_weeks"
                value={form.approx_weeks}
                onChange={handleFormChange}
                placeholder="4 - 6"
                className={isInvalid("approx_weeks") ? "input-error" : ""}
              />

              {/* LINE ITEMS */}
              <h2>Line Items</h2>

              <label>How many line items (trades)?</label>
              <input
                type="number"
                id="num_line_items"
                min={1}
                max={20}
                value={numLineItems}
                onChange={(e) => {
                  setNumLineItems(e.target.value);
                  setErrors((prev) => ({ ...prev, line_items_missing: false }));
                }}
                className={isInvalid("line_items_missing") ? "input-error" : ""}
              />

              <button type="button" onClick={handleGenerateLineItems}>
                Generate Line Item Sections
              </button>

              {isInvalid("line_items_missing") && (
                <div className="field-error-text">
                  Please generate at least one line item.
                </div>
              )}

              <div id="lineItemsContainer">
                {lineItems.map((item, index) => {
                  const placeholderTrade =
                    placeholderTrades[index % placeholderTrades.length];

                  return (
                    <div key={index} className="line-item">
                      <h3>{index + 1} LINE ITEM</h3>

                      <label>Trade Name:</label>
                      <input
                        type="text"
                        placeholder={placeholderTrade}
                        value={item.trade}
                        onChange={(e) =>
                          handleLineItemChange(index, "trade", e.target.value)
                        }
                        className={
                          isInvalid(`line_trade_${index}`) ? "input-error" : ""
                        }
                      />

                      <label>Scope of Work (one per line):</label>
                      <textarea
                        className={`scope-input ${isInvalid(`line_scope_${index}`) ? "input-error" : ""
                          }`}
                        placeholder="- Enter one task per line"
                        value={item.scope}
                        onChange={(e) => handleScopeChange(index, e)}
                        onKeyDown={(e) => handleScopeKeyDown(index, e)}
                      ></textarea>

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
                        className={
                          isInvalid(`line_material_labor_included_${index}`)
                            ? "input-error"
                            : ""
                        }
                      >
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>

                      <label>Line Total ($):</label>
                      <input
                        type="text"
                        placeholder="$"
                        value={item.line_total}
                        onChange={(e) =>
                          handleLineItemChange(
                            index,
                            "line_total",
                            formatDollarWithCommas(e.target.value)
                          )
                        }
                        className={
                          isInvalid(`line_line_total_${index}`)
                            ? "input-error"
                            : ""
                        }
                      />
                    </div>
                  );
                })}
              </div>

              {/* CONTINGENCY */}
              <h2>Contingency</h2>

              <label>Contingency (%):</label>
              <div className="tax-row">
                <div className="percent-input-wrapper">
                  <input
                    type="text"
                    id="contingency_percentage"
                    value={form.contingency_percentage}
                    onChange={handleFormChange}
                    placeholder="10"
                    className={
                      isInvalid("contingency_percentage") ? "input-error" : ""
                    }
                  />
                  <span className="percent-suffix">%</span>
                </div>

                <div className="tax-amount text-black">
                  {subtotal > 0 && contingencyPct > 0
                    ? `${formatDollarWithCommas(
                      Math.round(contingencyAmount)
                    )} contingency`
                    : ""}
                </div>
              </div>

              <textarea
                id="contingency_coverage"
                rows={3}
                value={form.contingency_coverage}
                onChange={handleFormChange}
                placeholder="Covers miscellaneous materials and unexpected repairs..."
                className={isInvalid("contingency_coverage") ? "input-error" : ""}
              ></textarea>

              <p className="contingency-warning">
                <strong>
                  CONTINGENCY FUNDS NOT UTILIZED WILL BE RETURNED TO THE CUSTOMER.
                </strong>
              </p>

              {/* TOTALS */}
              <h2>Totals & Payment</h2>

              {/* TAX (%) FIELD */}
              <label>Tax (%):</label>
              <div className="tax-row">
                <div className="percent-input-wrapper">
                  <input
                    type="text"
                    id="tax_percentage"
                    value={form.tax_percentage}
                    readOnly
                    placeholder="7"
                    className={`${isInvalid("tax_percentage") ? "input-error" : ""
                      } input-readonly`}
                  />
                  <span className="percent-suffix">%</span>
                </div>

                <div className="tax-amount text-black">
                  {subtotal > 0 && taxPct > 0
                    ? `${formatDollarWithCommas(
                      Math.round(taxAmount)
                    )} in taxes`
                    : ""}
                </div>
              </div>

              <label>Total Costs (Line Items + Contingency + Tax):</label>
              <input
                type="text"
                id="total_costs"
                value={form.total_costs}
                readOnly
                className={`${isInvalid("total_costs") ? "input-error" : ""
                  } input-readonly`}
                placeholder="$"
              />

              <label>Deposit Required:</label>
              <input
                type="text"
                id="deposit_required"
                value={form.deposit_required}
                onChange={handleFormChange}
                placeholder="$"
                className={isInvalid("deposit_required") ? "input-error" : ""}
              />

              <label>Weekly Progress Payments:</label>
              <div className="tax-row">
                <input
                  type="text"
                  id="weekly_payments"
                  value={String(form.weekly_payments)}
                  onChange={handleFormChange}
                  placeholder="3"
                  className={isInvalid("weekly_payments") ? "input-error" : ""}
                />

                <div className="tax-amount text-black">
                  {weeklyAmount > 0
                    ? `${formatDollarWithCommas(Math.round(weeklyAmount))}/week`
                    : ""}
                </div>
              </div>

              {/* SUBMIT */}
              <div className="submit-area">
                <button type="submit">Generate My Bid</button>
                <p className="powered">POWERED by Suros Logic Systems, LLC</p>
              </div>
            </form>
          </div>
        </div>
      </div>
      {/* ✅ GLOBAL MODAL */}
      {modal.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "480px",
              padding: "28px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
              textAlign: "center",
            }}
          >
            <h2 style={{ marginBottom: "12px", color: "#000", fontWeight: "bold" }}>
              {modal.type === "success" && "✅ "}
              {modal.type === "error" && "❌ "}
              {modal.type === "warning" && "⚠️ "}
              {modal.type === "info" && "ℹ️ "}
              {modal.title}
            </h2>

            <p
              style={{ color: "#000", lineHeight: 1.6, marginBottom: "22px" }}
              dangerouslySetInnerHTML={{ __html: modal.message }}
            />

            <button
              onClick={() => setModal((m) => ({ ...m, open: false }))}
              style={{
                background:
                  modal.type === "success"
                    ? "#1e73be"
                    : modal.type === "error"
                      ? "#c0392b"
                      : "#1e73be",
                color: "#fff",
                padding: "10px 22px",
                borderRadius: "6px",
                border: "none",
                fontSize: "15px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestBidForm;
