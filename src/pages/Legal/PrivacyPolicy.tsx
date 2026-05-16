import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "@/styles/gradients.css";

export default function PrivacyPolicy() {
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
          Privacy Policy - Suros Logic Systems, LLC
        </h1>
        <p className="text-sm text-gray-600 mb-8">Last updated: 05/16/2026</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">1. Who We Are</h2>
        <p className="mb-4">
          This Privacy Policy explains how Suros Logic Systems, LLC ("Suros Logic Systems," "we,"
          "us," or "our") collects, uses, discloses, retains, and protects information when you
          visit our website, create an account, start checkout, use our software and AI-assisted
          tools, upload project files, generate documents, communicate with us, or otherwise use our
          services (the "Service").
        </p>
        <p className="mb-4">
          The Service helps contractors and service businesses create, organize, analyze, and manage
          project materials such as bids, estimates, proposals, change orders, plan-analysis
          workspaces, summaries, scopes, safety reviews, conflict reports, RFIs, and related
          documents.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">2. Scope and Your Responsibilities</h2>
        <p className="mb-4">
          This Policy applies to information we collect through the Service and related business
          communications. It does not apply to third-party websites, services, or platforms that we
          do not control.
        </p>
        <p className="mb-4">
          You may submit information about your clients, homeowners, project owners, employees,
          subcontractors, vendors, or other individuals. You are responsible for providing any
          required notices and obtaining any required permissions, consents, or legal bases before
          submitting that information to the Service.
        </p>
        <p className="mb-4">
          Where applicable privacy law treats you as the business, controller, or owner of personal
          information you submit, you remain responsible for your own privacy obligations. We process
          Customer Data to provide the Service, support your account, secure the platform, comply
          with law, and improve the Service as described below.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">3. Information We Collect</h2>

        <h3 className="text-lg font-semibold mt-4 mb-2">3.1 Account and Contact Information</h3>
        <p className="mb-4">
          We may collect your name, company name, email address, phone number, business address,
          billing contact details, profile information, authentication information, communication
          preferences, and support messages.
        </p>

        <h3 className="text-lg font-semibold mt-4 mb-2">3.2 Customer Data and Project Content</h3>
        <p className="mb-4">
          When you use the Service, you may submit or generate project-related information, including
          client names, client contact information, property addresses, project locations, plan
          files, drawings, specifications, photos, notes, descriptions, scopes of work, pricing,
          line items, measurements, schedules, payment terms, proposal language, change-order
          details, RFIs, uploaded documents, PDF or HTML content, and other information you choose
          to include.
        </p>
        <p className="mb-4">
          This information may include personal information about individuals who are not direct
          users of the Service. Do not submit information unless you are authorized to do so.
        </p>

        <h3 className="text-lg font-semibold mt-4 mb-2">3.3 Payment and Subscription Information</h3>
        <p className="mb-4">
          We use Stripe to process checkout, subscriptions, payment methods, invoices, billing
          status, and billing portal access. Stripe may collect payment card information, billing
          address, tax information, fraud signals, device information, and transaction details. We do
          not intentionally store full payment card numbers on our own systems.
        </p>

        <h3 className="text-lg font-semibold mt-4 mb-2">3.4 Files, OCR, and Generated Output</h3>
        <p className="mb-4">
          If you upload files or generate documents, we may process file names, file types, file
          sizes, storage paths, download URLs, extracted text, OCR output, AI prompts, AI responses,
          generated proposal content, generated PDF requests, and related metadata needed to provide
          the requested feature.
        </p>

        <h3 className="text-lg font-semibold mt-4 mb-2">3.5 Automatic, Device, and Usage Information</h3>
        <p className="mb-4">
          We and our service providers may automatically collect IP address, browser type, device
          type, operating system, pages or features used, referring URLs, access times, error logs,
          authentication events, security logs, approximate location derived from IP address, and
          other technical information needed to operate, secure, debug, and improve the Service.
        </p>

        <h3 className="text-lg font-semibold mt-4 mb-2">3.6 Cookies and Similar Technologies</h3>
        <p className="mb-4">
          The Service may use cookies, local storage, session storage, pixels, or similar
          technologies to keep you signed in, remember preferences, support checkout, prevent fraud,
          measure performance, and improve the Service. You can adjust browser settings to block
          some cookies, but parts of the Service may not work correctly.
        </p>

        <h3 className="text-lg font-semibold mt-4 mb-2">3.7 Information from Third Parties</h3>
        <p className="mb-4">
          We may receive information from service providers and partners, including Firebase/Google
          authentication status, Stripe checkout and subscription events, Twilio SendGrid email
          delivery information, support communications, fraud-prevention signals, and information
          you authorize others to provide to us.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">4. How We Use Information</h2>
        <p className="mb-4">We use information for the following purposes:</p>
        <ul className="list-disc ml-8 mb-4">
          <li>Provide, operate, maintain, and personalize the Service;</li>
          <li>Create accounts, authenticate users, manage profiles, and protect access;</li>
          <li>Process checkout, subscriptions, invoices, billing status, cancellations, and payment-related support;</li>
          <li>Upload, store, parse, OCR, analyze, summarize, structure, format, and generate project content;</li>
          <li>Generate estimates, proposals, change orders, plan-analysis results, RFIs, safety reviews, conflict reports, and related outputs;</li>
          <li>Convert HTML or document content into downloadable PDF files when requested;</li>
          <li>Send password resets, transactional emails, account notices, product updates, and support messages;</li>
          <li>Respond to questions, troubleshoot issues, and provide customer support;</li>
          <li>Monitor, secure, debug, test, and improve the Service;</li>
          <li>Develop new features, templates, prompts, workflows, and quality controls;</li>
          <li>Detect, prevent, and respond to fraud, abuse, security incidents, and legal violations;</li>
          <li>Comply with legal obligations and enforce our Terms.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-2">5. AI Processing and Model Improvement</h2>
        <p className="mb-4">
          Some Service features use third-party AI infrastructure, including OpenAI API services, to
          process your inputs and generate or assist with outputs. Information sent for AI
          processing may include project notes, plan text, scopes, pricing context, uploaded-file
          text, client or project details, and other Customer Data needed to fulfill your request.
        </p>
        <p className="mb-4">
          We use AI outputs as drafting and workflow support. You are responsible for reviewing and
          validating all outputs before relying on them or sharing them externally.
        </p>
        <p className="mb-4">
          We may use Customer Data, generated outputs, usage information, errors, feedback, and
          support interactions to test, troubleshoot, secure, and improve our Service, including
          prompts, templates, formatting logic, product workflows, quality checks, and internal
          evaluation processes. Where practical, we use aggregated, de-identified, or minimized data
          for improvement work.
        </p>
        <p className="mb-4">
          We do not sell Customer Data as a data broker, and we do not use Customer Data to train
          third-party public AI models. Based on OpenAI's business/API data commitments, OpenAI does
          not train its models on API inputs or outputs by default unless the API customer opts in.
          If our provider settings or providers materially change, we may update this Policy.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">6. Third-Party Service Providers</h2>
        <p className="mb-4">
          We may disclose information to vendors, contractors, processors, and service providers
          that help us operate the Service. As of the last updated date, these may include:
        </p>
        <ul className="list-disc ml-8 mb-4">
          <li>Google Firebase and Google Cloud for hosting, authentication, Firestore database, Cloud Storage, Cloud Functions, Google Analytics, security, and operational logs;</li>
          <li>OpenAI API services for AI-assisted processing and generation;</li>
          <li>Stripe for payments, subscriptions, billing, taxes, fraud prevention, checkout, and billing portal services;</li>
          <li>Twilio SendGrid for transactional email, password reset, account, billing, and support communications;</li>
          <li>API2PDF for PDF generation from HTML or proposal content;</li>
          <li>Open-source and commercial software libraries used to provide OCR, document parsing, UI components, routing, validation, and application infrastructure.</li>
        </ul>
        <p className="mb-4">
          These providers may process information according to their own terms, privacy notices, data
          processing agreements, and security practices. We may change providers or add new
          providers as the Service evolves.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">7. How We Share Information</h2>
        <p className="mb-4">We may share information in the following circumstances:</p>
        <ul className="list-disc ml-8 mb-4">
          <li>With service providers that process information on our behalf;</li>
          <li>With payment processors and financial institutions to complete transactions and prevent fraud;</li>
          <li>With AI, cloud, email, PDF, storage, and infrastructure providers needed to provide requested features;</li>
          <li>With your organization, account administrators, or authorized users when applicable;</li>
          <li>With professional advisors, insurers, auditors, and legal representatives;</li>
          <li>With government authorities, regulators, courts, or third parties when required by law or needed to protect rights, safety, security, or property;</li>
          <li>In connection with a merger, acquisition, financing, restructuring, bankruptcy, sale of assets, or similar business transaction;</li>
          <li>With your consent or at your direction.</li>
        </ul>
        <p className="mb-4">
          We do not sell personal information for money. We do not knowingly sell or share personal
          information of children under 16. We do not currently share personal information for
          cross-context behavioral advertising as those terms are commonly used in U.S. state privacy
          laws.
        </p>
        <p className="mb-4">
          We use Google Analytics through Firebase to understand website and product usage,
          troubleshoot performance, and improve the Service. Our current implementation records
          route-level page views and page titles, and is configured to avoid sending URL query
          strings such as checkout session identifiers. Google Analytics may also provide us with
          approximate location information, such as country, region, or city, inferred from IP
          address or device/network information; we do not use Google Analytics to collect precise
          GPS location. We do not currently use advertising, retargeting, or similar advertising
          pixels. Users may also use browser controls or Google's available opt-out tools to limit
          Google Analytics measurement. If we add advertising or materially change our analytics
          practices, we will update this Policy and provide any notice, consent, or opt-out
          mechanism required by applicable law.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">8. Legal Bases for EEA, UK, and Similar Users</h2>
        <p className="mb-4">
          Where applicable law requires a legal basis, we process personal information based on one
          or more of the following: performance of a contract, legitimate interests, consent, legal
          obligations, and protection of rights, safety, and security.
        </p>
        <p className="mb-4">
          Our legitimate interests include operating and improving the Service, securing accounts,
          preventing abuse, communicating with users, supporting customers, and developing business
          features in a way that is proportionate to the privacy interests involved.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">9. U.S. State Privacy Notice</h2>
        <p className="mb-4">
          Depending on where you live and whether we meet applicable legal thresholds, state privacy
          laws may give you rights to know, access, correct, delete, obtain a portable copy of,
          restrict, or opt out of certain uses or disclosures of personal information. We will honor
          applicable rights requests as required by law.
        </p>
        <p className="mb-4">
          In the last 12 months, we may have collected the categories of personal information
          described in this Policy, including identifiers, commercial information, internet or
          network activity, geolocation approximated from IP address, professional or employment
          information you provide, audio/visual or document content you upload, inferences drawn from
          Service usage, and sensitive personal information only if you choose to submit it or if it
          is needed for security, account access, or payment processing.
        </p>
        <p className="mb-4">
          We collect this information from you, your authorized users, your devices, service
          providers, payment processors, authentication providers, and communications with us. We use
          and disclose it for the business and commercial purposes described in this Policy. We
          retain it as described in the "Data Retention" section below.
        </p>
        <p className="mb-4">
          If you use an opt-out preference signal such as Global Privacy Control, we will process it
          to the extent required by applicable law and technically feasible for the browser or device
          sending the signal.
        </p>
        <p className="mb-4">
          Florida law includes the Florida Digital Bill of Rights for certain large businesses and
          the Florida Information Protection Act for security and breach notice obligations. We will
          honor Florida privacy and security rights that apply to us. Based on the Service as
          currently operated, we do not believe we meet the large-business applicability thresholds
          for the Florida Digital Bill of Rights, but we will reassess if our business, revenue,
          data volume, advertising, or platform activities materially change.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">10. Data Retention</h2>
        <p className="mb-4">
          We retain information for as long as reasonably necessary to provide the Service, maintain
          your account, support billing and subscriptions, preserve business records, comply with
          law, resolve disputes, enforce agreements, prevent fraud, maintain backups, and improve
          the Service.
        </p>
        <ul className="list-disc ml-8 mb-4">
          <li>Account, profile, and billing records are generally retained while your account is active and for a reasonable period afterward for legal, tax, accounting, and dispute purposes.</li>
          <li>Customer Data and project files are generally retained while needed to provide the Service or until deleted by you or us, subject to backup, security, legal, and operational retention needs.</li>
          <li>Payment records may be retained by Stripe and by us as needed for invoices, taxes, chargebacks, fraud prevention, and compliance.</li>
          <li>Security, audit, and technical logs may be retained for troubleshooting, security, abuse prevention, and compliance.</li>
          <li>Aggregated or de-identified information may be retained longer where it cannot reasonably identify an individual.</li>
        </ul>
        <p className="mb-4">
          Deletion requests may not remove all copies immediately from backups, logs, provider
          systems, legal records, or materials we are required or permitted to retain.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">11. Data Security</h2>
        <p className="mb-4">
          We use reasonable administrative, technical, and organizational measures designed to
          protect information, including Firebase authentication, access controls, HTTPS/TLS
          connections, provider-managed cloud security, restricted administrative access, and
          monitoring for errors and misuse.
        </p>
        <p className="mb-4">
          No system is completely secure. We cannot guarantee that information will never be
          accessed, disclosed, altered, lost, or destroyed. You are responsible for using strong
          passwords, protecting your devices and email accounts, limiting access to your account, and
          promptly notifying us of suspected unauthorized access.
        </p>
        <p className="mb-4">
          If we determine that a security incident creates a legal duty to notify affected
          individuals, regulators, or other parties, including under Florida breach-notification law,
          we will provide notice as required by applicable law.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">12. International Transfers</h2>
        <p className="mb-4">
          We and our providers may process information in the United States and other countries
          where we or our providers operate. Those countries may have data protection laws that
          differ from the laws where you live. Where required, we rely on appropriate transfer
          mechanisms or provider commitments.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">13. Your Choices and Rights</h2>
        <p className="mb-4">
          Depending on your location and relationship with us, you may have rights to request access,
          correction, deletion, portability, restriction, objection, withdrawal of consent, or appeal
          of a privacy decision. You may also unsubscribe from marketing communications, although we
          may still send transactional or service-related messages.
        </p>
        <p className="mb-4">
          To make a privacy request, contact support@suroslogic.com. We may need to verify your
          identity and authority before fulfilling a request. If you submit a request on behalf of
          someone else, we may require proof that you are authorized to act for that person.
        </p>
        <p className="mb-4">
          If your personal information was submitted to the Service by one of our business
          customers, we may direct your request to that customer or require the customer to authorize
          the request before we act.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">14. Children's Privacy</h2>
        <p className="mb-4">
          The Service is intended for business users and is not directed to children under 13. We do
          not knowingly collect personal information from children under 13. If you believe a child
          has provided personal information to us, contact us so we can take appropriate steps.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">15. Third-Party Links and Services</h2>
        <p className="mb-4">
          The Service may link to third-party websites, portals, payment pages, or resources. We do
          not control those third parties and are not responsible for their privacy, security, or
          content practices. Review their policies before providing information to them.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">16. Changes to This Privacy Policy</h2>
        <p className="mb-4">
          We may update this Policy from time to time. The updated Policy will be posted on this page
          with a new "Last updated" date. If we make material changes, we will use reasonable efforts
          to provide notice appropriate to the nature of the change.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">17. Contact Us</h2>
        <p className="mb-4">
          Suros Logic Systems, LLC
          <br />
          Email: support@suroslogic.com
        </p>
      </div>
    </div>
  );
}
