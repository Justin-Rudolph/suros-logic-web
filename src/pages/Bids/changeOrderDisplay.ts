import { ChangeOrderRecord } from "@/models/ChangeOrder";
import { ChangeOrderProposalRecord } from "@/models/ChangeOrderProposals";

type TimestampedRecord = {
  createdAt?: { toDate?: () => Date };
  updatedAt?: { toDate?: () => Date };
};

export const formatChangeOrderTimestamp = (record: TimestampedRecord) => {
  const timestamp = record.updatedAt?.toDate?.() || record.createdAt?.toDate?.();
  return timestamp ? timestamp.toLocaleString() : "Pending timestamp";
};

export const getProposalStatusLabel = (status?: string) => {
  if (status === "generating") return "Generating proposal";
  if (status === "error") return "Proposal error";
  if (status === "ready") return "Proposal ready";
  return "Proposal not created yet";
};

export const mapProposalsByChangeOrder = (proposals: ChangeOrderProposalRecord[]) =>
  proposals.reduce<Record<string, ChangeOrderProposalRecord>>((acc, proposal) => {
    if (!acc[proposal.changeOrderId]) {
      acc[proposal.changeOrderId] = proposal;
    }
    return acc;
  }, {});

export const mapChangeOrderDisplayIndexById = (changeOrders: ChangeOrderRecord[]) => {
  const orderedByCreatedAt = [...changeOrders].sort((a, b) => {
    const aTime = a.createdAt?.toDate?.().getTime() || a.updatedAt?.toDate?.().getTime() || 0;
    const bTime = b.createdAt?.toDate?.().getTime() || b.updatedAt?.toDate?.().getTime() || 0;
    return aTime - bTime;
  });

  return orderedByCreatedAt.reduce<Record<string, number>>((acc, changeOrder, index) => {
    acc[changeOrder.id] = index + 1;
    return acc;
  }, {});
};
