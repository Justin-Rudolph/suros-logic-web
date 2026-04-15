import { useOutletContext } from "react-router-dom";

import { BidFormProposalRecord } from "@/models/BidFormProposals";
import { BidFormRecord } from "@/models/BidForms";
import { ChangeOrderRecord } from "@/models/ChangeOrder";
import { ChangeOrderProposalRecord } from "@/models/ChangeOrderProposals";

export type BidWorkspaceOutletContext = {
  bid: BidFormRecord | null;
  proposal: BidFormProposalRecord | null;
  changeOrders: ChangeOrderRecord[];
  changeOrderProposals: ChangeOrderProposalRecord[];
  hasActiveSubscription: boolean;
};

export const useBidWorkspaceContext = () =>
  useOutletContext<BidWorkspaceOutletContext>();
