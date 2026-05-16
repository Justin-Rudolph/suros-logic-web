import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "@/styles/gradients.css";

export default function TermsConditions() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, []);

  const handleBack = () => {
    if (location.state?.fromLanding === true) {
      navigate(-1);
      return;
    }

    navigate("/");
  };

  return (
    <div className="suros-gradient min-h-screen w-full">
      <div className="flex items-center mb-10 px-6 pt-10">
        <button
          onClick={handleBack}
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
          Back
        </button>
      </div>

      <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-md mb-20 text-gray-900">
        <h1 className="text-3xl font-bold mb-2">
          Terms & Conditions (Terms of Service) - Suros Logic Systems, LLC
        </h1>
        <p className="text-sm text-gray-600 mb-8">Last updated: 05/16/2026</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">1. Acceptance of Terms</h2>
        <p className="mb-4">
          These Terms & Conditions ("Terms") govern your access to and use of the website,
          applications, software, AI-assisted tools, document-generation workflows, support,
          and related services provided by Suros Logic Systems, LLC ("Suros Logic Systems,"
          "we," "us," or "our") (collectively, the "Service").
        </p>
        <p className="mb-4">
          By creating an account, starting a checkout, purchasing a subscription, uploading
          information, generating documents, or otherwise accessing or using the Service, you
          agree to these Terms and to our Privacy Policy. If you use the Service on behalf of a
          company or other legal entity, you represent that you have authority to bind that entity,
          and "you" means both you and that entity.
        </p>
        <p className="mb-4">
          If you do not agree to these Terms, do not access or use the Service.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">2. Business Use and Eligibility</h2>
        <p className="mb-4">
          The Service is intended for business and professional use by contractors, construction
          professionals, service businesses, and related commercial users. You may use the Service
          only if you are at least 18 years old, have legal capacity to enter into these Terms, and
          are not prohibited from using the Service under applicable law.
        </p>
        <p className="mb-4">
          The Service is not intended for personal, family, household, or consumer use. You are
          responsible for ensuring that your use of the Service complies with laws, licensing rules,
          contracts, bid requirements, safety requirements, permitting obligations, and professional
          standards that apply to your business.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">3. Description of the Service</h2>
        <p className="mb-4">
          Suros Logic Systems provides subscription-based tools that help users create, organize,
          analyze, and manage construction and service-business materials, including bid forms,
          estimates, proposals, change orders, plan-analysis workspaces, project summaries, scopes,
          verification items, safety reviews, conflict reports, RFIs, and related project content.
        </p>
        <p className="mb-4">
          The Service may process information you provide, including project notes, client
          information, plan files, uploaded documents, pricing context, trade information, scopes of
          work, and related materials. The Service may use proprietary prompts, templates, workflows,
          formatting logic, OCR or document parsing, and third-party infrastructure or AI services
          to generate, analyze, structure, or format content.
        </p>
        <p className="mb-4">
          We may add, change, suspend, limit, or discontinue features at any time. We do not
          guarantee that any particular feature, usage limit, model, provider, output format, or
          workflow will remain available.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">4. Accounts and Security</h2>
        <p className="mb-4">
          You must provide accurate, current, and complete account information and keep it updated.
          You are responsible for safeguarding your login credentials, devices, email account, and
          access to any billing or administrative portals.
        </p>
        <p className="mb-4">
          You are responsible for all activity under your account, whether or not authorized by you.
          You must promptly notify us at support@suroslogic.com if you believe your account has been
          compromised or used without authorization.
        </p>
        <p className="mb-4">
          We may suspend or terminate access if we believe your account is being misused, presents a
          security risk, violates these Terms, creates legal exposure, or threatens the integrity of
          the Service or another user.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">5. Subscriptions, Trials, Billing, and Taxes</h2>
        <p className="mb-4">
          Some features require a paid subscription, trial, or other paid plan. Plan descriptions,
          prices, usage limits, and included features may be shown on our website, in the checkout
          flow, in your billing portal, or in a separate order form.
        </p>
        <p className="mb-4">
          You authorize us and our payment processor, Stripe, to charge your payment method for
          subscription fees, recurring charges, applicable taxes, overages if offered, and other
          amounts associated with your plan. Unless stated otherwise, subscriptions renew
          automatically until canceled.
        </p>
        <p className="mb-4">
          We disclose automatic-renewal terms in the checkout or order flow. You can manage or
          cancel your subscription through the billing portal when available or by contacting us at
          support@suroslogic.com. If you accepted a subscription online, we will provide an online
          cancellation method. Cancellation stops future renewal charges but does not automatically
          refund prior charges. Unless required by law or expressly stated in writing, all fees are
          non-refundable.
        </p>
        <p className="mb-4">
          If applicable law requires advance renewal notices, reminder notices, or additional
          cancellation rights for a particular plan or user, we will provide them as required.
        </p>
        <p className="mb-4">
          We may change fees, features, limits, or plan structure. If a change materially affects a
          paid subscription, we will use reasonable efforts to provide notice before the change takes
          effect. You are responsible for taxes, duties, and similar governmental assessments other
          than taxes based on our net income.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">6. Customer Data and Permissions</h2>
        <p className="mb-4">
          "Customer Data" means data, files, text, images, documents, prompts, comments, pricing,
          project information, client information, contact details, property addresses, plans,
          drawings, specifications, bid materials, and other content that you or your authorized
          users submit to or generate through the Service.
        </p>
        <p className="mb-4">
          You retain ownership of Customer Data. You grant Suros Logic Systems a non-exclusive,
          worldwide, royalty-free license to host, store, reproduce, transmit, display, process,
          analyze, modify, format, create derivative technical artifacts from, and otherwise use
          Customer Data as necessary to provide, maintain, secure, troubleshoot, support, and improve
          the Service.
        </p>
        <p className="mb-4">
          You represent and warrant that you have all rights, consents, authorizations, notices, and
          legal bases necessary to provide Customer Data to us and our service providers, including
          data about your clients, homeowners, project owners, subcontractors, employees, vendors, or
          other third parties.
        </p>
        <p className="mb-4">
          Do not submit information that you are not authorized to disclose or that is subject to
          confidentiality, privacy, export-control, national-security, trade-secret, regulated-data,
          or contractual restrictions unless you have independently determined that submission is
          lawful and appropriate. The Service is not designed for protected health information,
          payment card numbers, government identifiers, classified information, or other highly
          sensitive regulated data.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">7. AI, OCR, Estimating, and Professional Review</h2>
        <p className="mb-4">
          The Service uses automation and AI-assisted processing. Outputs may include estimates,
          pricing suggestions, scope language, summaries, plan observations, safety items, conflict
          detection results, RFIs, proposal language, change-order language, verification lists, and
          other project or document content ("Output").
        </p>
        <p className="mb-4">
          Output is provided only as a drafting, analysis, formatting, and workflow-support tool.
          Output may be inaccurate, incomplete, outdated, duplicated, inconsistent, misleading,
          noncompliant with applicable codes, or unsuitable for your specific project, contract,
          jurisdiction, trade, schedule, pricing environment, insurance requirements, or permitting
          needs.
        </p>
        <p className="mb-4">
          Suros Logic Systems is not your contractor, estimator, engineer, architect, designer,
          safety professional, code consultant, attorney, accountant, insurance advisor, or other
          licensed professional. The Service does not provide legal, financial, engineering,
          architectural, safety, building-code, permitting, insurance, tax, or professional advice.
        </p>
        <p className="mb-4">
          You are solely responsible for independently reviewing, editing, validating, approving,
          and using all Output before relying on it, sending it to a client, including it in a bid,
          signing a contract, ordering materials, scheduling work, making safety decisions, or taking
          any other business action. You are responsible for field verification, plan review, code
          review, price verification, contract review, and professional judgment.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">8. Third-Party Services</h2>
        <p className="mb-4">
          The Service relies on third-party products and infrastructure. As of the last updated date,
          providers used by or integrated with the Service may include:
        </p>
        <ul className="list-disc ml-8 mb-4">
          <li>Google Firebase, Google Cloud, and Google Analytics for hosting, authentication, database, storage, cloud functions, usage measurement, and operational analytics;</li>
          <li>OpenAI API services for AI-assisted processing and generation;</li>
          <li>Stripe for checkout, subscription billing, payment processing, and billing portal tools;</li>
          <li>Twilio SendGrid for transactional email, account, support, and billing-related communications;</li>
          <li>API2PDF for converting HTML-based proposal content into downloadable PDF files;</li>
          <li>Open-source or commercial libraries, including OCR, document parsing, UI, and application dependencies.</li>
        </ul>
        <p className="mb-4">
          Third-party terms, privacy policies, service limits, security practices, outages, changes,
          and data-processing practices may apply to your use of the Service. We are not responsible
          for third-party services, networks, hosting providers, app stores, payment rails, email
          providers, AI providers, PDF providers, browsers, devices, or internet connectivity, and we
          are not liable for their acts, omissions, delays, downtime, data handling, pricing,
          suspension, or changes.
        </p>
        <p className="mb-4">
          We may change providers at any time. You authorize us to share Customer Data and account
          information with providers as reasonably necessary to provide, secure, bill for, support,
          and improve the Service.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">9. Acceptable Use</h2>
        <p className="mb-4">You agree that you will not, and will not allow anyone else to:</p>
        <ul className="list-disc ml-8 mb-4">
          <li>Use the Service for unlawful, fraudulent, deceptive, harmful, or abusive purposes;</li>
          <li>Submit data you do not have the right to submit or process;</li>
          <li>Generate or distribute false, misleading, infringing, defamatory, or illegal content;</li>
          <li>Use Output as a substitute for required professional review, safety analysis, or code compliance review;</li>
          <li>Upload malware or attempt to compromise, overload, scrape, reverse engineer, or bypass the Service;</li>
          <li>Access another user's account, files, data, or billing information without authorization;</li>
          <li>Use the Service to develop a competing product by copying our workflows, prompts, templates, or interface;</li>
          <li>Remove proprietary notices or misrepresent the source of Output.</li>
        </ul>
        <p className="mb-4">
          We may investigate suspected violations and may suspend or terminate access, remove
          content, preserve evidence, or cooperate with law enforcement, regulators, payment
          processors, or affected parties when we believe it is appropriate.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">10. Intellectual Property</h2>
        <p className="mb-4">
          Except for Customer Data, Suros Logic Systems and its licensors own all rights, title, and
          interest in and to the Service, including software, code, design, user interfaces, prompts,
          templates, workflows, models, documentation, branding, logos, trade names, and proprietary
          methods.
        </p>
        <p className="mb-4">
          Subject to your compliance with these Terms, we grant you a limited, revocable,
          non-exclusive, non-transferable, non-sublicensable license to access and use the Service
          for your internal business purposes during your active subscription or permitted access
          period.
        </p>
        <p className="mb-4">
          You may use Output for your internal business purposes and client-facing project documents,
          subject to your responsibility to review and validate it. You may not claim ownership of
          the Service itself or our underlying prompts, templates, workflows, or proprietary logic.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">11. Confidentiality</h2>
        <p className="mb-4">
          Each party may receive confidential or proprietary information from the other. The
          receiving party will use reasonable care to protect confidential information and use it
          only for purposes permitted by these Terms. This obligation does not apply to information
          that is public, independently developed, lawfully received from another source, or required
          to be disclosed by law.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">12. Privacy and Data Protection</h2>
        <p className="mb-4">
          Our Privacy Policy explains how we collect, use, disclose, retain, and protect personal
          information. You are responsible for providing any notices and obtaining any consents
          required for personal information you submit about your clients, employees, subcontractors,
          vendors, or other individuals.
        </p>
        <p className="mb-4">
          If you need a data processing addendum, special confidentiality terms, data deletion
          support, or restrictions on data use beyond those described in these Terms and the Privacy
          Policy, contact us before submitting restricted information.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">13. Beta Features and Availability</h2>
        <p className="mb-4">
          Some features may be experimental, in beta, limited release, or subject to usage caps.
          Beta and preview features are provided for evaluation and may be changed, suspended, or
          discontinued without notice.
        </p>
        <p className="mb-4">
          We aim to provide a reliable Service, but we do not guarantee uninterrupted availability,
          preservation of any particular data, compatibility with every file, successful upload,
          successful OCR, successful PDF conversion, email deliverability, or completion of any AI
          analysis.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">14. Disclaimers</h2>
        <p className="mb-4">
          To the fullest extent permitted by law, the Service and all Output are provided "AS IS" and
          "AS AVAILABLE," without warranties of any kind, whether express, implied, statutory, or
          otherwise. We disclaim all warranties of merchantability, fitness for a particular purpose,
          title, non-infringement, accuracy, availability, security, and course of dealing.
        </p>
        <p className="mb-4">
          We do not warrant that the Service or Output will be uninterrupted, error-free, secure,
          accurate, complete, current, code-compliant, contract-compliant, profitable, accepted by a
          client, suitable for a particular trade or project, or free from harmful components.
        </p>
        <p className="mb-4">
          You use the Service and Output at your own risk and remain solely responsible for all bids,
          proposals, estimates, change orders, scopes, RFIs, contracts, safety decisions, pricing,
          schedules, communications, submissions, and business outcomes.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">15. Limitation of Liability</h2>
        <p className="mb-4">
          To the fullest extent permitted by law, Suros Logic Systems, its owners, officers,
          employees, contractors, affiliates, licensors, and service providers will not be liable for
          indirect, incidental, special, consequential, exemplary, punitive, or enhanced damages, or
          for lost profits, lost revenue, lost savings, lost business opportunity, loss of goodwill,
          loss of data, business interruption, project delay, bid loss, pricing error, scope gap,
          rework, safety issue, code issue, contract dispute, or third-party claim, even if advised
          of the possibility of such damages.
        </p>
        <p className="mb-4">
          To the fullest extent permitted by law, our total liability for all claims arising out of
          or relating to the Service, Output, these Terms, or your account will not exceed the
          greater of (a) the amounts you paid to Suros Logic Systems for the Service during the 12
          months before the event giving rise to the claim, or (b) $100.
        </p>
        <p className="mb-4">
          Some jurisdictions do not allow certain limitations, so some limitations may not apply to
          you. In those jurisdictions, liability is limited to the maximum extent permitted by law.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">16. Indemnification</h2>
        <p className="mb-4">
          You will defend, indemnify, and hold harmless Suros Logic Systems, its owners, officers,
          employees, contractors, affiliates, licensors, and service providers from and against any
          claims, damages, losses, liabilities, costs, and expenses, including reasonable attorneys'
          fees, arising out of or related to:
        </p>
        <ul className="list-disc ml-8 mb-4">
          <li>Your use of the Service or Output;</li>
          <li>Your bids, estimates, proposals, change orders, scopes, contracts, project decisions, or client communications;</li>
          <li>Your Customer Data or your lack of rights, notices, permissions, or consents for Customer Data;</li>
          <li>Your violation of these Terms, applicable law, professional obligations, or third-party rights;</li>
          <li>Your relationship or dispute with any client, property owner, subcontractor, vendor, employee, regulator, or other third party.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-2">17. Suspension and Termination</h2>
        <p className="mb-4">
          These Terms remain in effect while you use the Service. We may suspend or terminate your
          access, with or without notice, if you fail to pay fees, violate these Terms, create legal
          or security risk, misuse the Service, or if we discontinue the Service.
        </p>
        <p className="mb-4">
          You may stop using the Service at any time. Termination does not relieve you of payment
          obligations incurred before termination. Provisions that by their nature should survive
          termination will survive, including intellectual property, confidentiality, disclaimers,
          limitation of liability, indemnification, dispute resolution, and payment obligations.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">18. Governing Law and Disputes</h2>
        <p className="mb-4">
          These Terms are governed by the laws of the State of Florida, without regard to
          conflict-of-law rules. Any dispute that is not resolved informally will be brought
          exclusively in the state or federal courts located in Florida, unless applicable law
          requires a different forum.
        </p>
        <p className="mb-4">
          Before filing a claim, each party agrees to first contact the other party and attempt in
          good faith to resolve the dispute informally. To the fullest extent permitted by law, you
          and Suros Logic Systems agree to bring claims only in an individual capacity and not as a
          plaintiff or class member in any class, collective, consolidated, or representative action.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">19. Changes to These Terms</h2>
        <p className="mb-4">
          We may update these Terms from time to time. The updated Terms will be posted on this page
          with a new "Last updated" date. Continued use of the Service after updated Terms become
          effective means you accept the updated Terms.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">20. Miscellaneous</h2>
        <ul className="list-disc ml-8 mb-4">
          <li>These Terms and the Privacy Policy are the entire agreement between you and us regarding the Service.</li>
          <li>If any provision is unenforceable, the remaining provisions remain in effect.</li>
          <li>Our failure to enforce a provision is not a waiver.</li>
          <li>You may not assign these Terms without our prior written consent. We may assign these Terms as part of a merger, acquisition, restructuring, financing, sale of assets, or by operation of law.</li>
          <li>We are not liable for delay or failure caused by events beyond our reasonable control.</li>
          <li>There are no third-party beneficiaries to these Terms except where expressly stated.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-2">21. Contact Information</h2>
        <p className="mb-4">
          Suros Logic Systems, LLC
          <br />
          Email: support@suroslogic.com
        </p>
      </div>
    </div>
  );
}
