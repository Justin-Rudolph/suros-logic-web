import { useNavigate } from "react-router-dom";
import "@/styles/gradients.css";

export default function PrivacyPolicy() {
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
                    Privacy Policy – Suros Logic Systems, LLC
                </h1>
                <p className="text-sm text-gray-600 mb-8">Last updated: 12/12/2025</p>

                {/* ---------------- SECTION 1 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">1. Who We Are</h2>
                <p className="mb-4">
                    This Privacy Policy describes how Suros Logic Systems (“Suros Logic Systems,” “we,” “us,” or “our”) collects, uses, and shares information when you:
                </p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Visit our website,</li>
                    <li>Create an account and use our software and related services (the “Service”),</li>
                    <li>Communicate with us in any way.</li>
                </ul>

                <p className="mb-4">
                    Suros Logic Systems provides tools that allow contractors to input basic bid details and client information, which we then process using artificial intelligence (“AI”) to generate formatted, professional bids that are sent back to the contractor.
                </p>

                {/* ---------------- SECTION 2 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">2. Scope</h2>
                <p className="mb-4">
                    This Privacy Policy applies to information we collect:
                </p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Through our website and web applications;</li>
                    <li>Through forms, portals, and interfaces where contractors submit bid details and client information;</li>
                    <li>Through email or other communications with us.</li>
                </ul>

                <p className="mb-4">
                    It does not apply to third-party websites or services linked from our Service.
                </p>

                <p className="mb-4">
                    By using the Service, you agree to the collection and use of information in accordance with this Policy.
                </p>

                {/* ---------------- SECTION 3 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">3. Information We Collect</h2>
                <p className="mb-4">
                    We may collect the following categories of information:
                </p>

                {/* 3.1 */}
                <h3 className="text-lg font-semibold mt-4 mb-2">3.1 Information You Provide to Us</h3>

                <p className="font-semibold">Account and Contact Information</p>
                <ul className="list-disc ml-8 mb-4">
                    <li>Name</li>
                    <li>Company name</li>
                    <li>Email address</li>
                    <li>Phone number</li>
                    <li>Billing address</li>
                    <li>Login/credential information (e.g., username, hashed password)</li>
                </ul>

                <p className="font-semibold">Contractor & Bid Data (“Customer Data”)</p>
                <p className="mb-2">When you use the Service to generate bids, you may submit:</p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Client names and contact information (e.g., homeowner or property owner)</li>
                    <li>Property addresses and project locations</li>
                    <li>Project descriptions, scopes of work, line items, and pricing</li>
                    <li>Notes, comments, or instructions entered into the system</li>
                    <li>Any other information you choose to include in bids or related documents</li>
                </ul>

                <p className="mb-4">
                    This may include personal information about your clients, subcontractors, or other individuals. You are responsible for ensuring you have the right to share this information with us.
                </p>

                <p className="font-semibold">Payment Information</p>
                <p className="mb-2">
                    We may use third-party payment processors to handle billing and payments. These processors may collect:
                </p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Payment card details</li>
                    <li>Billing address</li>
                    <li>Other payment-related details</li>
                </ul>

                <p className="mb-4">
                    We typically do not store full payment card numbers on our own systems.
                </p>

                <p className="font-semibold">Support and Communication</p>
                <ul className="list-disc ml-8 mb-4">
                    <li>Messages you send us (email, in-app chat, support tickets)</li>
                    <li>Feedback, bug reports, or feature requests</li>
                </ul>

                {/* 3.2 */}
                <h3 className="text-lg font-semibold mt-6 mb-2">3.2 Information We Collect Automatically</h3>

                <ul className="list-disc ml-8 mb-4">
                    <li>Usage data – pages visited, features used, clicks, time on page, referring URLs.</li>
                    <li>Log data – IP address, browser type, operating system, access times, and device identifiers.</li>
                    <li>Cookies and similar technologies – to remember your preferences and help us improve the Service.</li>
                </ul>

                {/* 3.3 */}
                <h3 className="text-lg font-semibold mt-6 mb-2">3.3 Information from Third Parties</h3>

                <ul className="list-disc ml-8 mb-4">
                    <li>Payment processors (billing status and confirmations)</li>
                    <li>Integration partners</li>
                    <li>Analytics services</li>
                </ul>

                {/* ---------------- SECTION 4 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">4. How We Use Your Information</h2>

                <p className="mb-4">We use the information we collect for purposes including:</p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Providing and operating the Service</li>
                    <li>Generating automated, formatted bids based on your inputs</li>
                    <li>Sending you bid documents via email or through our platform</li>
                    <li>Managing your account and authentication</li>
                    <li>Improving and developing our Service</li>
                    <li>Analyzing feature usage</li>
                    <li>Debugging, testing, and optimizing performance</li>
                    <li>Creating new features and workflows</li>
                </ul>

                <p className="font-semibold mb-1">Using Customer Data to optimize our systems and AI models:</p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Improve the quality of AI-generated bids</li>
                    <li>Enhance templates and automation logic</li>
                    <li>Develop better formatting, language, and structure for output</li>
                </ul>

                <p className="mb-4">Where reasonable, we aim to use aggregated or de-identified data for these improvements.</p>

                <p className="font-semibold mb-1">Communications</p>
                <ul className="list-disc ml-8 mb-4">
                    <li>Responding to support inquiries</li>
                    <li>Sending service-related notifications</li>
                    <li>Sending optional marketing or educational emails (you may opt out)</li>
                </ul>

                <p className="font-semibold mb-1">Security and compliance</p>
                <ul className="list-disc ml-8 mb-4">
                    <li>Monitoring for fraud, abuse, or unauthorized use</li>
                    <li>Complying with legal obligations and enforcing our Terms & Conditions</li>
                </ul>

                {/* ---------------- SECTION 5 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">5. AI Processing and Model Improvement</h2>

                <p className="mb-4">
                    Our Service uses AI to transform your input (bid notes, client details, project descriptions, etc.) into structured, formatted bid documents.
                </p>

                <p className="font-semibold mb-1">We may use your Customer Data to:</p>
                <ul className="list-disc ml-8 mb-4">
                    <li>Train, fine-tune, or configure internal models and templates</li>
                    <li>Test new features, patches, and updates</li>
                    <li>Use aggregated or de-identified data for model improvement where practical</li>
                </ul>

                <p className="mb-4">
                    We do not sell your Customer Data as a data broker. We also do not use your data to train public/open models.
                </p>

                <p className="mb-4">
                    If you require limitations on data use (e.g., exclusion from model improvement), contact us to discuss options.
                </p>

                {/* ---------------- SECTION 6 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">6. Legal Bases (for EEA/UK Users)</h2>

                <ul className="list-disc ml-8 mb-4">
                    <li>Contract performance</li>
                    <li>Legitimate interests</li>
                    <li>Consent (e.g., marketing communications)</li>
                </ul>

                {/* ---------------- SECTION 7 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">7. How We Share Information</h2>

                <p className="mb-4">We may share information as follows:</p>

                <ul className="list-disc ml-8 mb-4">
                    <li>Service providers (hosting, email, payments, analytics, AI infra)</li>
                    <li>Business transfers (mergers, acquisitions, financing)</li>
                    <li>Legal obligations</li>
                    <li>With your consent</li>
                </ul>

                <p className="mb-4">
                    We do not sell personal information to third parties.
                </p>

                {/* ---------------- SECTION 8 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">8. Data Retention</h2>

                <p className="mb-4">
                    We retain information as long as necessary to provide the Service, comply with laws, and resolve disputes. Aggregated or de-identified data may be retained longer.
                </p>

                <p className="mb-4">
                    To request deletion, contact us. Some data may be retained as required by law.
                </p>

                {/* ---------------- SECTION 9 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">9. Data Security</h2>

                <ul className="list-disc ml-8 mb-4">
                    <li>Encrypted connections (HTTPS)</li>
                    <li>Access controls and authentication</li>
                    <li>Limiting access to personnel who require it</li>
                </ul>

                <p className="mb-4">No method is 100% secure, and we cannot guarantee absolute protection.</p>

                {/* ---------------- SECTION 10 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">10. Your Rights and Choices</h2>

                <ul className="list-disc ml-8 mb-4">
                    <li>Accessing your personal information</li>
                    <li>Correcting inaccurate data</li>
                    <li>Requesting deletion (where legally permitted)</li>
                    <li>Restricting or objecting to certain processing</li>
                    <li>Requesting a portable copy of your data</li>
                </ul>

                <p className="mb-4">
                    You may also unsubscribe from marketing emails or adjust cookie settings.
                </p>

                {/* ---------------- SECTION 11 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">11. Children’s Privacy</h2>

                <p className="mb-4">
                    Our Service is intended for business use and not for children. We do not knowingly collect data from children under 13.
                </p>

                {/* ---------------- SECTION 12 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">12. International Data Transfers</h2>

                <p className="mb-4">
                    Your data may be transferred to, stored in, or processed in countries with different laws. Where required, we apply appropriate safeguards.
                </p>

                {/* ---------------- SECTION 13 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">13. Changes to This Privacy Policy</h2>

                <p className="mb-4">
                    We may update this Policy periodically. Continued use of the Service indicates acceptance of the updated Policy.
                </p>

                {/* ---------------- SECTION 14 ---------------- */}
                <h2 className="text-xl font-semibold mt-6 mb-2">14. Contact Us</h2>

                <p className="mb-4">
                    Suros Logic Systems, LLC
                    <br />
                    Email: support@suroslogic.com
                </p>

            </div>
        </div>
    );
}
