import React, {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useLocation, useNavigate } from "react-router-dom";

import surosLogo from "@/assets/suros-logo-new.png";
import { useAuth } from "@/context/AuthContext";
import { firestore } from "@/lib/firebase";
import { BidFormRecord } from "@/models/BidForms";
import {
  ChangeOrderFormState,
  ChangeOrderRecord,
} from "@/models/ChangeOrder";

import "./BidForm.css";
import "@/styles/gradients.css";

type FormErrors = Record<string, boolean>;
type ModalType = "success" | "error" | "warning" | "info";

type LocationState = {
  bid?: BidFormRecord;
  existingChangeOrder?: ChangeOrderRecord;
  viewOnly?: boolean;
} | null;

const TAX_PERCENTAGE = 7;
const PAYMENT_OPTIONS = [
  {
    value: "payment_upon_approval",
    label: "Payment upon approval",
    description: "Collect payment as soon as the change order is approved.",
  },
  {
    value: "add_to_final_weekly_payment",
    label: "Add to final weekly payment",
    description: "Roll the added amount into the final weekly payment.",
  },
] as const;

const initialFormState: ChangeOrderFormState = {
  company_name: "",
  company_email: "",
  company_phone: "",
  company_address: "",
  job_name: "",
  customer_name: "",
  date_of_issue: "",
  reason_for_change_description: "",
  breakdown_material_labor_description: "",
  original_contract_price: "",
  price_of_change: "",
  tax_on_price_change: "",
  new_contract_price: "",
  original_completion_date: "",
  additional_time_for_change: "",
  new_completion_date: "",
  immediate_or_later_payment: "",
  full_name: "",
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const TAX_NOT_APPLICABLE = "N/A";

const formatDollarWithCommas = (value: string | number) => {
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  if (!cleaned) return "";

  const number = Number(cleaned);
  if (Number.isNaN(number)) return "";

  return `$${number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDollarInput = (value: string) => {
  let cleaned = value.replace(/[^0-9.]/g, "");

  const parts = cleaned.split(".");
  if (parts.length > 2) {
    cleaned = parts[0] + "." + parts.slice(1).join("");
  }

  const [integerPart, decimalPart] = cleaned.split(".");
  const formattedInteger = integerPart
    ? Number(integerPart).toLocaleString("en-US")
    : "";

  if (decimalPart !== undefined) {
    return `$${formattedInteger}.${decimalPart.slice(0, 2)}`;
  }

  return formattedInteger ? `$${formattedInteger}` : "";
};

const parseMoney = (value: string | number) =>
  Number(String(value).replace(/[^0-9.]/g, "")) || 0;

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 10);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const addDaysToDate = (dateString: string, daysToAdd: number) => {
  if (!dateString) return "";

  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().split("T")[0];
};

const ChangeOrderForm: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, loading, user } = useAuth();

  const state = location.state as LocationState;
  const linkedBid = state?.bid;
  const existingChangeOrder = state?.existingChangeOrder;
  const viewOnly = !!state?.viewOnly;

  const [form, setForm] = useState<ChangeOrderFormState>(initialFormState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTaxAmountNA, setIsTaxAmountNA] = useState(false);
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

  const isInvalid = (key: keyof ChangeOrderFormState) => !!errors[key];

  const priceOfChangeAmount = useMemo(
    () => parseMoney(form.price_of_change),
    [form.price_of_change]
  );

  const originalContractPriceAmount = useMemo(
    () => parseMoney(form.original_contract_price),
    [form.original_contract_price]
  );

  const taxOnPriceChangeAmount = useMemo(
    () => (isTaxAmountNA ? 0 : roundMoney(priceOfChangeAmount * (TAX_PERCENTAGE / 100))),
    [isTaxAmountNA, priceOfChangeAmount]
  );

  const newContractPriceAmount = useMemo(
    () =>
      roundMoney(
        originalContractPriceAmount + priceOfChangeAmount + taxOnPriceChangeAmount
      ),
    [originalContractPriceAmount, priceOfChangeAmount, taxOnPriceChangeAmount]
  );

  const additionalTimeDays = useMemo(
    () => Number(form.additional_time_for_change.replace(/[^0-9]/g, "")) || 0,
    [form.additional_time_for_change]
  );

  const computedNewCompletionDate = useMemo(
    () => addDaysToDate(form.original_completion_date, additionalTimeDays),
    [form.original_completion_date, additionalTimeDays]
  );

  const showModal = (type: ModalType, title: string, message: string) => {
    setModal({ open: true, type, title, message });
  };

  useEffect(() => {
    if (existingChangeOrder) {
      setForm({
        ...existingChangeOrder.formSnapshot,
        tax_on_price_change:
          existingChangeOrder.formSnapshot.tax_on_price_change === TAX_NOT_APPLICABLE
            ? ""
            : existingChangeOrder.formSnapshot.tax_on_price_change,
      });
      setIsTaxAmountNA(
        existingChangeOrder.formSnapshot.tax_on_price_change === TAX_NOT_APPLICABLE
      );
      setErrors({});
      return;
    }

    setForm((prev) => ({
      ...prev,
      company_name: profile?.companyName ?? prev.company_name,
      company_email: profile?.email ?? prev.company_email,
      company_phone: profile?.phone
        ? formatPhone(profile.phone)
        : prev.company_phone,
      company_address: profile?.companyAddress ?? prev.company_address,
      full_name: profile?.displayName ?? prev.full_name,
      job_name: linkedBid?.formSnapshot.job ?? prev.job_name,
      customer_name: linkedBid?.formSnapshot.customer_name ?? prev.customer_name,
      original_contract_price:
        linkedBid?.formSnapshot.total_costs?.toString() ?? prev.original_contract_price,
      date_of_issue: prev.date_of_issue || new Date().toISOString().split("T")[0],
    }));
  }, [existingChangeOrder, linkedBid, profile]);

  useEffect(() => {
    if (isTaxAmountNA) {
      setForm((prev) => ({
        ...prev,
        tax_on_price_change: TAX_NOT_APPLICABLE,
        new_contract_price:
          originalContractPriceAmount > 0 || priceOfChangeAmount > 0
            ? formatDollarWithCommas(newContractPriceAmount)
            : "",
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      tax_on_price_change: taxOnPriceChangeAmount
        ? formatDollarWithCommas(taxOnPriceChangeAmount)
        : priceOfChangeAmount > 0
          ? formatDollarWithCommas(0)
          : "",
      new_contract_price: newContractPriceAmount
        ? formatDollarWithCommas(newContractPriceAmount)
        : originalContractPriceAmount > 0 || priceOfChangeAmount > 0
          ? formatDollarWithCommas(0)
          : "",
    }));
  }, [
    isTaxAmountNA,
    newContractPriceAmount,
    originalContractPriceAmount,
    priceOfChangeAmount,
    taxOnPriceChangeAmount,
  ]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      new_completion_date: computedNewCompletionDate,
    }));
  }, [computedNewCompletionDate]);

  useEffect(() => {
    if (linkedBid || existingChangeOrder || !profile) return;
    navigate("/bids/history");
  }, [existingChangeOrder, linkedBid, navigate, profile]);

  const handleFormChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;

    setErrors((prev) => ({ ...prev, [id]: false }));

    if (id === "price_of_change" || id === "original_contract_price") {
      setForm((prev) => ({ ...prev, [id]: formatDollarInput(value) }));
      return;
    }

    if (id === "company_phone") {
      setForm((prev) => ({ ...prev, company_phone: formatPhone(value) }));
      return;
    }

    if (id === "additional_time_for_change") {
      const cleaned = value.replace(/[^0-9]/g, "");
      setForm((prev) => ({ ...prev, additional_time_for_change: cleaned }));
      return;
    }

    if (id === "tax_on_price_change" || id === "new_contract_price" || id === "new_completion_date") {
      return;
    }

    setForm((prev) => ({ ...prev, [id]: value }));
  };

  const handleBreakdownChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    let value = e.target.value;

    if (form.breakdown_material_labor_description === "" && value.length === 1) {
      value = `- ${value}`;
    }

    setErrors((prev) => ({
      ...prev,
      breakdown_material_labor_description: false,
    }));

    setForm((prev) => ({
      ...prev,
      breakdown_material_labor_description: value,
    }));
  };

  const handleBreakdownKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;

    e.preventDefault();

    const current = form.breakdown_material_labor_description;
    const cursorPos = e.currentTarget.selectionStart;
    const before = current.substring(0, cursorPos);
    const after = current.substring(cursorPos);
    const nextValue = `${before}\n- ${after}`;

    setForm((prev) => ({
      ...prev,
      breakdown_material_labor_description: nextValue,
    }));

    setTimeout(() => {
      e.currentTarget.selectionStart = cursorPos + 3;
      e.currentTarget.selectionEnd = cursorPos + 3;
    }, 0);
  };

  const handleSetTaxNA = () => {
    setErrors((prev) => ({
      ...prev,
      tax_on_price_change: false,
    }));

    setForm((prev) => ({
      ...prev,
      tax_on_price_change:
        isTaxAmountNA
          ? priceOfChangeAmount > 0
            ? formatDollarWithCommas(roundMoney(priceOfChangeAmount * (TAX_PERCENTAGE / 100)))
            : ""
          : TAX_NOT_APPLICABLE,
    }));
    setIsTaxAmountNA((prev) => !prev);
  };

  const validateForm = () => {
    const nextErrors: FormErrors = {};

    const req = (key: keyof ChangeOrderFormState) => {
      if (!String(form[key] ?? "").trim()) {
        nextErrors[key] = true;
      }
    };

    req("company_name");
    req("company_email");
    req("company_phone");
    req("company_address");
    req("job_name");
    req("customer_name");
    req("date_of_issue");
    req("reason_for_change_description");
    req("breakdown_material_labor_description");
    req("original_contract_price");
    req("price_of_change");
    req("tax_on_price_change");
    req("new_contract_price");
    req("original_completion_date");
    req("additional_time_for_change");
    req("new_completion_date");
    req("immediate_or_later_payment");
    req("full_name");

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (viewOnly || isSubmitting) return;

    if (!linkedBid || !user) {
      showModal(
        "error",
        "Missing Bid Context",
        "We could not find the original bid for this change order. Please return to Bid History and try again."
      );
      return;
    }

    if (!validateForm()) {
      showModal(
        "warning",
        "Incomplete Form",
        "Please complete all required fields before submitting your change order."
      );
      return;
    }

    setIsSubmitting(true);

    const payload = {
      ...form,
      bid_form_id: linkedBid.id,
      tax_percentage: TAX_PERCENTAGE,
      original_contract_price: parseMoney(form.original_contract_price),
      price_of_change: parseMoney(form.price_of_change),
      tax_on_price_change: isTaxAmountNA ? TAX_NOT_APPLICABLE : taxOnPriceChangeAmount,
      new_contract_price: newContractPriceAmount,
      additional_time_for_change: additionalTimeDays,
    };

    try {
      const res = await fetch(
        "https://astutearc7.app.n8n.cloud/webhook/change-order",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        setIsSubmitting(false);
        showModal(
          "error",
          "Submission Failed",
          "We ran into an issue while submitting your change order. Please try again in a moment."
        );
        return;
      }

      const recordPayload = {
        userId: user.uid,
        bidFormId: linkedBid.id,
        title: "Change Order Form",
        formSnapshot: form,
      };

      if (existingChangeOrder?.id) {
        await updateDoc(doc(firestore, "changeOrder", existingChangeOrder.id), {
          ...recordPayload,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(firestore, "changeOrder"), {
          ...recordPayload,
          createdAt: serverTimestamp(),
        });
      }

      setIsSubmitting(false);
      showModal(
        "success",
        "Change Order Submitted Successfully",
        "Your change order form has been saved and sent for processing."
      );
    } catch (error) {
      setIsSubmitting(false);
      showModal(
        "error",
        "Network Error",
        "We could not connect to our servers. Please check your connection and try again."
      );
    }
  };

  return loading || !profile ? (
    <div className="suros-gradient">
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
    </div>
  ) : (
    <div className="suros-gradient">
      <div className="bid-form-page">
        <button
          onClick={() => navigate("/bids/history")}
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
              <b>{form.company_name || profile.companyName}</b>
            </h1>

            <form onSubmit={handleSubmit}>
              <h2>Personal Information</h2>

              <label>Company Name:</label>
              <input
                type="text"
                id="company_name"
                value={form.company_name}
                onChange={handleFormChange}
                readOnly={viewOnly}
                className={`${isInvalid("company_name") ? "input-error" : ""} ${viewOnly ? "input-readonly" : ""}`}
              />

              <label>Company Email:</label>
              <input
                type="email"
                id="company_email"
                value={form.company_email}
                onChange={handleFormChange}
                readOnly={viewOnly}
                className={`${isInvalid("company_email") ? "input-error" : ""} ${viewOnly ? "input-readonly" : ""}`}
              />

              <label>Company Phone:</label>
              <input
                type="text"
                id="company_phone"
                value={form.company_phone}
                onChange={handleFormChange}
                readOnly={viewOnly}
                className={`${isInvalid("company_phone") ? "input-error" : ""} ${viewOnly ? "input-readonly" : ""}`}
              />

              <label>Company Address:</label>
              <input
                type="text"
                id="company_address"
                value={form.company_address}
                onChange={handleFormChange}
                readOnly={viewOnly}
                className={`${isInvalid("company_address") ? "input-error" : ""} ${viewOnly ? "input-readonly" : ""}`}
              />

              <label>Quotation Prepared By:</label>
              <input
                type="text"
                id="full_name"
                value={form.full_name}
                onChange={handleFormChange}
                readOnly={viewOnly}
                className={`${isInvalid("full_name") ? "input-error" : ""} ${viewOnly ? "input-readonly" : ""}`}
              />

              <h2>Change Order Overview</h2>

              <label>Job Name:</label>
              <input
                type="text"
                id="job_name"
                value={form.job_name}
                onChange={handleFormChange}
                readOnly={viewOnly}
                className={`${isInvalid("job_name") ? "input-error" : ""} ${viewOnly ? "input-readonly" : ""}`}
              />

              <label>Customer Name:</label>
              <input
                type="text"
                id="customer_name"
                value={form.customer_name}
                onChange={handleFormChange}
                readOnly={viewOnly}
                className={`${isInvalid("customer_name") ? "input-error" : ""} ${viewOnly ? "input-readonly" : ""}`}
              />

              <label>Date of Issue:</label>
              <input
                type="date"
                id="date_of_issue"
                value={form.date_of_issue}
                onChange={handleFormChange}
                readOnly={viewOnly}
                className={`${isInvalid("date_of_issue") ? "input-error" : ""} ${viewOnly ? "input-readonly" : ""}`}
              />

              <label>Reason for Change Description:</label>
              <textarea
                id="reason_for_change_description"
                rows={5}
                value={form.reason_for_change_description}
                onChange={handleFormChange}
                placeholder="Describe why this change order is needed."
                readOnly={viewOnly}
                className={isInvalid("reason_for_change_description") ? "input-error" : ""}
              />

              <label>Breakdown Material/Labor Description:</label>
              <textarea
                id="breakdown_material_labor_description"
                rows={6}
                value={form.breakdown_material_labor_description}
                onChange={handleBreakdownChange}
                onKeyDown={handleBreakdownKeyDown}
                placeholder="- Enter one item per line"
                readOnly={viewOnly}
                className={`scope-input ${isInvalid("breakdown_material_labor_description") ? "input-error" : ""}`}
              />

              <h2>Pricing</h2>

              <label>Original Contract Price:</label>
              <input
                type="text"
                id="original_contract_price"
                value={form.original_contract_price}
                onChange={handleFormChange}
                placeholder="$"
                readOnly={viewOnly}
                className={isInvalid("original_contract_price") ? "input-error" : ""}
              />

              <label>Price of Change:</label>
              <input
                type="text"
                id="price_of_change"
                value={form.price_of_change}
                onChange={handleFormChange}
                placeholder="$"
                readOnly={viewOnly}
                className={isInvalid("price_of_change") ? "input-error" : ""}
              />

              <label>Tax on Price Change:</label>
              <div className="tax-row">
                <input
                  type="text"
                  id="tax_on_price_change"
                  value={form.tax_on_price_change}
                  readOnly
                  className={`${isInvalid("tax_on_price_change") ? "input-error" : ""} input-readonly`}
                />

                {!viewOnly && (
                  <button
                    type="button"
                    onClick={handleSetTaxNA}
                    style={{
                      whiteSpace: "nowrap",
                      padding: "10px 14px",
                      background: isTaxAmountNA ? "#1e73be" : "#e5e7eb",
                      color: isTaxAmountNA ? "#fff" : "#111",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: 600,
                      opacity: isTaxAmountNA ? 1 : 0.85,
                    }}
                  >
                    N/A
                  </button>
                )}

                <div className="tax-amount text-black">
                  {`${TAX_PERCENTAGE}% automatic tax${isTaxAmountNA ? " disabled" : ""}`}
                </div>
              </div>

              <label>New Contract Price:</label>
              <input
                type="text"
                id="new_contract_price"
                value={form.new_contract_price}
                readOnly
                className={`${isInvalid("new_contract_price") ? "input-error" : ""} input-readonly`}
              />

              <h2>Schedule</h2>

              <label>Original Completion Date:</label>
              <input
                type="date"
                id="original_completion_date"
                value={form.original_completion_date}
                onChange={handleFormChange}
                readOnly={viewOnly}
                className={isInvalid("original_completion_date") ? "input-error" : ""}
              />

              <label>Additional Time for Change (days):</label>
              <input
                type="text"
                id="additional_time_for_change"
                value={form.additional_time_for_change}
                onChange={handleFormChange}
                placeholder="0"
                readOnly={viewOnly}
                className={isInvalid("additional_time_for_change") ? "input-error" : ""}
              />

              <label>New Completion Date:</label>
              <input
                type="date"
                id="new_completion_date"
                value={form.new_completion_date}
                readOnly
                className={`${isInvalid("new_completion_date") ? "input-error" : ""} input-readonly`}
              />

              <h2>Payment Timing</h2>

              <label>
                Is this a payment upon approval or should the payment be tacked onto the final weekly payment?
              </label>
              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  marginTop: "8px",
                  marginBottom: "18px",
                }}
              >
                {PAYMENT_OPTIONS.map((option) => {
                  const checked = form.immediate_or_later_payment === option.value;

                  return (
                    <label
                      key={option.value}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "12px",
                        padding: "14px",
                        borderRadius: "10px",
                        border: `1px solid ${checked ? "#1e73be" : "#cbd5e1"}`,
                        background: checked ? "#eff6ff" : "#f9fafb",
                        cursor: viewOnly ? "default" : "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="immediate_or_later_payment"
                        value={option.value}
                        checked={checked}
                        disabled={viewOnly}
                        onChange={(e) => {
                          setErrors((prev) => ({
                            ...prev,
                            immediate_or_later_payment: false,
                          }));
                          setForm((prev) => ({
                            ...prev,
                            immediate_or_later_payment: e.target.value,
                          }));
                        }}
                        style={{ marginTop: "4px", width: "18px" }}
                      />

                      <span style={{ color: "#111827" }}>
                        <strong>{option.label}</strong>
                        <br />
                        <span style={{ fontWeight: 400 }}>{option.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {isInvalid("immediate_or_later_payment") && (
                <div className="field-error-text">Please select one payment timing option.</div>
              )}

              {!viewOnly && (
                <div className="submit-area">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    style={{
                      opacity: isSubmitting ? 0.7 : 1,
                      cursor: isSubmitting ? "not-allowed" : "pointer",
                    }}
                  >
                    {isSubmitting ? <span className="spinner" /> : "Submit Change Order"}
                  </button>
                  <p className="powered">POWERED by Suros Logic Systems, LLC</p>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

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
              {modal.type === "success" ? modal.title || "Change Order Submitted" : modal.title}
            </h2>

            <p style={{ color: "#000", lineHeight: 1.6, marginBottom: "22px" }}>
              {modal.message}
            </p>

            <button
              onClick={() => {
                if (modal.type === "success") {
                  navigate("/bids/history");
                } else {
                  setModal((prev) => ({ ...prev, open: false }));
                }
              }}
              style={{
                background: modal.type === "error" ? "#c0392b" : "#1e73be",
                color: "#fff",
                padding: "10px 22px",
                borderRadius: "6px",
                border: "none",
                fontSize: "15px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {modal.type === "success" ? "Finish" : "Got it"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChangeOrderForm;
