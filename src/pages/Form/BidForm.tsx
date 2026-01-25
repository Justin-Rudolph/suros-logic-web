import React, {
    useState,
    ChangeEvent,
    KeyboardEvent,
    FormEvent,
    FocusEvent,
    useEffect
} from "react";

import "./BidForm.css";
import surosLogo from "@/assets/suros-logo-new.png";
import { LineItem, BidFormState } from "./types";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import "@/styles/gradients.css";

type FormErrors = Record<string, boolean>;

// Extend your existing BidFormState without forcing you to edit ./types yet
type ExtendedBidFormState = BidFormState & {
    tax_percentage: string; // e.g. "6%" or "6.5%"
    contingency_percentage: string; // e.g. "10%"
};

const initialFormState: ExtendedBidFormState = {
    company_name: "",
    company_address: "",
    company_phone: "",
    company_email: "",
    company_slogan: "",
    invoice_date: "",
    invoice_number: "",
    salesperson: "",
    job: "",
    payment_terms: "",
    approx_weeks: "",
    contingency_percentage: "",
    contingency_coverage: "",
    tax_percentage: "7",
    total_costs: "",
    deposit_required: "",
    weekly_payments: "",
    customer_name: "",
    customer_address: "",
    customer_phone: "",
    customer_email: "",
};

const placeholderTrades = ["Plumbing", "Drywall", "Electrical", "Flooring"];

const emptyLineItem: LineItem = {
    trade: "",
    scope: "",
    material_labor_included: "Yes",
    line_total: "",
};

const BidForm: React.FC = () => {
    const navigate = useNavigate();
    const { profile, loading } = useAuth();

    const [form, setForm] = useState<ExtendedBidFormState>(initialFormState);
    const [numLineItems, setNumLineItems] = useState("");
    const [lineItems, setLineItems] = useState<LineItem[]>([]);
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

    /** --------------------------------------------------
     * AUTO-LOAD USER PROFILE INTO COMPANY FIELDS
     ---------------------------------------------------*/
    useEffect(() => {
        if (!profile) return;

        setForm((prev) => ({
            ...prev,
            company_name: profile.companyName ?? prev.company_name,
            company_address: profile.companyAddress ?? prev.company_address,
            company_phone: profile.phone ?? prev.company_phone,
            company_email: profile.email ?? prev.company_email,
            company_slogan: profile.slogan ?? prev.company_slogan,
        }));

        // Clear any validation errors for these fields once we auto-populate
        setErrors((prev) => ({
            ...prev,
            company_name: false,
            company_address: false,
            company_phone: false,
            company_email: false,
            company_slogan: false,
        }));
    }, [profile]);

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


    const formatPercent = (raw: string) => {
        const cleaned = raw.replace(/[^0-9.]/g, "");
        if (!cleaned) return "";
        return `${cleaned}%`;
    };

    /** -------------------------------
     * AUTO CALCULATE TOTAL COSTS (subtotal + contingency + tax)
     --------------------------------*/
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
    const weeklyCount = Number(String(form.weekly_payments).replace(/[^0-9]/g, "")) || 0;

    const remainingAfterDeposit = totalWithExtras - depositAmount;

    const weeklyAmount =
        weeklyCount > 0 && remainingAfterDeposit > 0
            ? remainingAfterDeposit / weeklyCount
            : 0;

    useEffect(() => {
        // keep total_costs always in sync with line items + contingency + tax
        setForm((prev) => ({
            ...prev,
            total_costs: totalWithExtras > 0 ? formatDollarWithCommas(Math.round(totalWithExtras)) : "",
        }));

        // clear "total_costs" error once it becomes computed
        if (totalWithExtras > 0) {
            setErrors((prev) => ({ ...prev, total_costs: false }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lineItems, form.tax_percentage, form.contingency_percentage]);

    /** -------------------------------
     * FORM CHANGE HANDLER
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

        // weekly payments = number only (count of weeks/payments)
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
     * GENERATE LINE ITEMS
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

        const items = Array.from({ length: count }, () => ({
            ...emptyLineItem,
        }));

        setLineItems(items);

        // Clear line item validation errors when re-generating
        setErrors((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((k) => {
                if (k.startsWith("line_")) delete next[k];
            });
            return next;
        });

        // if they generate line items, clear the "missing line items" error
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
            prev.map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            )
        );

        // clear specific line-item error on change
        const key = `line_${field}_${index}`;
        setErrors((prev) => ({ ...prev, [key]: false }));
    };

    /** -------------------------------
     * BULLET LIST BEHAVIOR
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
     * EMAIL VALIDATION (format check only)
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
     * REQUIRED FIELD VALIDATION
     --------------------------------*/
    const validateForm = () => {
        const newErrors: FormErrors = {};

        const req = (key: keyof ExtendedBidFormState) => {
            if (!String(form[key] ?? "").trim()) newErrors[String(key)] = true;
        };

        // All form fields required (as requested)
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

        // total_costs is required but computed; still enforce existence
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
     * SUBMIT FORM
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
            tax_percentage: taxPct,
            contingency_percentage: contingencyPct,
            tax_amount: taxAmount,
            contingency_amount: contingencyAmount,
            approx_weeks: form.approx_weeks,
            total_costs: convertMoney(form.total_costs),
            deposit_required: convertMoney(form.deposit_required),
            weekly_payments: weeklyCount,
            weekly_amount: weeklyAmount,
            line_items: preparedLineItems,
            subtotal: subtotal,
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
                setForm(initialFormState);
                setLineItems([]);
                setNumLineItems("");
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
        (loading || !profile) ?
            < div className="suros-gradient" >
                <div
                    style={{
                        padding: "40px",
                        color: "#fff",
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "16px",
                    }}
                >
                    <div>Loading company profile info for your form…</div>

                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            background: "#1e73be",
                            color: "#fff",
                            padding: "10px 22px",
                            borderRadius: "6px",
                            border: "none",
                            fontSize: "15px",
                            fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        Refresh
                    </button>
                </div>
            </div >
            :
            <div className="suros-gradient">
                <div className="bid-form-page">
                    {/* 🔙 BACK BUTTON */}
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
                            zIndex: 10
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

                            {/* HEADER INFO */}
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

                                {/* company_slogan is required but displayed as text */}
                                {isInvalid("company_slogan") && (
                                    <div className="field-error-text">Company slogan is required.</div>
                                )}
                                {isInvalid("company_name") && (
                                    <div className="field-error-text">Company name is required.</div>
                                )}
                            </div>

                            {/* FULL FORM */}
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
                                    placeholder="SLS-2026-1178"
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
                                    placeholder="John Doe"
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

                                <label><strong>Payment Terms:</strong></label>
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
                                                    className={isInvalid(`line_trade_${index}`) ? "input-error" : ""}
                                                />

                                                <label>Scope of Work (one per line):</label>
                                                <textarea
                                                    className={
                                                        `scope-input ${isInvalid(`line_scope_${index}`) ? "input-error" : ""}`
                                                    }
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
                                                    className={isInvalid(`line_line_total_${index}`) ? "input-error" : ""}
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
                                            className={isInvalid("contingency_percentage") ? "input-error" : ""}
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
                                            placeholder="6"
                                            className={`${isInvalid("tax_percentage") ? "input-error" : ""} input-readonly`}
                                        />
                                        <span className="percent-suffix">%</span>
                                    </div>

                                    <div className="tax-amount text-black">
                                        {subtotal > 0 && taxPct > 0
                                            ? `${formatDollarWithCommas(Math.round(taxAmount))} in taxes`
                                            : ""}
                                    </div>
                                </div>

                                <label>Total Costs (Line Items + Contingency + Tax):</label>
                                <input
                                    type="text"
                                    id="total_costs"
                                    value={form.total_costs}
                                    readOnly
                                    className={`${isInvalid("total_costs") ? "input-error" : ""} input-readonly`}
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
                                        value={form.weekly_payments}
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

export default BidForm;
