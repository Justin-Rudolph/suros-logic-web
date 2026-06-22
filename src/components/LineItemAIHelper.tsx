import { useEffect, useRef, useState } from "react";
import { getFunctionsBaseUrl } from "@/lib/functionsApi";
import { EstimateResponse, EstimateTier, SavedEstimate } from "@/pages/Form/types";

interface SiblingLineItem {
  trade: string;
  scope: string;
}

interface Props {
  tradeName?: string | null;
  scope: string;
  zipCode: string | null;
  onApplyTotal?: (amount: number) => void;
  onUpdateScope?: (scope: string) => void;
  initialEstimate?: SavedEstimate;
  onSaveEstimate?: (estimate: EstimateResponse) => void;
  siblingLineItems?: SiblingLineItem[];
  currentLineTotal?: string;
}

export default function LineItemAIHelper({
  tradeName,
  scope,
  zipCode,
  onApplyTotal,
  onUpdateScope,
  initialEstimate,
  onSaveEstimate,
  siblingLineItems,
  currentLineTotal,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<EstimateResponse | null>(
    initialEstimate
      ? { status: initialEstimate.status, estimates: { average_price: initialEstimate.average_price, high_tier_price: initialEstimate.high_tier_price } }
      : null
  );
  const [open, setOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<"average_price" | "high_tier_price">("average_price");
  const [showBypassWarning, setShowBypassWarning] = useState(false);
  const [questionResponses, setQuestionResponses] = useState<Record<string, string>>({});
  const [loadingMessage, setLoadingMessage] = useState("Generating Estimate...");
  const [hasAskedInitialQuestions, setHasAskedInitialQuestions] = useState(false);
  const [estimateError, setEstimateError] = useState(false);
  const preserveAnswersRef = useRef(false);
  const descriptionScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (descriptionScrollRef.current) {
      descriptionScrollRef.current.scrollTop = 0;
    }
  }, [selectedTier]);

  const parseCurrencyToNumber = (value?: string) => {
    if (!value) return 0;
    const numericValue = Number(value.replace(/[^0-9.-]+/g, ""));
    return Number.isFinite(numericValue) ? numericValue : 0;
  };

  const getTierEstimate = (
    data: EstimateResponse | null,
    tier: "average_price" | "high_tier_price"
  ): EstimateTier | null => {
    if (!data || data.status !== "complete") return null;
    if (tier === "average_price") return data.estimates?.average_price || data.estimate || null;
    return data.estimates?.high_tier_price || null;
  };

  useEffect(() => {
    if (preserveAnswersRef.current) return;
    if (response?.status === "incomplete" && response.questions?.length) {
      setQuestionResponses(
        response.questions.reduce<Record<string, string>>((acc, question) => {
          acc[question] = "";
          return acc;
        }, {})
      );
    } else {
      setQuestionResponses({});
    }
  }, [response]);

  const requestEstimate = async ({
    description,
    tradeName,
    bypass = false,
    forceQuestions = false,
    questionsAlreadyAsked = false,
    mode,
    responses,
  }: {
    description: string;
    tradeName?: string | null;
    bypass?: boolean;
    forceQuestions?: boolean;
    questionsAlreadyAsked?: boolean;
    mode?: "merge_scope";
    responses?: Array<{ question: string; response: string }>;
  }) => {
    if (!description.trim()) return null;
    const activeSiblings = (siblingLineItems ?? []).filter((s) => s.scope?.trim());
    const res = await fetch(`${getFunctionsBaseUrl()}/generateEstimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        ...(tradeName?.trim() ? { tradeName: tradeName.trim() } : {}),
        zipCode,
        ...(mode ? { mode } : {}),
        ...(responses ? { responses } : {}),
        ...(bypass ? { bypass: true } : {}),
        ...(forceQuestions ? { forceQuestions: true } : {}),
        ...(questionsAlreadyAsked ? { questionsAlreadyAsked: true } : {}),
        ...(activeSiblings.length ? { siblingLineItems: activeSiblings } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
    return res.json();
  };

  const generateEstimate = async (overrideScope?: string) => {
    const description = overrideScope ?? scope;
    if (!description.trim()) return;
    try {
      const shouldAskInitialQuestions = !hasAskedInitialQuestions;
      if (shouldAskInitialQuestions) setHasAskedInitialQuestions(true);
      setEstimateError(false);
      setResponse(null);
      setSelectedTier("average_price");
      setLoadingMessage("Generating Estimate...");
      setLoading(true);
      const data = await requestEstimate({
        description,
        tradeName,
        forceQuestions: shouldAskInitialQuestions,
        questionsAlreadyAsked: !shouldAskInitialQuestions,
      });
      if (!data?.status || (data.status !== "complete" && data.status !== "incomplete")) {
        setEstimateError(true);
      }
      setResponse(data);
      if (data?.status === "complete") onSaveEstimate?.(data);
      setOpen(true);
    } catch (err) {
      console.error(err);
      setEstimateError(true);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateEstimateClick = () => {
    void generateEstimate();
  };

  const bypassGenerate = async () => {
    try {
      setHasAskedInitialQuestions(true);
      setEstimateError(false);
      setSelectedTier("average_price");
      setLoadingMessage("Generating Estimate...");
      setLoading(true);
      const data = await requestEstimate({ description: scope, tradeName, bypass: true });
      if (!data?.status || (data.status !== "complete" && data.status !== "incomplete")) {
        setEstimateError(true);
      }
      setResponse(data);
      if (data?.status === "complete") onSaveEstimate?.(data);
    } catch (err) {
      console.error(err);
      setEstimateError(true);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleQuestionResponseChange = (question: string, value: string) => {
    setQuestionResponses((prev) => ({ ...prev, [question]: value }));
  };

  const handleAddResponses = async () => {
    const answeredEntries = Object.entries(questionResponses).filter(([, value]) => value.trim());
    if (!answeredEntries.length) return;
    preserveAnswersRef.current = true;
    try {
      setEstimateError(false);
      setLoadingMessage("Updating scope and regenerating estimate...");
      setLoading(true);
      const mergeResult = await requestEstimate({
        description: scope,
        tradeName,
        mode: "merge_scope",
        responses: answeredEntries.map(([question, response]) => ({
          question,
          response: response.trim(),
        })),
      });
      const updatedScope = mergeResult?.merged_scope?.trim() || scope;
      onUpdateScope?.(updatedScope);
      preserveAnswersRef.current = false;
      setQuestionResponses({});
      await generateEstimate(updatedScope);
    } catch (err) {
      console.error(err);
      preserveAnswersRef.current = false;
      setEstimateError(true);
      setLoading(false);
    }
  };

  const hasResponsesToAdd = Object.values(questionResponses).some((v) => v.trim());

  return (
    <>
      {/* TRIGGER BUTTONS */}
      <div style={{ display: "flex", flexDirection: "row", gap: "8px", alignItems: "center", marginLeft: "6px", marginTop: "8px", marginBottom: "14px" }}>
        <button
          type="button"
          onClick={handleGenerateEstimateClick}
          disabled={loading}
          style={{
            flexShrink: 0,
            height: "40px",
            padding: "0 12px",
            background: loading ? "#7aa8cf" : "#1e73be",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "12px",
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            opacity: loading ? 0.9 : 1,
          }}
        >
          {loading && (
            <span style={{
              width: "12px", height: "12px",
              border: "2px solid rgba(255,255,255,0.45)",
              borderTop: "2px solid #fff",
              borderRadius: "50%",
              animation: "spin 0.85s linear infinite",
              flexShrink: 0,
            }} />
          )}
          <span>{loading ? "Generating..." : "Generate Estimate"}</span>
        </button>

        {response && (
          <button
            type="button"
            onClick={() => {
              if (loading) return;
              const highTier = getTierEstimate(response, "high_tier_price");
              if (highTier && currentLineTotal) {
                const lineTotalNum = parseCurrencyToNumber(currentLineTotal);
                const premiumNum = parseCurrencyToNumber(highTier.total_cost);
                setSelectedTier(lineTotalNum === premiumNum ? "high_tier_price" : "average_price");
              } else {
                setSelectedTier("average_price");
              }
              setOpen(true);
            }}
            disabled={loading}
            style={{
              height: "40px", padding: "0 12px",
              background: loading ? "#8c8c8c" : "#444",
              color: "#fff", border: "none", borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "12px", whiteSpace: "nowrap",
              opacity: loading ? 0.8 : 1,
            }}
          >
            View Estimate
          </button>
        )}
      </div>

      {/* MAIN MODAL */}
      {open && (response || loading || estimateError) && (
        <div style={{
          position: "fixed", inset: 0,
          backgroundColor: "rgba(15,23,42,0.65)",
          backdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "20px", zIndex: 9999,
        }}>
          <div style={{
            background: "#fff",
            borderRadius: "14px",
            width: "100%",
            maxWidth: "580px",
            boxShadow: "0 25px 60px -10px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.06)",
            position: "relative",
            color: "#111827",
            maxHeight: "88vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>

            {/* MODAL HEADER */}
            <div style={{
              padding: "18px 20px 14px",
              borderBottom: "1px solid #F1F5F9",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "12px",
              flexShrink: 0,
            }}>
              <div>
                {!loading && response?.status === "incomplete" && (
                  <>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
                      Additional Details Needed
                    </h3>
                    <p style={{ margin: "5px 0 0", color: "#6B7280", fontSize: "12.5px", lineHeight: 1.55 }}>
                      Answer only the questions you see fit — each response improves accuracy.
                      Use <strong style={{ color: "#374151", fontWeight: 600 }}>Bypass</strong> to skip and generate from current info only.
                    </p>
                  </>
                )}
                {!loading && response?.status === "complete" && (
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                      AI Estimate
                    </h3>
                )}
                {!loading && estimateError && (
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#DC2626" }}>
                    Something Went Wrong
                  </h3>
                )}
                {loading && (
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                    Working on it...
                  </h3>
                )}
              </div>

              <button
                onClick={() => setOpen(false)}
                style={{
                  flexShrink: 0,
                  width: "28px", height: "28px",
                  background: "#F1F5F9",
                  border: "none", borderRadius: "6px",
                  cursor: "pointer", color: "#6B7280",
                  fontSize: "13px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>

            {/* MODAL BODY */}
            <div style={{ padding: "20px", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* — QUESTIONS STATE — */}
              {!loading && response?.status === "incomplete" && (
                <>
                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", marginBottom: "16px" }}>
                    {response.questions?.map((q: string, i: number) => (
                      <div
                        key={i}
                        style={{
                          marginBottom: "12px",
                          background: "#F8FAFC",
                          border: "1px solid #E2E8F0",
                          borderRadius: "9px",
                          padding: "13px 15px",
                        }}
                      >
                        <label style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "9px",
                          marginBottom: "9px",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#1F2937",
                          lineHeight: 1.45,
                          cursor: "default",
                        }}>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "19px", height: "19px",
                            minWidth: "19px",
                            background: "#1E73BE",
                            color: "#fff",
                            borderRadius: "50%",
                            fontSize: "9px",
                            fontWeight: 700,
                            marginTop: "1px",
                          }}>
                            {i + 1}
                          </span>
                          {q}
                        </label>
                        <textarea
                          value={questionResponses[q] || ""}
                          onChange={(e) => handleQuestionResponseChange(q, e.target.value)}
                          placeholder="Type your response here..."
                          rows={2}
                          style={{
                            width: "100%",
                            padding: "8px 11px",
                            borderRadius: "6px",
                            border: "1px solid #D1D5DB",
                            resize: "vertical",
                            fontFamily: "inherit",
                            fontSize: "13px",
                            color: "#111827",
                            background: "#fff",
                            boxSizing: "border-box",
                            outline: "none",
                            lineHeight: 1.5,
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    paddingTop: "14px",
                    borderTop: "1px solid #F1F5F9",
                    flexShrink: 0,
                  }}>
                    <button
                      type="button"
                      onClick={() => setShowBypassWarning(true)}
                      disabled={loading}
                      style={{
                        background: "transparent",
                        color: "#6B7280",
                        border: "1px solid #D1D5DB",
                        padding: "8px 14px",
                        borderRadius: "6px",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontWeight: 500,
                        fontSize: "12.5px",
                        opacity: loading ? 0.6 : 1,
                      }}
                    >
                      Bypass
                    </button>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <button
                        onClick={() => setOpen(false)}
                        style={{
                          background: "transparent",
                          color: "#6B7280",
                          border: "none",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "12.5px",
                          fontWeight: 500,
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddResponses}
                        disabled={!hasResponsesToAdd || loading}
                        style={{
                          background: !hasResponsesToAdd || loading ? "#E2E8F0" : "#1E73BE",
                          color: !hasResponsesToAdd || loading ? "#9CA3AF" : "#fff",
                          border: "none",
                          padding: "8px 18px",
                          borderRadius: "6px",
                          cursor: !hasResponsesToAdd || loading ? "not-allowed" : "pointer",
                          fontWeight: 600,
                          fontSize: "12.5px",
                        }}
                      >
                        {loading ? "Working..." : "Submit & Generate"}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* — ERROR STATE — */}
              {!loading && estimateError && (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 20px",
                  gap: "16px",
                  textAlign: "center",
                }}>
                  <div style={{
                    width: "44px", height: "44px",
                    background: "#FEF2F2",
                    border: "1px solid #FECACA",
                    borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "20px",
                  }}>
                    ✕
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: "#111827", fontSize: "14px", marginBottom: "6px" }}>
                      Unable to generate estimate
                    </div>
                    <div style={{ color: "#6B7280", fontSize: "13px", lineHeight: 1.5 }}>
                      Something went wrong on our end. Please close this and try again.
                    </div>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    style={{
                      background: "transparent",
                      border: "1px solid #E2E8F0",
                      color: "#374151",
                      padding: "8px 20px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 500,
                      marginTop: "4px",
                    }}
                  >
                    Close
                  </button>
                </div>
              )}

              {/* — LOADING STATE — */}
              {loading && (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "52px 20px",
                  gap: "16px",
                }}>
                  <div style={{
                    width: "36px", height: "36px",
                    border: "3px solid #E2E8F0",
                    borderTop: "3px solid #1E73BE",
                    borderRadius: "50%",
                    animation: "spin 0.9s linear infinite",
                  }} />
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: 600, color: "#111827", fontSize: "14px" }}>
                      {loadingMessage}
                    </div>
                    <div style={{ color: "#9CA3AF", fontSize: "12px", marginTop: "4px" }}>
                      This may take a few moments
                    </div>
                  </div>
                </div>
              )}

              {/* — COMPLETE ESTIMATE STATE — */}
              {!loading && response?.status === "complete" && (() => {
                const activeEstimate = getTierEstimate(response, selectedTier);
                return (
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                    {/* Tier switcher */}
                    <div style={{
                      display: "flex",
                      background: "#F1F5F9",
                      borderRadius: "8px",
                      padding: "3px",
                      marginBottom: "18px",
                      gap: "2px",
                    }}>
                      {[
                        { key: "average_price", label: "Standard" },
                        { key: "high_tier_price", label: "Premium" },
                      ].map((tier) => {
                        const isActive = selectedTier === tier.key;
                        const isDisabled = !getTierEstimate(response, tier.key as "average_price" | "high_tier_price");
                        return (
                          <button
                            key={tier.key}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => setSelectedTier(tier.key as "average_price" | "high_tier_price")}
                            style={{
                              flex: 1,
                              background: isActive ? "#fff" : "transparent",
                              color: isActive ? "#111827" : "#6B7280",
                              border: "none",
                              borderRadius: "6px",
                              padding: "7px 12px",
                              cursor: isDisabled ? "not-allowed" : "pointer",
                              fontWeight: isActive ? 600 : 500,
                              fontSize: "13px",
                              boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                              opacity: isDisabled ? 0.4 : 1,
                            }}
                          >
                            {tier.label}
                          </button>
                        );
                      })}
                    </div>

                    {activeEstimate ? (
                      <>
                        {/* Hero total */}
                        <div style={{
                          background: "#F8FAFC",
                          border: "1px solid #E2E8F0",
                          borderRadius: "10px",
                          padding: "16px 18px",
                          marginBottom: "10px",
                        }}>
                          <div style={{
                            fontSize: "11px", fontWeight: 700,
                            color: "#9CA3AF", letterSpacing: "0.06em",
                            textTransform: "uppercase", marginBottom: "4px",
                          }}>
                            Total Estimate
                          </div>
                          <div style={{ fontSize: "28px", fontWeight: 700, color: "#111827", lineHeight: 1.1 }}>
                            {activeEstimate.total_cost}
                          </div>
                        </div>

                        {/* Material + Labor */}
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "8px",
                          marginBottom: "12px",
                        }}>
                          {[
                            { label: "Materials", value: activeEstimate.material_cost },
                            { label: "Labor", value: activeEstimate.labor_cost },
                          ].map(({ label, value }) => (
                            <div key={label} style={{
                              background: "#fff",
                              border: "1px solid #E2E8F0",
                              borderRadius: "8px",
                              padding: "11px 14px",
                            }}>
                              <div style={{
                                fontSize: "11px", fontWeight: 700,
                                color: "#9CA3AF", letterSpacing: "0.05em",
                                textTransform: "uppercase", marginBottom: "3px",
                              }}>
                                {label}
                              </div>
                              <div style={{ fontSize: "15px", fontWeight: 600, color: "#374151" }}>
                                {value}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Description */}
                        {(activeEstimate.description || response.explanation) && (() => {
                          const raw = activeEstimate.description || response.explanation || "";
                          const lines = raw.split("\n").map((l: string) => l.trim()).filter((l: string) => l);
                          const isBulletList = lines.length > 1;
                          return (
                            <div ref={descriptionScrollRef} style={{
                              background: "#FAFAFA",
                              border: "1px solid #F1F5F9",
                              borderRadius: "8px",
                              padding: "11px 14px",
                              marginBottom: "16px",
                              flex: 1,
                              minHeight: 0,
                              overflowY: "auto",
                            }}>
                              {isBulletList ? (
                                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                                  {lines.map((line: string, i: number) => (
                                    <li key={i} style={{
                                      display: "flex",
                                      gap: "7px",
                                      fontSize: "14px",
                                      color: "#111827",
                                      lineHeight: 1.6,
                                      paddingBottom: i < lines.length - 1 ? "5px" : 0,
                                    }}>
                                      <span style={{ color: "#6B7280", flexShrink: 0, marginTop: "1px" }}>—</span>
                                      <span>{line.replace(/^-+\s*/, "")}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p style={{ margin: 0, fontSize: "14px", color: "#111827", lineHeight: 1.6 }}>
                                  {raw.trim()}
                                </p>
                              )}
                            </div>
                          );
                        })()}

                        {/* Actions */}
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "10px",
                          paddingTop: "14px",
                          borderTop: "1px solid #F1F5F9",
                          flexShrink: 0,
                        }}>
                          <button
                            onClick={() => setOpen(false)}
                            style={{
                              background: "transparent",
                              border: "1px solid #E2E8F0",
                              color: "#6B7280",
                              padding: "8px 16px",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "13px",
                              fontWeight: 500,
                            }}
                          >
                            Close
                          </button>
                          <button
                            onClick={() => {
                              onApplyTotal?.(parseCurrencyToNumber(activeEstimate.total_cost));
                              setOpen(false);
                            }}
                            style={{
                              background: "#16A34A",
                              color: "#fff",
                              border: "none",
                              padding: "8px 20px",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontWeight: 600,
                              fontSize: "13px",
                            }}
                          >
                            Apply to Line Total
                          </button>
                        </div>
                      </>
                    ) : (
                      <p style={{ color: "#6B7280", fontSize: "13px" }}>
                        This estimate tier is not available.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* BYPASS WARNING MODAL */}
      {showBypassWarning && (
        <div style={{
          position: "fixed", inset: 0,
          backgroundColor: "rgba(15,23,42,0.65)",
          backdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10000, padding: "20px",
        }}>
          <div style={{
            background: "#fff",
            borderRadius: "14px",
            maxWidth: "400px",
            width: "100%",
            boxShadow: "0 25px 60px -10px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}>
            {/* Warning band */}
            <div style={{
              background: "#D97706",
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}>
              <div style={{
                width: "32px", height: "32px", minWidth: "32px",
                background: "rgba(255,255,255,0.2)",
                borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "16px",
              }}>
                ⚠
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13.5px", color: "#fff" }}>
                  Reduced Accuracy Warning
                </div>
                <div style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.8)", marginTop: "1px" }}>
                  Estimate will be based on limited information
                </div>
              </div>
            </div>

            <div style={{ padding: "18px 20px 20px" }}>
              <p style={{ margin: "0 0 10px", color: "#374151", fontSize: "13px", lineHeight: 1.6 }}>
                Without the clarifying details, the AI will estimate using <strong>industry averages and assumptions</strong> based only on what's currently entered.
              </p>
              <p style={{ margin: "0 0 20px", color: "#374151", fontSize: "13px", lineHeight: 1.6 }}>
                This is best used for <strong>rough ballpark pricing</strong>. For a more accurate estimate, go back and answer the questions.
              </p>

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowBypassWarning(false);
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid #E2E8F0",
                    color: "#374151",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    if (loading) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setShowBypassWarning(false);
                    void bypassGenerate();
                  }}
                  disabled={loading}
                  style={{
                    background: loading ? "#D97706" : "#B45309",
                    color: "#fff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: "13px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    opacity: loading ? 0.85 : 1,
                  }}
                >
                  {loading && (
                    <span style={{
                      width: "11px", height: "11px",
                      border: "2px solid rgba(255,255,255,0.4)",
                      borderTop: "2px solid #fff",
                      borderRadius: "50%",
                      animation: "spin 0.85s linear infinite",
                      flexShrink: 0,
                    }} />
                  )}
                  {loading ? "Generating..." : "Generate Anyway"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
