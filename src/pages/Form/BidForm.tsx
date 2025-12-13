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


const initialFormState: BidFormState = {
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
    contingency_coverage: "",
    total_costs: "",
    deposit_required: "",
    weekly_payments: "",
    final_amount_due: "",
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
    const { profile } = useAuth();

    const [form, setForm] = useState<BidFormState>(initialFormState);
    const [numLineItems, setNumLineItems] = useState("");
    const [lineItems, setLineItems] = useState<LineItem[]>([]);

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
     * FORMAT MONEY
     --------------------------------*/
    const formatMoney = (value: string) => {
        const raw = value.replace(/[^0-9.]/g, "");
        if (!raw) return "";

        const num = Number(raw);
        if (isNaN(num)) return "";

        return num.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
        });
    };

    const handleMoneyChange = (id: string, value: string) => {
        const formatted = formatMoney(value);
        setForm((prev) => ({ ...prev, [id]: formatted }));
    };

    /** -------------------------------
     * FORM CHANGE HANDLER
     --------------------------------*/
    const handleFormChange = (
        e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { id, value } = e.target;

        if (id === "company_phone" || id === "customer_phone") {
            setForm((prev) => ({ ...prev, [id]: formatPhone(value) }));
            return;
        }

        if (
            id === "total_costs" ||
            id === "deposit_required" ||
            id === "weekly_payments" ||
            id === "final_amount_due"
        ) {
            handleMoneyChange(id, value);
            return;
        }

        setForm((prev) => ({ ...prev, [id]: value }));
    };

    /** -------------------------------
     * GENERATE LINE ITEMS
     --------------------------------*/
    const handleGenerateLineItems = () => {
        const count = parseInt(numLineItems);
        if (!count || count < 1) {
            alert("Enter a valid number of line items.");
            return;
        }

        const items = Array.from({ length: count }, () => ({
            ...emptyLineItem,
        }));

        setLineItems(items);
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
     * EMAIL VALIDATION
     --------------------------------*/
    const validateEmail = (e: FocusEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (!value) return;

        const valid = /\S+@\S+\.\S+/.test(value);
        if (!valid) alert("Please enter a valid email address.");
    };

    /** -------------------------------
     * SUBMIT FORM
     --------------------------------*/
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        const convertMoney = (v: string | number) =>
            Number(String(v).replace(/[^0-9.]/g, "")) || 0;

        const preparedLineItems = lineItems.map((item) => ({
            trade: item.trade,
            scope: item.scope.split(/\r?\n/).filter(Boolean),
            material_labor_included: item.material_labor_included,
            line_total: convertMoney(item.line_total),
        }));

        const payload = {
            ...form,
            approx_weeks: Number(form.approx_weeks),
            total_costs: convertMoney(form.total_costs),
            deposit_required: convertMoney(form.deposit_required),
            weekly_payments: convertMoney(form.weekly_payments),
            final_amount_due: convertMoney(form.final_amount_due),
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
                setForm(initialFormState);
                setLineItems([]);
                setNumLineItems("");
            } else {
                alert("Error submitting bid.");
            }
        } catch (err) {
            alert("Network error.");
        }
    };

    return (
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
                            />

                            <label>Phone:</label>
                            <input
                                type="text"
                                id="company_phone"
                                value={form.company_phone}
                                onChange={handleFormChange}
                            />

                            <label>Email:</label>
                            <input
                                type="email"
                                id="company_email"
                                value={form.company_email}
                                onChange={handleFormChange}
                                onBlur={validateEmail}
                            />

                            <p className="slogan">{form.company_slogan}</p>
                        </div>

                        {/* FULL FORM — UNCHANGED */}
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
                                type="text"
                                id="invoice_number"
                                placeholder="LC-2025-1178"
                                value={form.invoice_number}
                                onChange={handleFormChange}
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
                            />

                            <label>Job Name or Address:</label>
                            <input
                                type="text"
                                id="job"
                                placeholder="Kitchen Remodel, Tampa FL"
                                value={form.job}
                                onChange={handleFormChange}
                            />

                            <label><strong>Payment Terms:</strong></label>
                            <textarea
                                id="payment_terms"
                                rows={2}
                                value={form.payment_terms}
                                onChange={handleFormChange}
                                placeholder="Deposit of 50% prior to work commencing and weekly progress payments."
                            ></textarea>

                            <label>Approximate Working Weeks:</label>
                            <input
                                type="number"
                                id="approx_weeks"
                                value={form.approx_weeks}
                                onChange={handleFormChange}
                                placeholder="5"
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
                                onChange={(e) => setNumLineItems(e.target.value)}
                            />

                            <button type="button" onClick={handleGenerateLineItems}>
                                Generate Line Item Sections
                            </button>

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
                                            />

                                            <label>Scope of Work (one per line):</label>
                                            <textarea
                                                className="scope-input"
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
                                                    handleLineItemChange(index, "line_total", e.target.value)
                                                }
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                            {/* CONTINGENCY */}
                            <h2>Contingency (10%)</h2>
                            <textarea
                                id="contingency_coverage"
                                rows={3}
                                value={form.contingency_coverage}
                                onChange={handleFormChange}
                                placeholder="Covers miscellaneous materials and unexpected repairs..."
                            ></textarea>

                            <p className="contingency-warning">
                                <strong>
                                    CONTINGENCY FUNDS NOT UTILIZED WILL BE RETURNED TO THE CUSTOMER.
                                </strong>
                            </p>

                            {/* TOTALS */}
                            <h2>Totals & Payment</h2>

                            <label>Total Costs (tax percentage included):</label>
                            <input
                                type="text"
                                id="total_costs"
                                value={form.total_costs}
                                onChange={handleFormChange}
                                placeholder="$"
                            />

                            <label>Deposit Required:</label>
                            <input
                                type="text"
                                id="deposit_required"
                                value={form.deposit_required}
                                onChange={handleFormChange}
                                placeholder="$"
                            />

                            <label>Weekly Progress Payments:</label>
                            <input
                                type="text"
                                id="weekly_payments"
                                value={form.weekly_payments}
                                onChange={handleFormChange}
                                placeholder="$"
                            />

                            <label>Final Amount Due Upon Completion:</label>
                            <input
                                type="text"
                                id="final_amount_due"
                                value={form.final_amount_due}
                                onChange={handleFormChange}
                                placeholder="$"
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
                            />

                            <label>Customer Address:</label>
                            <input
                                type="text"
                                id="customer_address"
                                value={form.customer_address}
                                onChange={handleFormChange}
                                placeholder="1234 Main St, Tampa FL"
                            />

                            <label>Customer Phone:</label>
                            <input
                                type="text"
                                id="customer_phone"
                                value={form.customer_phone}
                                onChange={handleFormChange}
                                placeholder="(000) 000-0000"
                            />

                            <label>Customer Email:</label>
                            <input
                                type="email"
                                id="customer_email"
                                value={form.customer_email}
                                onChange={handleFormChange}
                                onBlur={validateEmail}
                                placeholder="example@email.com"
                            />

                            {/* SUBMIT */}
                            <div className="submit-area">
                                <button type="submit">Generate My Bid</button>
                                <p className="powered">POWERED by Suros Logic Systems, LLC</p>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BidForm;
