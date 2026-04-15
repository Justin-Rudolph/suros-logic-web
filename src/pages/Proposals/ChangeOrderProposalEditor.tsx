import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent as ReactFormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import {
  formatReadableDate,
  formatUsd,
  renderChangeOrderProposalHtml,
} from "@/lib/changeOrderProposal/template";
import { getFunctionsBaseUrl } from "@/lib/functionsApi";
import { firestore } from "@/lib/firebase";
import { touchBidFormUpdatedAt } from "@/lib/touchBidForm";
import {
  ChangeOrderProposalDocument,
  ChangeOrderProposalRecord,
} from "@/models/ChangeOrderProposals";

import "./BidFormProposalEditor.css";
import "./ChangeOrderProposalEditor.css";

const emptyStateMessage = "This change order proposal is being generated...";
const updatingStateMessage = "This change order proposal is regenerating...";

const parseMoney = (value: string | number) =>
  Number(String(value ?? "").replace(/[^0-9.]/g, "")) || 0;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const formatCurrencyInput = (value: string | number) => {
  const cleaned = String(value ?? "").replace(/[^0-9.]/g, "");
  if (!cleaned) return "";

  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return "";

  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const toEditableCurrency = (value: string | number) => {
  const amount = parseMoney(value);
  if (!amount) return "";

  return String(amount).includes(".")
    ? String(amount).replace(/\.00$/, "")
    : String(amount);
};

const parsePercentage = (value: string | number) => {
  const numeric = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const parseDateValue = (value: string) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const parsed = isoMatch ? new Date(`${trimmed}T00:00:00`) : new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const toIsoDateString = (value: string) => {
  const parsed = parseDateValue(value);
  if (!parsed) return "";
  return parsed.toISOString().split("T")[0];
};

const addDaysToDate = (dateString: string, daysToAdd: number) => {
  const date = parseDateValue(dateString);
  if (!date) return "";

  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().split("T")[0];
};

const normalizeBreakdownText = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith("- ") ? line : `- ${line.replace(/^-+\s*/, "")}`))
    .join("\n");

const autoResizeTextarea = (element: HTMLTextAreaElement) => {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
};

const EditableField = ({
  value,
  onChange,
  className = "",
  multiline = false,
  rows = 2,
  placeholder,
  align = "left",
  style,
  readOnly = false,
  onFocus,
  onBlur,
  onInput,
  textareaRef,
  onKeyDown,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  align?: "left" | "right";
  style?: CSSProperties;
  readOnly?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onInput?: (event: ReactFormEvent<HTMLTextAreaElement>) => void;
  textareaRef?: (node: HTMLTextAreaElement | null) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
}) => {
  if (multiline) {
    return (
      <textarea
        className={`bid-editor-inline-input ${className}`}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onInput={onInput}
        onKeyDown={onKeyDown}
        ref={textareaRef}
        style={{ textAlign: align, ...style }}
        readOnly={readOnly}
      />
    );
  }

  return (
    <input
      className={`bid-editor-inline-input ${className}`}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      style={{ textAlign: align, ...style }}
      readOnly={readOnly}
    />
  );
};

const DateDisplayField = ({
  value,
  onChange,
  align = "left",
}: {
  value: string;
  onChange: (value: string) => void;
  align?: "left" | "right";
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    if (!inputRef.current) return;
    if (typeof inputRef.current.showPicker === "function") {
      inputRef.current.showPicker();
      return;
    }
    inputRef.current.focus();
    inputRef.current.click();
  };

  return (
    <div className={`change-order-editor-date-display is-${align}`}>
      <button type="button" className="change-order-editor-date-button" onClick={openPicker}>
        {formatReadableDate(value) || "Select date"}
      </button>
      <input
        ref={inputRef as MutableRefObject<HTMLInputElement>}
        type="date"
        className="change-order-editor-date-input"
        value={toIsoDateString(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
};

export default function ChangeOrderProposalEditor() {
  const navigate = useNavigate();
  const { bidId, changeOrderId } = useParams();
  const { user, profile } = useAuth();

  const [record, setRecord] = useState<ChangeOrderProposalRecord | null>(null);
  const [documentData, setDocumentData] = useState<ChangeOrderProposalDocument | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [currencyDrafts, setCurrencyDrafts] = useState<Record<"original_contract_price" | "price_of_change", string>>({
    original_contract_price: "",
    price_of_change: "",
  });
  const [reasonDraft, setReasonDraft] = useState("");
  const [breakdownDraft, setBreakdownDraft] = useState("");
  const isReadOnly = profile?.isSubscribed !== true;

  useEffect(() => {
    if (!user) return;

    const constraints = [
      where("userId", "==", user.uid),
      ...(changeOrderId
        ? [where("changeOrderId", "==", changeOrderId)]
        : bidId
          ? [where("bidFormId", "==", bidId)]
          : []),
    ];

    const proposalQuery = query(collection(firestore, "changeOrderProposals"), ...constraints);

    const unsubscribe = onSnapshot(proposalQuery, (snapshot) => {
      const records: ChangeOrderProposalRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<ChangeOrderProposalRecord, "id">),
      }));

      records.sort((a, b) => {
        const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
        const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
        return bTime - aTime;
      });

      const nextRecord = records[0] ?? null;
      setRecord(nextRecord);
      setDocumentData((current) => {
        if (!nextRecord?.documentData) {
          return current;
        }

        return nextRecord.documentData;
      });
    });

    return unsubscribe;
  }, [bidId, changeOrderId, user]);

  useEffect(() => {
    if (!saveNotice) return;

    const timeout = window.setTimeout(() => setSaveNotice(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [saveNotice]);

  useEffect(() => {
    if (!documentData) return;

    setCurrencyDrafts({
      original_contract_price: formatCurrencyInput(documentData.original_contract_price),
      price_of_change: formatCurrencyInput(documentData.price_of_change),
    });
    setReasonDraft(documentData.reason_for_change_description);
    setBreakdownDraft(documentData.breakdown_material_labor_description);
  }, [documentData]);

  const computed = useMemo(() => {
    if (!documentData) return null;

    const originalContractPrice = parseMoney(documentData.original_contract_price);
    const priceOfChange = parseMoney(documentData.price_of_change);
    const taxPercentage = parsePercentage(documentData.tax_percentage ?? 0);
    const isTaxNotApplicable = Boolean(documentData.tax_not_applicable) || taxPercentage === 0;
    const taxOnPriceChange =
      isTaxNotApplicable
        ? "N/A"
        : roundMoney(priceOfChange * (taxPercentage / 100));
    const additionalTimeDays =
      Number(String(documentData.additional_time_for_change ?? "").replace(/[^0-9]/g, "")) || 0;
    const newCompletionDate = addDaysToDate(
      documentData.original_completion_date,
      additionalTimeDays
    );
    const newContractPrice =
      taxOnPriceChange === "N/A"
        ? roundMoney(originalContractPrice + priceOfChange)
        : roundMoney(originalContractPrice + priceOfChange + taxOnPriceChange);

    return {
      isTaxNotApplicable,
      taxPercentage,
      taxOnPriceChange,
      newContractPrice,
      additionalTimeDays,
      newCompletionDate,
    };
  }, [documentData]);

  const effectiveDocumentData = useMemo(() => {
    if (!documentData || !computed) return documentData;

    return {
      ...documentData,
      tax_percentage: computed.taxPercentage,
      tax_not_applicable: computed.isTaxNotApplicable,
      tax_on_price_change:
        computed.taxOnPriceChange === "N/A" ? "N/A" : formatUsd(computed.taxOnPriceChange),
      new_contract_price: formatUsd(computed.newContractPrice),
      new_completion_date: computed.newCompletionDate,
      additional_time_for_change: String(computed.additionalTimeDays),
    };
  }, [computed, documentData]);

  const previewHtml = useMemo(() => {
    if (!effectiveDocumentData) return "";
    return renderChangeOrderProposalHtml(effectiveDocumentData);
  }, [effectiveDocumentData]);

  const updateField = <K extends keyof ChangeOrderProposalDocument>(
    field: K,
    value: ChangeOrderProposalDocument[K],
    shouldMarkDirty = true
  ) => {
    if (isReadOnly) return;

    if (shouldMarkDirty) {
      setHasUnsavedChanges(true);
    }

    setDocumentData((current) => (current ? { ...current, [field]: value } : current));
  };

  const persistProposalChanges = async () => {
    if (!record?.id || !effectiveDocumentData || !user) return null;

    const html = renderChangeOrderProposalHtml(effectiveDocumentData);

    await updateDoc(doc(firestore, "changeOrderProposals", record.id), {
      documentData: effectiveDocumentData,
      html,
      status: "ready",
      updatedAt: serverTimestamp(),
    });
    await touchBidFormUpdatedAt(record.bidFormId || bidId);
    setHasUnsavedChanges(false);

    return {
      documentData: effectiveDocumentData,
      html,
    };
  };

  const handleSave = async () => {
    if (isReadOnly) return;

    setIsSaving(true);

    try {
      const saved = await persistProposalChanges();
      if (!saved) return;
      setSaveNotice("Saved");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!previewHtml || isDownloadingPdf || isSaving) return;

    setIsDownloadingPdf(true);
    setDownloadError("");

    try {
      const saved = await persistProposalChanges();
      if (!saved) return;

      const pdfFileName = (saved.documentData.title || record?.title || "change-order")
        .trim()
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "") || "change-order";

      const response = await fetch(`${getFunctionsBaseUrl()}/downloadBidFormProposalPdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          html: saved.html,
          fileName: pdfFileName,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to download PDF.");
      }

      const data = await response.json();
      if (!data?.downloadUrl) {
        throw new Error("A PDF download URL was not returned.");
      }

      const pdfResponse = await fetch(data.downloadUrl);

      if (!pdfResponse.ok) {
        throw new Error("Failed to fetch generated PDF file.");
      }

      const pdfBlob = await pdfResponse.blob();
      const objectUrl = window.URL.createObjectURL(pdfBlob);
      const link = window.document.createElement("a");
      link.href = objectUrl;
      link.download = data.fileName || `${pdfFileName}.pdf`;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "We hit an error downloading the generated proposal file."
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const backPath = `/bids/${bidId}/change-order-proposal`;

  const regeneratePath = changeOrderId
    ? `/bids/${bidId}/change-orders/${changeOrderId}/form`
    : `/bids/${bidId}/change-orders`;

  const handleBackClick = () => {
    if (hasUnsavedChanges) {
      setShowBackConfirm(true);
      return;
    }

    navigate(backPath);
  };

  const handleCurrencyDraftChange = (
    field: "original_contract_price" | "price_of_change",
    value: string
  ) => {
    if (isReadOnly) return;

    const cleaned = value.replace(/[^0-9.]/g, "");
    setHasUnsavedChanges(true);
    setCurrencyDrafts((current) => ({
      ...current,
      [field]: cleaned,
    }));
  };

  const handleCurrencyFocus = (field: "original_contract_price" | "price_of_change") => {
    if (isReadOnly) return;
    if (!documentData) return;

    setCurrencyDrafts((current) => ({
      ...current,
      [field]: toEditableCurrency(documentData[field]),
    }));
  };

  const handleCurrencyBlur = (field: "original_contract_price" | "price_of_change") => {
    if (isReadOnly) return;

    const draftValue = currencyDrafts[field] ?? "";
    const parsedValue = parseMoney(draftValue);
    const formattedValue = formatCurrencyInput(parsedValue);

    updateField(field, formattedValue, false);
    setCurrencyDrafts((current) => ({
      ...current,
      [field]: formattedValue,
    }));
  };

  const handleBreakdownKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (isReadOnly) return;

    if (event.key !== "Enter") return;

    event.preventDefault();

    const textarea = event.currentTarget;
    const cursorPos = textarea.selectionStart;
    const currentValue = breakdownDraft ?? textarea.value;
    const nextValue =
      currentValue.slice(0, cursorPos) + "\n- " + currentValue.slice(cursorPos);

    setBreakdownDraft(nextValue);
    updateField("breakdown_material_labor_description", normalizeBreakdownText(nextValue));

    requestAnimationFrame(() => {
      textarea.selectionStart = cursorPos + 3;
      textarea.selectionEnd = cursorPos + 3;
      autoResizeTextarea(textarea);
    });
  };

  const handleBreakdownBlur = () => {
    if (isReadOnly) return;

    updateField("breakdown_material_labor_description", normalizeBreakdownText(breakdownDraft), false);
  };

  if (record?.status === "generating") {
    const loadingMessage = documentData ? updatingStateMessage : emptyStateMessage;

    return (
      <div className="suros-gradient bid-editor-page">
        <button className="bid-editor-back" onClick={handleBackClick}>
          ← Back
        </button>

        <div className="bid-editor-loading-card">
          <h1>{record.title || "Change Order Proposal"}</h1>
          <div className="bid-editor-loading-inline">
            <div className="bid-editor-loading-spinner" />
            <p>{loadingMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!record || !documentData || !effectiveDocumentData) {
    if (record?.status === "error") {
      return (
        <div className="suros-gradient bid-editor-page">
          <button className="bid-editor-back" onClick={() => navigate(backPath)}>
            ← Back
          </button>

          <div className="bid-editor-loading-card">
            <h1>{record.title || "Change Order Proposal"}</h1>
            <div className="bid-editor-error-state">
              <p>
                {record.errorMessage || "We hit an error generating this proposal."}
              </p>
              <p>
                Click below to navigate back and regenerate the change order proposal.
              </p>
              <button
                type="button"
                className="bid-editor-regenerate-button"
                onClick={() => navigate(regeneratePath)}
              >
                Resubmit Change Order and Regenerate
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="suros-gradient bid-editor-page">
        <button className="bid-editor-back" onClick={() => navigate(backPath)}>
          ← Back
        </button>

        <div className="bid-editor-loading-card">
          <h1>Change Order Proposal</h1>
          <p>No change order proposal has been created for this record yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-wrapper bid-editor-shell">
      <div className="bid-editor-topbar">
        <button className="bid-editor-back" onClick={handleBackClick}>
          ← Back
        </button>

        <div className="bid-editor-topbar-actions">
          {saveNotice && <span className="bid-editor-save-notice">{saveNotice}</span>}
          <button
            className="bid-editor-secondary"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf || isSaving}
          >
            {isDownloadingPdf ? "Downloading..." : "Download PDF"}
          </button>
          <button
            className={`bid-editor-primary ${hasUnsavedChanges ? "is-dirty" : "is-clean"}`}
            onClick={handleSave}
            disabled={isReadOnly || isSaving || !hasUnsavedChanges}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {downloadError && (
        <div className="bid-editor-error-banner">
          <p>
            {downloadError} Click below to navigate back and regenerate the change order proposal.
          </p>
          <button
            type="button"
            className="bid-editor-regenerate-button"
            onClick={() => navigate(regeneratePath)}
          >
            Resubmit Change Order and Regenerate
          </button>
        </div>
      )}

      <div className="bid-editor-document-shell">
        <div className={`bid-editor-document ${isReadOnly ? "is-read-only" : ""}`}>
          <div className="bid-editor-document-inner">
            <table cellPadding={16} cellSpacing={0} style={{ background: "#2A3439", color: "white" }}>
              <tbody>
                <tr>
                  <td>
                    <EditableField
                      value={documentData.company_name}
                      onChange={(value) => updateField("company_name", value)}
                      className="bid-editor-company-name"
                    />
                    <EditableField
                      value={documentData.company_address}
                      onChange={(value) => updateField("company_address", value)}
                      className="bid-editor-header-line"
                      style={{ marginTop: 6, fontSize: 20 }}
                    />
                    <EditableField
                      value={documentData.company_phone}
                      onChange={(value) => updateField("company_phone", value)}
                      className="bid-editor-header-line"
                      style={{ fontSize: 20 }}
                    />
                    <EditableField
                      value={documentData.company_email}
                      onChange={(value) => updateField("company_email", value)}
                      className="bid-editor-header-line"
                      style={{ fontSize: 20, color: "#e3f2fd" }}
                    />
                  </td>
                  <td align="right">
                    <div className="change-order-editor-side-heading">Change Order Form</div>
                    <DateDisplayField
                      value={documentData.date_of_issue}
                      onChange={(value) => updateField("date_of_issue", value)}
                      align="right"
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            <table cellPadding={10} cellSpacing={0} className="bid-editor-card-table">
              <tbody>
                <tr>
                  <td width="50%">
                    <strong className="bid-editor-label-lg">PROJECT</strong>
                    <EditableField
                      value={documentData.job_name}
                      onChange={(value) => updateField("job_name", value)}
                    />
                  </td>
                  <td width="50%">
                    <strong className="bid-editor-label-lg">CLIENT</strong>
                    <EditableField
                      value={documentData.customer_name}
                      onChange={(value) => updateField("customer_name", value)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            <h2 className="bid-editor-description-heading">Reason for Change</h2>
            <table cellPadding={12} cellSpacing={0} className="bid-editor-card-table change-order-editor-spaced-card">
              <tbody>
                <tr>
                  <td>
                    <EditableField
                      value={reasonDraft}
                      onChange={(value) => {
                        if (isReadOnly) return;
                        setReasonDraft(value);
                        updateField("reason_for_change_description", value);
                      }}
                      multiline
                      rows={4}
                      onInput={(event) => autoResizeTextarea(event.currentTarget)}
                      textareaRef={(node) => {
                        if (node) autoResizeTextarea(node);
                      }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            <h2 className="bid-editor-description-heading">Breakdown (Material & Labor)</h2>
            <table cellPadding={12} cellSpacing={0} className="bid-editor-card-table change-order-editor-spaced-card">
              <tbody>
                <tr>
                  <td>
                    <EditableField
                      value={breakdownDraft}
                      onChange={(value) => {
                        if (isReadOnly) return;
                        setHasUnsavedChanges(true);
                        setBreakdownDraft(value);
                      }}
                      multiline
                      rows={5}
                      placeholder="- Demo and remove affected materials and haul debris off site."
                      onInput={(event) => autoResizeTextarea(event.currentTarget)}
                      onKeyDown={handleBreakdownKeyDown}
                      onBlur={handleBreakdownBlur}
                      textareaRef={(node) => {
                        if (node) autoResizeTextarea(node);
                      }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            <table cellPadding={10} cellSpacing={0} className="change-order-editor-cost-table">
              <tbody>
                <tr>
                  <td align="right" className="change-order-editor-cost-cell">
                    Original Contract Price
                  </td>
                  <td align="right" className="change-order-editor-cost-cell">
                      <EditableField
                        value={currencyDrafts.original_contract_price}
                        onChange={(value) =>
                          handleCurrencyDraftChange("original_contract_price", value)
                        }
                        onFocus={() => handleCurrencyFocus("original_contract_price")}
                        onBlur={() => handleCurrencyBlur("original_contract_price")}
                        align="right"
                      />
                  </td>
                </tr>
                <tr>
                  <td align="right" className="change-order-editor-cost-cell">
                    Price of Change
                  </td>
                  <td align="right" className="change-order-editor-cost-cell">
                      <EditableField
                        value={currencyDrafts.price_of_change}
                        onChange={(value) => handleCurrencyDraftChange("price_of_change", value)}
                        onFocus={() => handleCurrencyFocus("price_of_change")}
                        onBlur={() => handleCurrencyBlur("price_of_change")}
                        align="right"
                      />
                  </td>
                </tr>
                <tr>
                  <td align="right" className="change-order-editor-cost-cell">
                    <span>Tax on Change</span>
                    <span className="change-order-editor-tax-inline">
                      <span>(</span>
                      <EditableField
                        value={
                          documentData.tax_not_applicable
                            ? "0"
                            : String(parsePercentage(documentData.tax_percentage ?? 0))
                        }
                        onChange={(value) => {
                          const parsedValue = parsePercentage(value);
                          updateField("tax_percentage", parsedValue);
                          updateField("tax_not_applicable", parsedValue === 0);
                        }}
                        className="change-order-editor-tax-input"
                        align="right"
                      />
                      <span>%)</span>
                    </span>
                  </td>
                  <td align="right" className="change-order-editor-cost-cell">
                    <span className="change-order-editor-readonly-value">
                      {effectiveDocumentData.tax_not_applicable
                        ? "N/A"
                        : formatUsd(parseMoney(effectiveDocumentData.tax_on_price_change))}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td align="right" className="change-order-editor-cost-cell">
                    New Contract Price
                  </td>
                  <td align="right" className="change-order-editor-cost-cell">
                    <span className="change-order-editor-readonly-value">
                      {formatUsd(parseMoney(effectiveDocumentData.new_contract_price))}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            <table cellPadding={10} cellSpacing={0} className="bid-editor-card-table change-order-editor-spaced-card">
              <tbody>
                <tr>
                  <td width="33%">
                    <strong style={{ color: "#2A3439" }}>Original Completion</strong>
                    <DateDisplayField
                      value={documentData.original_completion_date}
                      onChange={(value) => updateField("original_completion_date", value)}
                    />
                  </td>
                  <td width="33%">
                    <strong style={{ color: "#2A3439" }}>Additional Time (days)</strong>
                    <EditableField
                      value={String(computed?.additionalTimeDays ?? 0)}
                      onChange={(value) =>
                        updateField(
                          "additional_time_for_change",
                          String(Number(value.replace(/[^0-9]/g, "")) || 0)
                        )
                      }
                    />
                  </td>
                  <td width="33%">
                    <strong style={{ color: "#2A3439" }}>New Completion</strong>
                    <div className="change-order-editor-readonly-block">
                      {formatReadableDate(effectiveDocumentData.new_completion_date)}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <table cellPadding={12} cellSpacing={0} className="bid-editor-card-table change-order-editor-spaced-card">
              <tbody>
                <tr>
                  <td>
                    <strong className="bid-editor-label-lg">Payment Terms</strong>
                    <EditableField
                      value={documentData.immediate_or_later_payment}
                      onChange={(value) => updateField("immediate_or_later_payment", value)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="change-order-editor-signature">
              <div className="change-order-editor-signature-block">
                <strong className="change-order-editor-signature-label" style={{ color: "#2A3439" }}>
                  Quotation prepared by:
                </strong>
                <EditableField
                  value={documentData.full_name}
                  onChange={(value) => updateField("full_name", value)}
                  className="change-order-editor-signature-input"
                />
                <div className="change-order-editor-line" />
              </div>

              <div className="change-order-editor-contract-copy">
                This is a contract on the goods and services described in scope of work,
                conditions subject to change only with approval from{" "}
                <strong>{documentData.customer_name}</strong> and{" "}
                <strong>{documentData.company_name}</strong>
              </div>

              <div className="change-order-editor-signature-block">
                <strong style={{ color: "#2A3439" }}>
                  To accept this quotation, please print and sign here:
                </strong>
                <div className="change-order-editor-line" style={{ marginTop: 40 }} />
              </div>

              <div className="change-order-editor-signature-block">
                <strong style={{ color: "#2A3439" }}>Date:</strong>
                <div className="change-order-editor-date-line" />
              </div>

              <div className="change-order-editor-footer">
                <strong style={{ color: "#2A3439" }}>AUTHORIZED CHANGE ORDER</strong>
              </div>
            </div>

            <div className="change-order-editor-helper">
              This is the editable working view. Your PDF is generated from the exact saved HTML
              template, including page-break-safe table rows, and the final output will appear more
              polished than this editor preview.
            </div>
          </div>
        </div>
      </div>

      {showBackConfirm && (
        <div className="bid-editor-back-modal-overlay">
          <div className="bid-editor-back-modal">
            <h2>Save Your Work?</h2>
            <p>
              You have unsaved changes in this proposal. Save your work before going back so
              your latest edits are not lost.
            </p>
            <div className="bid-editor-back-modal-actions">
              <button
                type="button"
                className="bid-editor-back-modal-back"
                onClick={() => navigate(backPath)}
              >
                Back
              </button>
              <button
                type="button"
                className="bid-editor-back-modal-return"
                onClick={() => setShowBackConfirm(false)}
              >
                Return to Proposal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
