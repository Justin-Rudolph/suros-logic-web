import { useNavigate } from "react-router-dom";
import "@/styles/gradients.css";

export default function TermsConditions() {
    const navigate = useNavigate();

    return (
        <div className="suros-gradient min-h-screen w-full">

            {/* Logo */}
            <div className="flex items-center mb-10 px-6 pt-10">
                <button
                    onClick={() => navigate("/")}
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
            </div>

            {/* Content Container */}
            <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-md mb-20 text-gray-900">

                <h1 className="text-3xl font-bold mb-2">
                    Terms & Conditions (Terms of Service) – Suros Logic Systems, LLC
                </h1>
                <p className="text-sm text-gray-600 mb-8">Last updated: 12/12/2025</p>

                {/* ---------------- SECTION 1 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">1. Acceptance of Terms</h2>
                <p className="mb-4">
                    These Terms & Conditions (“Terms”) govern your access to and use of the services provided by Suros Logic Systems (“Suros Logic Systems,” “we,” “us,” or “our”), including our website, web applications, and related tools (collectively, the “Service”).
                </p>

                <p className="mb-4">
                    By creating an account, using, or accessing the Service, you agree to be bound by these Terms. If you are using the Service on behalf of a company or other legal entity, you represent that you are authorized to bind that entity, and “you” refers to that entity.
                </p>

                <p className="mb-4">
                    If you do not agree to these Terms, do not use the Service.
                </p>

                {/* ---------------- SECTION 2 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">2. Eligibility</h2>

                <p className="mb-4">You may use the Service only if:</p>

                <ul className="list-disc ml-8 mb-4">
                    <li>You are at least 18 years old (or of legal age in your jurisdiction), and</li>
                    <li>You have the authority to enter into these Terms.</li>
                </ul>

                <p className="mb-4">
                    You agree that you are using the Service for business or professional purposes, not as a consumer.
                </p>

                {/* ---------------- SECTION 3 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">3. Description of the Service</h2>

                <p className="mb-4">
                    Suros Logic Systems provides subscription-based tools that allow contractors and similar professionals to:
                </p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Enter basic bid data and project details (including client information and pricing),</li>
                    <li>Use AI-powered processing to expand and format that information into professional, structured bid documents,</li>
                    <li>Receive those bid documents via email or other delivery methods.</li>
                </ul>

                <p className="mb-4">
                    We may update, modify, or discontinue features from time to time as part of ongoing improvements and “rollout patches.”
                </p>

                {/* ---------------- SECTION 4 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">4. Account Registration</h2>

                <p className="mb-4">
                    To use certain features, you must create an account and provide accurate, current, and complete information.
                </p>

                <p className="mb-4">You are responsible for:</p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Maintaining the confidentiality of your login credentials,</li>
                    <li>All activities that occur under your account,</li>
                    <li>Promptly notifying us of any unauthorized access or security breach.</li>
                </ul>

                <p className="mb-4">
                    We reserve the right to suspend or terminate accounts that violate these Terms.
                </p>

                {/* ---------------- SECTION 5 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">5. Subscription Plans, Fees & Payment</h2>

                <p className="font-semibold">Subscription Plans</p>
                <p className="mb-4">
                    Access to the Service may require purchasing one of our monthly (or other periodic) subscription plans (“Plan”). Details (features, limits, pricing) will be provided on our website or in a separate order form.
                </p>

                <p className="font-semibold">Billing</p>
                <p className="mb-4">
                    You authorize us and/or our payment processor to charge your payment method on a recurring basis for the applicable Plan.
                    <br />
                    Plans will automatically renew at the end of each billing period unless you cancel in accordance with our cancellation policy.
                </p>

                <p className="font-semibold">Changes to Fees</p>
                <p className="mb-4">
                    We may change the fees for Plans from time to time. If we do, we will provide notice before changes take effect.
                </p>

                <p className="font-semibold">Refunds</p>
                <p className="mb-4">
                    Unless expressly stated otherwise, all fees are non-refundable to the fullest extent permitted by law.
                </p>

                {/* ---------------- SECTION 6 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">6. Your Responsibilities and Acceptable Use</h2>

                <p className="mb-4">You agree that you will:</p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Provide only accurate and lawful information in the Service.</li>
                    <li>Ensure that you have all necessary permissions to submit any personal or project data (including your clients’ data).</li>
                    <li>Use the Service in compliance with applicable laws and regulations.</li>
                </ul>

                <p className="mb-4">You agree that you will not:</p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Use the Service for illegal or fraudulent activities.</li>
                    <li>Upload malicious code, viruses, or perform actions that could damage or disrupt the Service.</li>
                    <li>Attempt to access or scrape other users’ data.</li>
                    <li>Reverse-engineer, decompile, or attempt to derive source code from the Service.</li>
                    <li>Use the Service to generate misleading, fraudulent, or deceptive documents.</li>
                </ul>

                <p className="mb-4">
                    We may suspend or terminate your access if you violate these obligations.
                </p>

                {/* ---------------- SECTION 7 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">7. Customer Data and License to Use</h2>

                <h3 className="text-lg font-semibold mt-4">7.1 “Customer Data”</h3>
                <p className="mb-4">
                    “Customer Data” means any data, content, or information you submit to the Service, including but not limited to:
                </p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Client names and contact details</li>
                    <li>Project addresses and property information</li>
                    <li>Scopes of work, pricing, and line items</li>
                    <li>Notes and instructions for bids</li>
                    <li>Any other information you input into the system</li>
                </ul>

                <p className="mb-4">You retain ownership of your Customer Data.</p>

                <h3 className="text-lg font-semibold mt-4">7.2 License Granted to Suros Logic Systems</h3>
                <p className="mb-4">
                    To operate and improve the Service, you grant Suros Logic Systems a non-exclusive, worldwide, royalty-free license to:
                </p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Use, host, store, reproduce, modify, adapt, and process Customer Data as necessary to provide the Service.</li>
                    <li>Develop, test, and improve internal AI models, templates, and features.</li>
                    <li>Create aggregated and/or de-identified datasets.</li>
                </ul>

                <p className="mb-4">
                    You represent and warrant that you have all necessary rights to provide Customer Data and that our use will not violate any third-party rights or laws.
                </p>

                {/* ---------------- SECTION 8 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">8. Output and Use of AI-Generated Bids</h2>

                <p className="mb-4">
                    The Service generates bid documents and related outputs (“Output”) based on your inputs and our AI systems.
                </p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Output may contain errors or omissions.</li>
                    <li>You remain solely responsible for reviewing all Output.</li>
                    <li>Suros Logic Systems is not a contractor, engineer, or legal advisor.</li>
                </ul>

                <p className="mb-4">
                    You are responsible for how you use Output in your business.
                </p>

                {/* ---------------- SECTION 9 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">9. Intellectual Property</h2>

                <p className="mb-4">
                    Except for Customer Data, all rights in the Service—including software, AI models, algorithms, templates, branding, and documentation—are owned by Suros Logic Systems or its licensors.
                </p>

                <p className="mb-4">
                    You are granted a limited, non-exclusive, non-transferable, revocable license to use the Service for your internal business purposes.
                </p>

                {/* ---------------- SECTION 10 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">10. Third-Party Services and Integrations</h2>

                <p className="mb-4">
                    The Service may integrate with or rely on third-party services. Their terms may apply. We aim to use reputable providers but are not responsible for their actions.
                </p>

                {/* ---------------- SECTION 11 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">11. Confidentiality</h2>

                <p className="mb-4">
                    Each party may receive confidential information from the other. Both parties agree to keep such information confidential and use it only as necessary for the Service.
                </p>

                {/* ---------------- SECTION 12 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">12. Disclaimers</h2>

                <p className="mb-4">
                    The Service is provided “AS IS” and “AS AVAILABLE.” We do not warrant:
                </p>

                <ul className="list-disc ml-8 mb-4">
                    <li>That the Service will be uninterrupted, timely, secure, or error-free;</li>
                    <li>That Output will be accurate or suitable for your purposes;</li>
                    <li>That the Service will meet your requirements or regulatory obligations.</li>
                </ul>

                <p className="mb-4">
                    You are responsible for verifying all bid documents before using them professionally.
                </p>

                {/* ---------------- SECTION 13 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">13. Limitation of Liability</h2>

                <p className="mb-4">
                    To the fullest extent permitted by law:
                </p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Suros Logic Systems is not liable for indirect, incidental, special, consequential, or punitive damages.</li>
                    <li>Our total liability will not exceed the amounts paid in the previous 12 months.</li>
                </ul>

                {/* ---------------- SECTION 14 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">14. Indemnification</h2>

                <p className="mb-4">You agree to indemnify Suros Logic Systems, LLC against claims arising from:</p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Your use of the Service or Output,</li>
                    <li>Your violation of these Terms,</li>
                    <li>Your infringement of third-party rights,</li>
                    <li>Your provision of Customer Data without proper rights.</li>
                </ul>

                {/* ---------------- SECTION 15 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">15. Term and Termination</h2>

                <p className="mb-4">
                    These Terms remain in effect while you use the Service. We may suspend or terminate your access at any time for violations or non-payment.
                </p>

                <p className="mb-4">
                    Upon termination, your right to use the Service ends. Certain provisions survive termination.
                </p>

                {/* ---------------- SECTION 16 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">16. Governing Law and Dispute Resolution</h2>

                <p className="mb-4">
                    These Terms are governed by the laws of the State of [State]. You agree that any disputes will be brought exclusively in the courts located in [County, State].
                </p>

                {/* ---------------- SECTION 17 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">17. Changes to the Service and These Terms</h2>

                <p className="mb-4">
                    We may modify or discontinue parts of the Service or update these Terms. Continued use signifies acceptance.
                </p>

                {/* ---------------- SECTION 18 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">18. Miscellaneous</h2>

                <p className="mb-4">
                    These Terms, along with the Privacy Policy, constitute the entire agreement between you and us.
                </p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Severability: Invalid provisions do not affect the remainder.</li>
                    <li>No Waiver: Failure to enforce rights is not a waiver.</li>
                    <li>Assignment: You may not transfer these Terms without consent.</li>
                    <li>Force Majeure: We are not liable for delays outside our control.</li>
                </ul>

                {/* ---------------- SECTION 19 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">19. Contact Information</h2>

                <p className="mb-4">
                    Suros Logic Systems, LLC
                    <br />
                    Email: support@suroslogic.com
                </p>

            </div>
        </div>
    );
}
