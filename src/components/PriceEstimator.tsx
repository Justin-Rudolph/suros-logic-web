import { useState } from "react";

export default function PriceEstimator() {
    const [description, setDescription] = useState("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [response, setResponse] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const generateEstimate = async () => {
        try {
            setLoading(true);

            const res = await fetch(
                `${import.meta.env.VITE_API_URL}/api/generate-estimate`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ description }),
                }
            );

            const data = await res.json();
            setResponse(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 600, margin: "40px auto" }}>
            <h2>Generate Price Estimate</h2>

            <textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the project..."
                style={{
                    width: "100%", padding: 10, color: "#000", backgroundColor: "#fff"
                }}
            />

            <button
                onClick={generateEstimate}
                disabled={loading}
                style={{ marginTop: 10 }}
            >
                {loading ? "Generating..." : "Generate Price Estimate"}
            </button>

            {response && (
                <div style={{ marginTop: 20 }}>
                    {response.status === "incomplete" && (
                        <>
                            <h4>More Info Needed:</h4>
                            <ul>
                                {response.questions?.map((q: string, i: number) => (
                                    <li key={i}>{q}</li>
                                ))}
                            </ul>
                        </>
                    )}

                    {response.status === "complete" && (
                        <>
                            {typeof response.estimate === "object" ? (
                                <>
                                    <h3>Total: ${response.estimate.total_cost}</h3>
                                    <p>Material: ${response.estimate.material_cost}</p>
                                    <p>Labor: ${response.estimate.labor_cost}</p>
                                </>
                            ) : (
                                <h3>Estimated Price: {response.estimate}</h3>
                            )}

                            <p>{response.explanation}</p>
                        </>
                    )}

                </div>
            )}
        </div>
    );
}
