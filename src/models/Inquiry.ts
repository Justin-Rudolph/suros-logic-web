import { Timestamp } from "firebase/firestore";

/**
 * A lead submitted through the landing page's "Get More Info" form.
 *
 * Submitted by anonymous visitors (no login required), so there is no
 * userId/accountId on these records — only the form fields plus a
 * server-stamped createdAt. Written by the `submitInquiry` Cloud Function
 * via the Admin SDK (see functions/routes/submitInquiry.js for the write
 * validation that backs this shape); the `inquiries` match block in
 * firestore.rules is a secondary safeguard, not the primary write path.
 */
export type Inquiry = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  companyName: string;
  website?: string;
  companyDescription?: string;
  createdAt: Timestamp;
};
