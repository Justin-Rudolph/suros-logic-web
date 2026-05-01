export const RELEASE_NOTES_STORAGE_KEY = "suros-logic-last-seen-release";

export const releases = [
  {
    version: "v3.0.0",
    date: "April 30, 2026",
    highlights: [
      "Launched Plan Analyzer so teams can upload a plan PDF or image, process it as a saved project, and reopen results later from the dashboard.",
      "Added AI-generated project overview, trade scopes, verification checklist, safety review, conflict detection, and RFI package outputs within the new Plan Analyzer workflow.",
      "Introduced saved favorites across scopes, verification items, safety issues, conflicts, and RFIs, plus a faster path to send selected scope items into a new bid.",
      "Improved upload and processing behavior with clearer single-file messaging, progress feedback, and smarter failure handling when readable text cannot be extracted from a file.",
    ],
  },
  {
    version: "v2.0.0",
    date: "April 13, 2026",
    highlights: [
      "Introduced bid workspaces so each bid now opens into a dedicated hub with Overview, Bid Form, Bid Proposal, Change Orders, Change Order Proposal, and Project Files tabs.",
      "Added AI-generated project summaries and a project timeline in the workspace Overview so teams can quickly understand each bid and track it from created to approved, starting, midway, and completed.",
      "Updated submitted bids to move directly into a generated proposal experience, with editable proposal fields, PDF downloads, and clear save states.",
      "Expanded change orders into the workspace flow so users can create a change order, generate its proposal, review it, edit it, and download the PDF from the same bid workspace.",
      "Added project file management inside each workspace, including grouped multi-file uploads, expandable file cards, individual file open/delete actions, and full group deletion.",
      "Improved workspace access for inactive subscriptions so saved work can still be opened and reviewed, while editing, new uploads, and new form work guide users to manage their subscription.",
      "Refined the My Bids screen with project status badges, safer workspace deletion confirmation, and clearer last-updated tracking as workspace items change.",
    ],
  },
  {
    version: "v1.7.0",
    date: "April 2, 2026",
    highlights: [
      "Improved estimate helper follow-up suggestions so guidance feels more useful and direct.",
      "Preserved existing bid line items when regenerating sections to reduce accidental rework.",
      "Added an in-app release notes screen so customers can review the newest updates from the dashboard.",
    ],
  },
  {
    version: "v1.6.0",
    date: "March 31, 2026",
    highlights: [
      "Added save-draft support so users can pause and return to bid work later.",
      "Introduced change password and forgot password flows for smoother account recovery.",
      "Improved pricing generation with average and higher-tier estimate handling, plus tax and profile form refinements.",
    ],
  },
  {
    version: "v1.5.0",
    date: "March 24, 2026",
    highlights: [
      "Stored bid responses for later access and made edit / regenerate flows more practical.",
      "Improved bid history naming and organization to make past work easier to scan.",
      "Added change order form creation so teams can build follow-up work from prior bids.",
    ],
  },
  {
    version: "v1.4.0",
    date: "March 22, 2026",
    highlights: [
      "Added subscription checkout and subscription management flows.",
      "Updated billing flows with clearer free-trial messaging and more reliable production handling.",
      "Tightened navigation around billing so users return to the dashboard more cleanly.",
    ],
  },
  {
    version: "v1.3.0",
    date: "March 16, 2026",
    highlights: [
      "Added estimate bypass support for cases where users need to move through the flow faster.",
      "Improved mobile-friendly layouts and warning modal behavior for smaller screens.",
      "Refined test bid and bid form experiences, including optional N/A handling for customer contact fields.",
    ],
  },
  {
    version: "v1.2.0",
    date: "February 18, 2026",
    highlights: [
      "Added smart estimate generation to speed up bid creation.",
      "Updated bid form behavior around the new generated-estimate experience.",
      "Improved estimate generation workflows so the experience feels faster and more guided.",
    ],
  },
  {
    version: "v1.1.0",
    date: "January 25, 2026",
    highlights: [
      "Added stronger bid form validation and more accurate cost calculation behavior.",
      "Introduced tax, contingency, and custom field improvements in the pricing flow.",
      "Fixed profile hydration timing and bid form field handling for a more stable editing experience.",
    ],
  },
  {
    version: "v1.0.0",
    date: "December 13, 2025",
    highlights: [
      "Launched authentication, dashboard access, and profile management.",
      "Added the first bid form, bid viewing, uploads, and core bid management workflows.",
      "Rounded out the first release with legal pages, deployment setup, and production site readiness.",
    ],
  },
];

export const latestRelease = releases[0];
