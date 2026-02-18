/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";

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
  const [response, setResponse] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const generateEstimate = async () => {
    if (!scope.trim()) return;

    try {
      setLoading(true);

      const API_BASE = import.meta.env.DEV
        ? "http://127.0.0.1:5001/suros-logic/us-central1"
        : "";

      const res = await fetch(`${API_BASE}/generateEstimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: scope,
          zipCode: zipCode,
        }),
      }
      );

      const data = await res.json();
      setResponse(data);
      setOpen(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* BUTTON ROW — FORCED HORIZONTAL */}
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
            height: "36px", // match input height
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

      {/* MODAL */}
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

            {response.status === "incomplete" && (
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
              </>
            )}


            {response.status === "complete" && (
              <>
                <h3 style={{ marginBottom: "16px", fontWeight: "bold" }}>
                  AI Estimate
                </h3>

                <p>
                  <strong>Material: </strong>
                  {response.estimate.material_cost?.toLocaleString()}
                </p>

                <p>
                  <strong>Labor: </strong>
                  {response.estimate.labor_cost?.toLocaleString()}
                </p>

                <p style={{ marginBottom: "16px" }}>
                  <strong>Total: </strong>
                  {response.estimate.total_cost?.toLocaleString()}
                </p>

                <p style={{ marginBottom: "20px" }}>
                  {response.explanation}
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
                      onApplyTotal?.(response.estimate.total_cost);
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
            )}
          </div>
        </div>
      )}
    </>
  );
}
