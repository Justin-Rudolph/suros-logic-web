import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useParams } from "react-router-dom";

import { firestore } from "@/lib/firebase";
import { BidProjectTimelineStage } from "@/models/BidForms";
import { useBidWorkspaceContext } from "./bidWorkspaceContext";
import "../Dashboard/Dashboard.css";
import "./BidWorkspaceOverview.css";

const TIMELINE_STAGES: Array<{
  id: BidProjectTimelineStage;
  title: string;
  shortLabel: string;
  note: string;
  celebration: string;
}> = [
  {
    id: "draft",
    title: "Draft",
    shortLabel: "Ready to build",
    note: "This project starts here while the bid is still being shaped and reviewed.",
    celebration: "Draft is locked in and ready for the next move.",
  },
  {
    id: "created",
    title: "Bid Created",
    shortLabel: "Foundation set",
    note: "The estimate is in place and ready to move into the real project flow.",
    celebration: "Nice start. The project has a solid game plan.",
  },
  {
    id: "approved",
    title: "Approved",
    shortLabel: "Client green light",
    note: "The customer is aligned and the project can move toward scheduling.",
    celebration: "Momentum unlocked. You turned the bid into a live opportunity.",
  },
  {
    id: "starting",
    title: "Starting",
    shortLabel: "Kickoff mode",
    note: "Crews, materials, and expectations are getting lined up for launch.",
    celebration: "Kickoff is on. The project is moving from plan to action.",
  },
  {
    id: "midway",
    title: "Midway",
    shortLabel: "Strong progress",
    note: "Work is actively moving and this is a great point to keep everyone aligned.",
    celebration: "Halfway there. This is the part clients really feel progress.",
  },
  {
    id: "completed",
    title: "Completed",
    shortLabel: "Finish line",
    note: "The core scope is wrapped and the project is ready for closeout or handoff.",
    celebration: "Job complete. That one is ready to be celebrated.",
  },
];

const formatDate = (value?: { toDate?: () => Date }) => {
  const date = value?.toDate?.();
  return date ? date.toLocaleDateString() : "Pending";
};

const getTimelineStage = (
  bidStage?: BidProjectTimelineStage,
  bidStatus?: string
): BidProjectTimelineStage => {
  if (bidStage) return bidStage;
  return bidStatus === "draft" ? "draft" : "created";
};

export default function BidWorkspaceOverview() {
  const { bidId } = useParams();
  const { bid } = useBidWorkspaceContext();
  const [isSavingStage, setIsSavingStage] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentStage = getTimelineStage(bid?.projectTimelineStage, bid?.status);
  const currentStageIndex = TIMELINE_STAGES.findIndex(
    (stage) => stage.id === currentStage
  );
  const totalMilestones = TIMELINE_STAGES.length - 1;
  const completedMilestones = Math.max(currentStageIndex, 0);

  const progressPercent = Math.round(
    (completedMilestones / totalMilestones) * 100
  );

  const stageCelebration = TIMELINE_STAGES[currentStageIndex]?.celebration;
  const nextStage = TIMELINE_STAGES[currentStageIndex + 1] ?? null;
  const milestoneSummary = `${completedMilestones}/${totalMilestones} milestones`;

  const handleTimelineUpdate = async (stage: BidProjectTimelineStage) => {
    if (!bidId || !bid || stage === currentStage) return;

    setIsSavingStage(true);
    setFeedback(null);
    setErrorMessage(null);

    try {
      await updateDoc(doc(firestore, "bidForms", bidId), {
        projectTimelineStage: stage,
        projectTimelineUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const selectedStage = TIMELINE_STAGES.find((item) => item.id === stage);
      setFeedback(selectedStage?.celebration ?? "Project timeline updated.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not update the project timeline."
      );
    } finally {
      setIsSavingStage(false);
    }
  };

  if (!bid) {
    return (
      <div className="bid-overview-loading">
        <div className="bid-overview-loading-spinner" />
        <p>Loading bid overview...</p>
      </div>
    );
  }

  return (
    <div className="bid-overview">
      <section className="dashboard-card bid-overview-summary">
        <h2>Project Summary</h2>
        <p>
          {bid.workspaceOverviewSummary?.trim()
            ? bid.workspaceOverviewSummary
            : "Overview is being generated..."}
        </p>
      </section>

      <section className="dashboard-card bid-overview-timeline-card">
        <div className="bid-overview-timeline-header">
          <div>
            <h2>Project Timeline</h2>
            <p className="bid-overview-timeline-intro">
              Update the stage as the job moves forward so the workspace stays current.
            </p>
          </div>
          <div className="bid-overview-timeline-status">
            {milestoneSummary}
          </div>
        </div>

        <div className="bid-overview-progress-track">
          <div
            className="bid-overview-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="bid-overview-stage-list">
          {TIMELINE_STAGES.map((stage, index) => {
            const isReached = index <= currentStageIndex;
            const isCurrent = stage.id === currentStage;

            return (
              <div
                key={stage.id}
                className={[
                  "bid-overview-stage-item",
                  isCurrent ? "is-current" : "",
                  isReached ? "is-reached" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="bid-overview-stage-row">
                  <div className="bid-overview-stage-marker">
                    {isReached ? "✓" : index}
                  </div>
                  <div className="bid-overview-stage-content">
                    <div>
                      <strong>{stage.title}</strong>
                      <p className="bid-overview-stage-note">{stage.note}</p>
                    </div>
                    <p className="bid-overview-stage-meta">{stage.shortLabel}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bid-overview-timeline-footer">
          <div>
            {feedback ? <p className="bid-overview-feedback">{feedback}</p> : null}
            {errorMessage ? (
              <p className="bid-overview-feedback-error">{errorMessage}</p>
            ) : null}
            {!feedback && !errorMessage ? (
              <p className="bid-overview-feedback">
                {stageCelebration} Updated {formatDate(bid.projectTimelineUpdatedAt || bid.updatedAt || bid.createdAt)}.
              </p>
            ) : null}
          </div>

          {nextStage ? (
            <button
              type="button"
              className="bid-overview-next-button"
              onClick={() => handleTimelineUpdate(nextStage.id)}
              disabled={isSavingStage}
            >
              {isSavingStage
                ? "Saving..."
                : currentStage === "draft"
                  ? "Bid Created"
                  : `Mark ${nextStage.title}`}
            </button>
          ) : (
            <div className="bid-overview-timeline-status">Completed</div>
          )}
        </div>
      </section>
    </div>
  );
}
