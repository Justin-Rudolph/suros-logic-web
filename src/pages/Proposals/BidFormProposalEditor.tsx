import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
import { getFunctionsBaseUrl } from "@/lib/functionsApi";
import { firestore } from "@/lib/firebase";
import { touchBidFormUpdatedAt } from "@/lib/touchBidForm";
import {
  BidFormProposalDocument,
  BidFormProposalRecord,
} from "@/models/BidFormProposals";
import {
  formatInvoiceDate,
  formatUsd,
  getBidEditorComputedValues,
  renderBidEditorHtml,
} from "@/lib/bidFormProposal/template";

import "./BidFormProposalEditor.css";

const emptyStateMessage = "This bid proposal is being generated...";
const updatingStateMessage = "This bid proposal is regenerating...";

const getNumberInputValue = (value: number | "N/A") => {
  if (value === "N/A") return "0";
  return String(value);
};

const splitEditableLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const formatSentenceLine = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("- ") ? trimmed : `- ${trimmed.replace(/^-+\s*/, "")}`;
};

const autoResizeTextarea = (element: HTMLTextAreaElement) => {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
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

const parseCurrencyInput = (value: string) => {
  if (!value.trim()) return 0;
  return Number(value.replace(/[^0-9.]/g, "")) || 0;
};

const toEditableCurrency = (value: string | number) => {
  const amount = Number(value) || 0;
  if (!amount) return "";

  return String(amount).includes(".")
    ? String(amount).replace(/\.00$/, "")
    : String(amount);
};

const normalizeScopeDraft = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      return formatSentenceLine(trimmed);
    })
    .filter(Boolean);

const EditableField = ({
  value,
  onChange,
  className = "",
  multiline = false,
  rows = 2,
  placeholder,
  align = "left",
  type = "text",
  size,
  onFocus,
  onBlur,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  align?: "left" | "right";
  type?: string;
  size?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: CSSProperties;
}) => {
  if (multiline) {
    return (
      <textarea
        className={`bid-editor-inline-input ${className}`}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onInput={(e) => autoResizeTextarea(e.currentTarget)}
        onChange={(e) => onChange(e.target.value)}
        ref={(node) => {
          if (node) autoResizeTextarea(node);
        }}
        style={{ textAlign: align, ...style }}
      />
    );
  }

  return (
    <input
      className={`bid-editor-inline-input ${className}`}
      value={value}
      type={type}
      size={size}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      style={{ textAlign: align, ...style }}
    />
  );
};

const DateDisplayField = ({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    if (readOnly || !inputRef.current) return;

    if (typeof inputRef.current.showPicker === "function") {
      inputRef.current.showPicker();
      return;
    }

    inputRef.current.focus();
    inputRef.current.click();
  };

  return (
    <div className="change-order-editor-date-display">
      <button
        type="button"
        className="change-order-editor-date-button"
        onClick={openPicker}
        disabled={readOnly}
      >
        {formatInvoiceDate(value) || "Select date"}
      </button>
      <input
        ref={inputRef as MutableRefObject<HTMLInputElement>}
        type="date"
        className="change-order-editor-date-input"
        value={toIsoDateString(value)}
        onChange={(event) => onChange(event.target.value)}
        disabled={readOnly}
      />
    </div>
  );
};

export default function BidFormProposalEditor() {
  const navigate = useNavigate();
  const { bidId } = useParams();
  const { user, profile } = useAuth();

  const [record, setRecord] = useState<BidFormProposalRecord | null>(null);
  const [documentData, setDocumentData] = useState<BidFormProposalDocument | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [lineTotalDrafts, setLineTotalDrafts] = useState<Record<number, string>>({});
  const [scopeDrafts, setScopeDrafts] = useState<Record<number, string>>({});
  const isReadOnly = profile?.isSubscribed !== true;

  const navigateWithScrollReset = (path: string) => {
    navigate(path);
    window.setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, 0);
  };

  useEffect(() => {
    if (!bidId || !user) return;

    const proposalQuery = query(
      collection(firestore, "bidFormProposals"),
      where("userId", "==", user.uid),
      where("bidFormId", "==", bidId)
    );

    const unsubscribe = onSnapshot(proposalQuery, (snapshot) => {
      const records: BidFormProposalRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<BidFormProposalRecord, "id">),
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
  }, [bidId, user]);

  useEffect(() => {
    if (!documentData) return;

    setLineTotalDrafts((current) => {
      const next: Record<number, string> = {};

      documentData.line_items.forEach((item, index) => {
        next[index] = current[index] ?? formatCurrencyInput(item.line_total);
      });

      return next;
    });

    setScopeDrafts((current) => {
      const next: Record<number, string> = {};

      documentData.line_items.forEach((item, index) => {
        next[index] = current[index] ?? item.expanded_scope_lines.join("\n");
      });

      return next;
    });
  }, [documentData]);

  useEffect(() => {
    if (!saveNotice) return;

    const timeout = window.setTimeout(() => setSaveNotice(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [saveNotice]);

  const effectiveDocumentData = useMemo(() => {
    if (!documentData) return null;

    return {
      ...documentData,
      tax_percentage:
        documentData.tax_percentage === "N/A"
          ? 0
          : Number(documentData.tax_percentage) || 0,
    };
  }, [documentData]);

  const computed = useMemo(() => {
    if (!effectiveDocumentData) return null;
    return getBidEditorComputedValues(effectiveDocumentData);
  }, [effectiveDocumentData]);

  const previewHtml = useMemo(() => {
    if (!effectiveDocumentData) return "";
    return renderBidEditorHtml(effectiveDocumentData);
  }, [effectiveDocumentData]);

  const updateField = <K extends keyof BidFormProposalDocument>(
    field: K,
    value: BidFormProposalDocument[K]
  ) => {
    if (isReadOnly) return;

    setHasUnsavedChanges(true);
    setDocumentData((current) => (current ? { ...current, [field]: value } : current));
  };

  const updateLineItem = (
    index: number,
    updater: (
      lineItem: BidFormProposalDocument["line_items"][number]
    ) => BidFormProposalDocument["line_items"][number],
    shouldMarkDirty = true
  ) => {
    if (isReadOnly) return;

    if (shouldMarkDirty) {
      setHasUnsavedChanges(true);
    }

    setDocumentData((current) => {
      if (!current) return current;

      return {
        ...current,
        line_items: current.line_items.map((item, itemIndex) =>
          itemIndex === index ? updater(item) : item
        ),
      };
    });
  };

  const handleNumberFieldChange = <K extends keyof BidFormProposalDocument>(
    field: K,
    value: string
  ) => {
    if (isReadOnly) return;

    if (value === "") {
      updateField(field, 0 as BidFormProposalDocument[K]);
      return;
    }

    updateField(field, Number(value) as BidFormProposalDocument[K]);
  };

  const handleLineScopeKeyDown = (
    index: number,
    event: ReactKeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (isReadOnly) return;

    if (event.key !== "Enter") return;

    event.preventDefault();

    const textarea = event.currentTarget;
    const cursorPos = textarea.selectionStart;
    const currentValue = scopeDrafts[index] ?? textarea.value;
    const nextValue =
      currentValue.slice(0, cursorPos) + "\n- " + currentValue.slice(cursorPos);

    setScopeDrafts((current) => ({
      ...current,
      [index]: nextValue,
    }));

    updateLineItem(index, (current) => ({
      ...current,
      expanded_scope_lines: normalizeScopeDraft(nextValue),
    }));

    requestAnimationFrame(() => {
      textarea.selectionStart = cursorPos + 3;
      textarea.selectionEnd = cursorPos + 3;
      autoResizeTextarea(textarea);
    });
  };

  const handleLineTotalChange = (index: number, value: string) => {
    if (isReadOnly) return;

    const cleaned = value.replace(/[^0-9.]/g, "");
    setHasUnsavedChanges(true);
    setLineTotalDrafts((current) => ({
      ...current,
      [index]: cleaned,
    }));
  };

  const handleScopeDraftChange = (index: number, value: string) => {
    if (isReadOnly) return;

    setHasUnsavedChanges(true);
    setScopeDrafts((current) => ({
      ...current,
      [index]: value,
    }));
  };

  const handleScopeDraftBlur = (index: number) => {
    if (isReadOnly) return;

    const nextValue = scopeDrafts[index] ?? "";

    updateLineItem(index, (current) => ({
      ...current,
      expanded_scope_lines: normalizeScopeDraft(nextValue),
    }), false);
  };

  const handleLineTotalFocus = (index: number) => {
    if (isReadOnly) return;
    if (!documentData) return;

    setLineTotalDrafts((current) => ({
      ...current,
      [index]: toEditableCurrency(documentData.line_items[index]?.line_total ?? 0),
    }));
  };

  const handleLineTotalBlur = (index: number) => {
    if (isReadOnly) return;

    const draftValue = lineTotalDrafts[index] ?? "";
    const parsedValue = parseCurrencyInput(draftValue);

    updateLineItem(index, (current) => ({
      ...current,
      line_total: parsedValue,
    }), false);

    setLineTotalDrafts((current) => ({
      ...current,
      [index]: formatCurrencyInput(parsedValue),
    }));
  };

  const persistProposalChanges = async () => {
    if (!record?.id || !effectiveDocumentData || !user) return null;

    const html = renderBidEditorHtml(effectiveDocumentData);

    await updateDoc(doc(firestore, "bidFormProposals", record.id), {
      documentData: effectiveDocumentData,
      html,
      status: "ready",
      updatedAt: serverTimestamp(),
    });
    await touchBidFormUpdatedAt(bidId);
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

      const invoiceNumber = saved.documentData.invoice_number?.trim();
      const rawPdfFileName = invoiceNumber
        ? `Invoice # ${invoiceNumber}`
        : record?.title || "invoice";
      const pdfFileName = rawPdfFileName
        .trim()
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "") || "invoice";

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

  const handleBackClick = () => {
    if (hasUnsavedChanges) {
      setShowBackConfirm(true);
      return;
    }

    navigateWithScrollReset(`/bids/${bidId}`);
  };

  const handleRegenerateClick = () => {
    navigateWithScrollReset(`/bids/${bidId}/form`);
  };

  if (!record) {
    return (
      <div className="past-bids-container bid-workspace-change-orders-page">
        <div className="past-bids-empty">
          No proposal created yet. Submit this bid to auto-generate your proposal.
        </div>
      </div>
    );
  }

  if (record.status !== "ready" || !documentData || !computed) {
    const loadingMessage =
      record.status === "generating" && documentData
        ? updatingStateMessage
        : emptyStateMessage;

    return (
      <div className="suros-gradient bid-editor-page">
        <button
          className="bid-editor-back"
          onClick={handleBackClick}
        >
          ← Back
        </button>

        <div className="bid-editor-loading-card">
          <h1>{record.title || "Bid Proposal"}</h1>
          {record.status === "error" ? (
            <div className="bid-editor-error-state">
              <p>
                {record.errorMessage || "We hit an error generating this proposal."}
              </p>
              <p>
                Click below to navigate back and regenerate the bid proposal.
              </p>
              <button
                type="button"
                className="bid-editor-regenerate-button"
                onClick={handleRegenerateClick}
              >
                Resubmit Bid and Regenerate
              </button>
            </div>
          ) : (
            <div className="bid-editor-loading-inline">
              <div className="bid-editor-loading-spinner" />
              <p>{loadingMessage}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const clientLines = [
    { key: "customer_name" as const, value: documentData.customer_name },
    { key: "customer_address" as const, value: documentData.customer_address },
    ...(documentData.customer_phone !== "N/A"
      ? [{ key: "customer_phone" as const, value: documentData.customer_phone }]
      : []),
    ...(documentData.customer_email !== "N/A"
      ? [{ key: "customer_email" as const, value: documentData.customer_email }]
      : []),
  ];

  return (
    <div className="dashboard-wrapper bid-editor-shell">
      <div className="bid-editor-topbar">
        <button
          className="bid-editor-back"
          onClick={handleBackClick}
        >
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
            {downloadError} Click below to navigate back and regenerate the bid proposal.
          </p>
          <button
            type="button"
            className="bid-editor-regenerate-button"
            onClick={handleRegenerateClick}
          >
            Resubmit Bid and Regenerate
          </button>
        </div>
      )}

      <div className="bid-editor-document-shell">
        <div className={`bid-editor-document ${isReadOnly ? "is-read-only" : ""}`}>
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
                    className="bid-editor-header-line bid-editor-header-inverse"
                  />
                  <EditableField
                    value={documentData.company_phone}
                    onChange={(value) => updateField("company_phone", value)}
                    className="bid-editor-header-line bid-editor-header-inverse"
                  />
                  <EditableField
                    value={documentData.company_email}
                    onChange={(value) => updateField("company_email", value)}
                    className="bid-editor-header-line bid-editor-header-link"
                  />
                </td>
              </tr>
            </tbody>
          </table>

          <div className="bid-editor-document-inner">
            <table cellPadding={8} cellSpacing={0}>
              <tbody>
                <tr>
                  <td>
                    <strong className="bid-editor-label-lg">Invoice Date</strong>
                    <DateDisplayField
                      value={documentData.invoice_date}
                      onChange={(value) => updateField("invoice_date", value)}
                      readOnly={isReadOnly}
                    />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="bid-editor-invoice-heading">
                      <strong className="bid-editor-label-lg bid-editor-invoice-label">
                        INVOICE #
                      </strong>
                      <EditableField
                        value={documentData.invoice_number}
                        onChange={(value) => updateField("invoice_number", value)}
                        className="bid-editor-meta-input bid-editor-meta-input-right bid-editor-invoice-number-input"
                        align="right"
                        style={{
                          width: `${Math.max(documentData.invoice_number.length || 0, 1)}ch`,
                        }}
                      />
                    </div>
                    <div className="bid-editor-slogan-wrap">
                      <EditableField
                        value={documentData.company_slogan}
                        onChange={(value) => updateField("company_slogan", value)}
                        className="bid-editor-slogan-input"
                        multiline
                        rows={1}
                        align="right"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <table cellPadding={10} cellSpacing={0} className="bid-editor-card-table">
              <tbody>
                <tr>
                  <td>
                    <strong className="bid-editor-label-lg">CLIENT</strong>
                    <div className="bid-editor-client-stack">
                      {clientLines.map((line) => (
                        <EditableField
                          key={line.key}
                          value={line.value}
                          onChange={(value) => updateField(line.key, value)}
                          className="bid-editor-client-line"
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <table cellPadding={10} cellSpacing={0} className="bid-editor-card-table">
              <tbody>
                <tr>
                  <td width="25%">
                    <strong className="bid-editor-label-lg">SALESPERSON</strong>
                    <EditableField
                      value={documentData.salesperson}
                      onChange={(value) => updateField("salesperson", value)}
                      multiline
                      rows={2}
                    />
                  </td>
                  <td width="25%">
                    <strong className="bid-editor-label-lg">JOB</strong>
                    <EditableField
                      value={documentData.job}
                      onChange={(value) => updateField("job", value)}
                      multiline
                      rows={2}
                    />
                  </td>
                  <td width="30%">
                    <strong className="bid-editor-label-lg">PAYMENT TERMS</strong>
                    <EditableField
                      value={documentData.payment_terms}
                      onChange={(value) => updateField("payment_terms", value)}
                      multiline
                      rows={4}
                    />
                  </td>
                  <td width="20%">
                    <strong className="bid-editor-label-lg">WORKING WEEKS</strong>
                    <EditableField
                      value={String(documentData.approx_weeks)}
                      onChange={(value) => updateField("approx_weeks", value)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            <h2 className="bid-editor-description-heading">Description</h2>

            <table cellPadding={8} cellSpacing={0} className="bid-editor-line-items-table">
              <thead>
                <tr style={{ background: "#e3f2fd" }}>
                  <th style={{ width: 40 }} align="left">#</th>
                  <th align="left">Scope</th>
                  <th style={{ width: 160 }} align="right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {documentData.line_items.map((item, index) => (
                  <tr key={index} style={{ pageBreakInside: "auto", breakInside: "auto" }}>
                    <td className="bid-editor-line-cell bid-editor-line-index">{index + 1}</td>
                    <td className="bid-editor-line-cell">
                      <EditableField
                        value={item.trade}
                        onChange={(value) =>
                          updateLineItem(index, (current) => ({ ...current, trade: value }))
                        }
                        className="bid-editor-trade-input"
                      />

                      <div className="bid-editor-material-line">
                        Material &amp; Labor Included:
                        <select
                          className="bid-editor-inline-select"
                          value={item.material_labor_included}
                          disabled={isReadOnly}
                          onChange={(e) =>
                            updateLineItem(index, (current) => ({
                              ...current,
                              material_labor_included: e.target.value === "No" ? "No" : "Yes",
                            }))
                          }
                        >
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </div>

                      <div>
                        <textarea
                          className="bid-editor-scope-line"
                          rows={Math.max(3, (scopeDrafts[index] ?? item.expanded_scope_lines.join("\n")).split(/\r?\n/).length)}
                          value={scopeDrafts[index] ?? item.expanded_scope_lines.join("\n")}
                          readOnly={isReadOnly}
                          onInput={(e) => autoResizeTextarea(e.currentTarget)}
                          onKeyDown={(e) => handleLineScopeKeyDown(index, e)}
                          onChange={(e) => handleScopeDraftChange(index, e.target.value)}
                          onBlur={() => handleScopeDraftBlur(index)}
                          ref={(node) => {
                            if (node) autoResizeTextarea(node);
                          }}
                        />
                      </div>
                    </td>
                    <td className="bid-editor-line-total-cell">
                      <EditableField
                        value={lineTotalDrafts[index] ?? formatCurrencyInput(item.line_total)}
                        onChange={(value) => handleLineTotalChange(index, value)}
                        className="bid-editor-money-input"
                        align="right"
                        type="text"
                        onFocus={() => handleLineTotalFocus(index)}
                        onBlur={() => handleLineTotalBlur(index)}
                      />
                    </td>
                  </tr>
                ))}

                <tr>
                  <td colSpan={2} align="right"><strong>Subtotal</strong></td>
                  <td align="right"><strong>{formatUsd(computed.subtotal)}</strong></td>
                </tr>
              </tbody>
            </table>

            <table cellPadding={10} cellSpacing={0} className="bid-editor-card-table">
              <tbody>
                <tr>
                  <td>
                    <strong className="bid-editor-label-lg">
                      Contingency Coverage (
                      <EditableField
                        value={getNumberInputValue(documentData.contingency_percentage)}
                        onChange={(value) => handleNumberFieldChange("contingency_percentage", value)}
                        className="bid-editor-percent-input"
                      />
                      %)
                    </strong>
                    <EditableField
                      value={documentData.contingency_coverage}
                      onChange={(value) => updateField("contingency_coverage", value)}
                      multiline
                      rows={1}
                      className="bid-editor-contingency-text"
                    />
                  </td>
                  <td align="right" width="200" className="bid-editor-money-strong">
                    {formatUsd(computed.contingencyAmount)}
                  </td>
                </tr>
              </tbody>
            </table>

            <table
              cellPadding={10}
              cellSpacing={0}
              className="bid-editor-totals-table"
              style={{
                borderCollapse: "collapse",
                border: "2px solid #2A3439",
                marginTop: "18px",
                background: "#ffffff",
                width: "440px",
                marginLeft: "auto",
              }}
            >
              <tbody>
                <tr>
                  <td align="right" className="bid-editor-totals-label">
                    <span className="bid-editor-totals-inline-wrap">
                      <span>Tax (</span>
                      <EditableField
                        value={getNumberInputValue(documentData.tax_percentage)}
                        onChange={(value) => handleNumberFieldChange("tax_percentage", value)}
                        className="bid-editor-percent-input"
                        align="right"
                      />
                      <span>%)</span>
                    </span>
                  </td>
                  <td align="right" className="bid-editor-totals-label">
                    {Number(effectiveDocumentData?.tax_percentage ?? 0) === 0
                      ? "N/A"
                      : formatUsd(computed.taxAmount)}
                  </td>
                </tr>
                <tr>
                  <td align="right" className="bid-editor-totals-label">Total Cost</td>
                  <td align="right" className="bid-editor-totals-label">{formatUsd(computed.totalCosts)}</td>
                </tr>
                <tr>
                  <td align="right" className="bid-editor-totals-label">
                    <span className="bid-editor-totals-inline-wrap">
                      <span>Deposit (</span>
                      <EditableField
                        value={getNumberInputValue(documentData.deposit_percentage)}
                        onChange={(value) => handleNumberFieldChange("deposit_percentage", value)}
                        className="bid-editor-percent-input"
                        align="right"
                      />
                      <span>%)</span>
                    </span>
                  </td>
                  <td align="right" className="bid-editor-totals-label">{formatUsd(computed.depositAmount)}</td>
                </tr>
                <tr>
                  <td align="right" className="bid-editor-totals-label">
                    <span className="bid-editor-totals-inline-wrap">
                      <span>Weekly Progress Payments ×</span>
                      <EditableField
                        value={getNumberInputValue(documentData.weekly_payments)}
                        onChange={(value) => handleNumberFieldChange("weekly_payments", value)}
                        className="bid-editor-percent-input"
                        align="right"
                      />
                    </span>
                  </td>
                  <td align="right" className="bid-editor-totals-label">{formatUsd(computed.weeklyPaymentAmount)}</td>
                </tr>
              </tbody>
            </table>

            <div className="bid-editor-signature-section">
              <div className="bid-editor-signature-block">
                <strong className="bid-editor-signature-label">Quotation prepared by:</strong>
                <div className="bid-editor-signature-line" />
              </div>

              <div className="bid-editor-contract-copy">
                This is a contract on the goods and services described in scope of work,
                conditions subject to change only with approval from{" "}
                <strong>{documentData.customer_name}</strong> and{" "}
                <strong>{documentData.company_name}</strong>
              </div>

              <div className="bid-editor-signature-block">
                <strong className="bid-editor-signature-label">
                  To accept this quotation, please print and sign here:
                </strong>
                <div className="bid-editor-signature-line" />
              </div>

              <div className="bid-editor-signature-block">
                <strong className="bid-editor-signature-label">Date:</strong>
                <div className="bid-editor-signature-line bid-editor-signature-line-date" />
              </div>

              <div className="bid-editor-footer">
                <strong>THANK YOU FOR YOUR BUSINESS!</strong>
              </div>
            </div>

            <div className="bid-editor-helper">
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
                onClick={() => navigateWithScrollReset(`/bids/${bidId}`)}
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
