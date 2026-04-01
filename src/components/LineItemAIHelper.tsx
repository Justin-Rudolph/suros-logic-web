import { useState } from "react";

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
  estimates?: {
    average_price?: EstimateTier;
    high_tier_price?: EstimateTier;
  };
};

interface Props {
  scope: string;
  zipCode: string | null;
  onApplyTotal?: (amount: number) => void;
}

export default function LineItemAIHelper({
  scope,
  zipCode,
  onApplyTotal,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<EstimateResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<"average_price" | "high_tier_price">("average_price");

  const [showBypassWarning, setShowBypassWarning] = useState(false);

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

  const generateEstimate = async () => {
    if (!scope.trim()) return;

    try {
      setResponse(null); // clears previous estimate/questions
      setSelectedTier("average_price");
      setLoading(true);

      const API_BASE = import.meta.env.DEV
        ? "http://127.0.0.1:5001/suros-logic/us-central1"
        : "https://us-central1-suros-logic.cloudfunctions.net";

      const res = await fetch(`${API_BASE}/generateEstimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: scope,
          zipCode: zipCode,
        }),
      });

      const data = await res.json();
      setResponse(data);
      setOpen(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const bypassGenerate = async () => {
    try {
      setSelectedTier("average_price");
      setLoading(true);

      const API_BASE = import.meta.env.DEV
        ? "http://127.0.0.1:5001/suros-logic/us-central1"
        : "https://us-central1-suros-logic.cloudfunctions.net";

      const res = await fetch(`${API_BASE}/generateEstimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: scope,
          zipCode: zipCode,
          bypass: true,
        }),
      });

      const data = await res.json();

      // Only update response
      setResponse(data);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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
          marginTop: "6px",
          marginBottom: "14px",
        }}
      >
        <button
          type="button"
          onClick={generateEstimate}
          style={{
            flexShrink: 0,
            height: "36px",
            padding: "0 12px",
            background: "#1e73be",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "Generating..." : "Generate Estimate"}
        </button>

        {response && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              height: "36px",
              padding: "0 12px",
              background: "#444",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px",
              whiteSpace: "nowrap",
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
                        display: "flex",
                        alignItems: "flex-start",
                        marginBottom: "8px",
                        lineHeight: 1.5,
                      }}
                    >
                      <span style={{ marginRight: "8px" }}>-</span>
                      <span>{q}</span>
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
                    onClick={() => setShowBypassWarning(true)}
                    style={{
                      background: "#e67e22",
                      color: "#fff",
                      border: "none",
                      padding: "10px 16px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: 600,
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
                  Generating Estimate...
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
                  e.preventDefault();
                  e.stopPropagation();

                  setShowBypassWarning(false);
                  bypassGenerate();
                }}

                style={{
                  background: "#e67e22",
                  color: "#fff",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Generate Estimate
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
