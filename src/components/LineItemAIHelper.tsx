import { useEffect, useState } from "react";
import { getFunctionsBaseUrl } from "@/lib/functionsApi";

type EstimateTier = {
  material_cost: string;
  labor_cost: string;
  total_cost: string;
  description?: string;
};

type EstimateResponse = {
  status: "complete" | "incomplete";
  questions?: string[];
  estimate?: EstimateTier;
  explanation?: string;
  merged_scope?: string;
  estimates?: {
    average_price?: EstimateTier;
    high_tier_price?: EstimateTier;
  };
};

interface Props {
  scope: string;
  zipCode: string | null;
  onApplyTotal?: (amount: number) => void;
  onUpdateScope?: (scope: string) => void;
}

export default function LineItemAIHelper({
  scope,
  zipCode,
  onApplyTotal,
  onUpdateScope,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<EstimateResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<"average_price" | "high_tier_price">("average_price");
  const [showBypassWarning, setShowBypassWarning] = useState(false);
  const [questionResponses, setQuestionResponses] = useState<Record<string, string>>({});
  const [loadingMessage, setLoadingMessage] = useState("Generating Estimate...");
  const [hasAskedInitialQuestions, setHasAskedInitialQuestions] = useState(false);

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

    if (tier === "average_price") {
      return data.estimates?.average_price || data.estimate || null;
    }

    return data.estimates?.high_tier_price || null;
  };

  useEffect(() => {
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
    bypass = false,
    forceQuestions = false,
    questionsAlreadyAsked = false,
    mode,
    responses,
  }: {
    description: string;
    bypass?: boolean;
    forceQuestions?: boolean;
    questionsAlreadyAsked?: boolean;
    mode?: "merge_scope";
    responses?: Array<{ question: string; response: string }>;
  }) => {
    if (!description.trim()) return null;

    const res = await fetch(`${getFunctionsBaseUrl()}/generateEstimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        zipCode,
        ...(mode ? { mode } : {}),
        ...(responses ? { responses } : {}),
        ...(bypass ? { bypass: true } : {}),
        ...(forceQuestions ? { forceQuestions: true } : {}),
        ...(questionsAlreadyAsked ? { questionsAlreadyAsked: true } : {}),
      }),
    });

    return res.json();
  };

  const generateEstimate = async (overrideScope?: string) => {
    const description = overrideScope ?? scope;
    if (!description.trim()) return;

    try {
      const shouldAskInitialQuestions = !hasAskedInitialQuestions;

      if (shouldAskInitialQuestions) {
        setHasAskedInitialQuestions(true);
      }

      setResponse(null); // clears previous estimate/questions
      setSelectedTier("average_price");
      setLoadingMessage("Generating Estimate...");
      setLoading(true);
      const data = await requestEstimate({
        description,
        forceQuestions: shouldAskInitialQuestions,
        questionsAlreadyAsked: !shouldAskInitialQuestions,
      });
      setResponse(data);
      setOpen(true);
    } catch (err) {
      console.error(err);
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
      setSelectedTier("average_price");
      setLoadingMessage("Generating Estimate...");
      setLoading(true);
      const data = await requestEstimate({
        description: scope,
        bypass: true,
      });

      // Only update response
      setResponse(data);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuestionResponseChange = (question: string, value: string) => {
    setQuestionResponses((prev) => ({
      ...prev,
      [question]: value,
    }));
  };

  const handleAddResponses = async () => {
    const answeredEntries = Object.entries(questionResponses).filter(([, value]) =>
      value.trim()
    );

    if (!answeredEntries.length) return;

    try {
      setLoadingMessage("Updating scope of work and regenerating estimate...");
      setLoading(true);

      const mergeResult = await requestEstimate({
        description: scope,
        mode: "merge_scope",
        responses: answeredEntries.map(([question, response]) => ({
          question,
          response: response.trim(),
        })),
      });

      const updatedScope = mergeResult?.merged_scope?.trim() || scope;

      onUpdateScope?.(updatedScope);
      setQuestionResponses({});
      await generateEstimate(updatedScope);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const hasResponsesToAdd = Object.values(questionResponses).some((value) =>
    value.trim()
  );

  return (
    <>
      {/* BUTTON ROW */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "8px",
          alignItems: "center",
          marginLeft: "6px",
          marginTop: "8px",
          marginBottom: "14px",
        }}
      >
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
            <span
              style={{
                width: "12px",
                height: "12px",
                border: "2px solid rgba(255,255,255,0.45)",
                borderTop: "2px solid #fff",
                borderRadius: "50%",
                animation: "spin 0.85s linear infinite",
                flexShrink: 0,
              }}
            />
          )}
          <span>{loading ? "Generating..." : "Generate Estimate"}</span>
        </button>

        {response && (
          <button
            type="button"
            onClick={() => {
              if (!loading) setOpen(true);
            }}
            disabled={loading}
            style={{
              height: "40px",
              padding: "0 12px",
              background: loading ? "#8c8c8c" : "#444",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "12px",
              whiteSpace: "nowrap",
              opacity: loading ? 0.8 : 1,
            }}
          >
            View Estimate
          </button>
        )}
      </div>

      {/* MAIN MODAL */}
      {open && response && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "700px",
              padding: "28px",
              boxShadow: "0 30px 60px rgba(0,0,0,0.35)",
              position: "relative",
              color: "#000",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
            {/* CLOSE X */}
            <button
              onClick={() => setOpen(false)}
              style={{
                position: "absolute",
                top: "12px",
                right: "16px",
                background: "transparent",
                border: "none",
                fontSize: "20px",
                cursor: "pointer",
                color: "#000",
              }}
            >
              ✕
            </button>

            {!loading && response.status === "incomplete" && (
              <>
                <h3
                  style={{
                    marginBottom: "16px",
                    fontWeight: "bold",
                    color: "#000",
                  }}
                >
                  More Info Needed (Suggestions)
                </h3>

                <ul
                  style={{
                    listStyle: "none",
                    paddingLeft: 0,
                    marginBottom: "20px",
                    color: "#000",
                  }}
                >
                  {response.questions?.map((q: string, i: number) => (
                    <li
                      key={i}
                      style={{
                        marginBottom: "14px",
                        lineHeight: 1.5,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start" }}>
                        <span style={{ marginRight: "8px" }}>-</span>
                        <span>{q}</span>
                      </div>
                      <textarea
                        value={questionResponses[q] || ""}
                        onChange={(e) =>
                          handleQuestionResponseChange(q, e.target.value)
                        }
                        placeholder="Type your response here to add it to this line item..."
                        rows={3}
                        style={{
                          width: "100%",
                          marginTop: "8px",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #cfcfcf",
                          resize: "vertical",
                          fontFamily: "inherit",
                          fontSize: "14px",
                          color: "#000",
                          boxSizing: "border-box",
                        }}
                      />
                    </li>
                  ))}
                </ul>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "10px",
                  }}
                >
                  <button
                    type="button"
                    onClick={handleAddResponses}
                    disabled={!hasResponsesToAdd || loading}
                    style={{
                      background: !hasResponsesToAdd || loading ? "#b9c3cc" : "#27ae60",
                      color: "#fff",
                      border: "none",
                      padding: "10px 16px",
                      borderRadius: "6px",
                      cursor: !hasResponsesToAdd || loading ? "not-allowed" : "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {loading ? "Working..." : "Add Responses & Re-Generate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBypassWarning(true)}
                    disabled={loading}
                    style={{
                      background: loading ? "#efb27a" : "#e67e22",
                      color: "#fff",
                      border: "none",
                      padding: "10px 16px",
                      borderRadius: "6px",
                      cursor: loading ? "not-allowed" : "pointer",
                      fontWeight: 600,
                      opacity: loading ? 0.85 : 1,
                    }}
                  >
                    Bypass & Generate
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    style={{
                      background: "#1e73be",
                      color: "#fff",
                      border: "none",
                      padding: "10px 16px",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}

            {loading && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 20px",
                  color: "#000",
                  textAlign: "center"
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    border: "4px solid #ddd",
                    borderTop: "4px solid #1e73be",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                    marginBottom: "12px"
                  }}
                />
                <div style={{ fontWeight: 600 }}>
                  {loadingMessage}
                </div>
              </div>
            )}

            {!loading && response.status === "complete" && (
              <>
                <h3 style={{ marginBottom: "16px", fontWeight: "bold" }}>
                  AI Estimate
                </h3>

                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    marginBottom: "16px",
                    flexWrap: "wrap",
                    borderBottom: "1px solid #d9d9d9",
                    paddingBottom: "2px",
                  }}
                >
                  {[
                    { key: "average_price", label: "Average Price" },
                    { key: "high_tier_price", label: "High Tier Price" },
                  ].map((tier) => {
                    const isActive = selectedTier === tier.key;
                    const isDisabled = !getTierEstimate(
                      response,
                      tier.key as "average_price" | "high_tier_price"
                    );

                    return (
                      <button
                        key={tier.key}
                        type="button"
                        disabled={isDisabled}
                        onClick={() =>
                          setSelectedTier(tier.key as "average_price" | "high_tier_price")
                        }
                        style={{
                          background: "transparent",
                          color: isActive ? "#1e73be" : "#555",
                          border: "none",
                          borderBottom: isActive
                            ? "2px solid #1e73be"
                            : "2px solid transparent",
                          padding: "6px 4px 8px",
                          borderRadius: 0,
                          cursor: isDisabled ? "not-allowed" : "pointer",
                          fontWeight: 600,
                          opacity: isDisabled ? 0.5 : 1,
                          fontSize: "13px",
                          lineHeight: 1.2,
                        }}
                      >
                        {tier.label}
                      </button>
                    );
                  })}
                </div>

                {(() => {
                  const activeEstimate = getTierEstimate(response, selectedTier);

                  if (!activeEstimate) {
                    return (
                      <p style={{ marginBottom: "20px" }}>
                        This estimate tier is not available.
                      </p>
                    );
                  }

                  return (
                    <>
                      <p>
                        <strong>Material: </strong>
                        {activeEstimate.material_cost}
                      </p>

                      <p>
                        <strong>Labor: </strong>
                        {activeEstimate.labor_cost}
                      </p>

                      <p style={{ marginBottom: "16px" }}>
                        <strong>Total: </strong>
                        {activeEstimate.total_cost}
                      </p>

                      <p style={{ marginBottom: "20px" }}>
                        {activeEstimate.description || response.explanation}
                      </p>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "10px",
                        }}
                      >
                        <button
                          onClick={() => setOpen(false)}
                          style={{
                            background: "#ccc",
                            border: "none",
                            padding: "10px 16px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            color: "#000",
                          }}
                        >
                          Close
                        </button>

                        <button
                          onClick={() => {
                            onApplyTotal?.(
                              parseCurrencyToNumber(activeEstimate.total_cost)
                            );
                            setOpen(false);
                          }}
                          style={{
                            background: "#27ae60",
                            color: "#fff",
                            border: "none",
                            padding: "10px 16px",
                            borderRadius: "6px",
                            cursor: "pointer",
                          }}
                        >
                          Apply To Line Total
                        </button>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {/* BYPASS WARNING MODAL */}
      {showBypassWarning && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "10px",
              maxWidth: "420px",
              width: "100%",
              padding: "26px",
              textAlign: "center",
              color: "#000",
              maxHeight: "80vh",
              overflowY: "auto"
            }}
          >
            <h3 style={{ marginBottom: "12px", fontWeight: "bold", color: "black" }}>
              Generate Estimate Without Required Info?
            </h3>

            <p style={{ marginBottom: "20px", lineHeight: 1.5 }}>
              Bypassing required project details may result in an estimate that
              is <strong>not 100% accurate.</strong>
              <br /><br />
              The AI will generate a rough estimate using industry averages and
              assumptions based on the information currently provided.
              <br /><br />
              This estimate should be used for <strong>ballpark pricing only.</strong>
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "10px",
                flexWrap: "wrap"
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowBypassWarning(false);
                }}
                style={{
                  background: "#1e73be",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                Cancel
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
                  background: loading ? "#efb27a" : "#e67e22",
                  color: "#fff",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: "6px",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                {loading && (
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      border: "2px solid rgba(255,255,255,0.45)",
                      borderTop: "2px solid #fff",
                      borderRadius: "50%",
                      animation: "spin 0.85s linear infinite",
                      flexShrink: 0,
                    }}
                  />
                )}
                <span>{loading ? "Generating..." : "Generate Estimate"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </>
  );
}
