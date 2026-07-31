import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { isOwner } from "@/lib/account";
import {
  Seat,
  SeatApiError,
  addSeat,
  listSeats,
  reactivateSeat,
  removeSeat,
  updateSeat,
} from "@/lib/seatsApi";
import { MemberPermission, SeatPlanAnalyzerLimit } from "@/models/UserProfile";
import "@/styles/gradients.css";
import "./Team.css";

const MAX_SEATS = 3;
const TRIAL_MAX_SEATS = 1;

const TIER_OPTIONS: {
  value: SeatPlanAnalyzerLimit;
  amount: number;
  price: string;
  label: string;
  short: string;
}[] = [
  {
    value: 1,
    amount: 55,
    price: "$55/mo",
    label: "1 plan analysis / month",
    short: "1 analysis/mo",
  },
  {
    value: 2,
    amount: 65,
    price: "$65/mo",
    label: "2 plan analyses / month",
    short: "2 analyses/mo",
  },
  {
    value: 3,
    amount: 75,
    price: "$75/mo",
    label: "3 plan analyses / month",
    short: "3 analyses/mo",
  },
];

const PERMISSION_OPTIONS: { value: MemberPermission; label: string }[] = [
  { value: "own", label: "Own only — see & edit only their own work" },
  {
    value: "view_all_edit_own",
    label: "View all, edit own — see everything, edit only their own",
  },
  { value: "full", label: "Full — view & edit everything in the account" },
];

const tierOption = (tier?: SeatPlanAnalyzerLimit) =>
  TIER_OPTIONS.find((option) => option.value === tier);

const tierPrice = (tier?: SeatPlanAnalyzerLimit) => tierOption(tier)?.price ?? "—";

const tierShort = (tier?: SeatPlanAnalyzerLimit) => tierOption(tier)?.short ?? "—";

const permissionLabel = (permission?: MemberPermission) =>
  PERMISSION_OPTIONS.find((option) => option.value === permission)?.label ?? "—";

// Rendered with the browser's own locale and timezone, so the date matches
// wherever the owner happens to be.
const formatAddedOn = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

type SeatDraft = { tier: SeatPlanAnalyzerLimit; permission: MemberPermission };
type SeatFilter = "all" | "active" | "removed";

const draftFromSeat = (seat: Seat): SeatDraft => ({
  tier: seat.seatPlanAnalyzerLimit ?? 1,
  permission: seat.memberPermission ?? "own",
});

const buildDrafts = (seats: Seat[]): Record<string, SeatDraft> =>
  Object.fromEntries(
    seats
      .filter((seat) => seat.seatStatus !== "removed")
      .map((seat) => [seat.uid, draftFromSeat(seat)])
  );

const buildReactivateDrafts = (seats: Seat[]): Record<string, SeatDraft> =>
  Object.fromEntries(
    seats
      .filter((seat) => seat.seatStatus === "removed")
      .map((seat) => [seat.uid, draftFromSeat(seat)])
  );

export default function Team() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const owner = isOwner(profile);

  const [seats, setSeats] = useState<Seat[]>([]);
  const [drafts, setDrafts] = useState<Record<string, SeatDraft>>({});
  const [reactivateDrafts, setReactivateDrafts] = useState<
    Record<string, SeatDraft>
  >({});
  const [loading, setLoading] = useState(true);
  // Errors are scoped to where the action was triggered, so they are visible
  // without scrolling: page-level (loading seats), inside the add-seat dialog,
  // and inside whichever confirmation dialog is open.
  const [error, setError] = useState("");
  const [addError, setAddError] = useState("");
  // Set when a seat action fails because the trial only covers one member.
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [seatActionError, setSeatActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<SeatFilter>("all");

  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newTier, setNewTier] = useState<SeatPlanAnalyzerLimit>(1);
  const [newPermission, setNewPermission] = useState<MemberPermission>("own");
  const [seatPendingSave, setSeatPendingSave] = useState<Seat | null>(null);
  const [seatPendingRemove, setSeatPendingRemove] = useState<Seat | null>(null);
  const [seatPendingReactivate, setSeatPendingReactivate] =
    useState<Seat | null>(null);

  const activeSeats = useMemo(
    () => seats.filter((seat) => seat.seatStatus !== "removed"),
    [seats]
  );
  const removedSeats = useMemo(
    () => seats.filter((seat) => seat.seatStatus === "removed"),
    [seats]
  );
  const atCap = activeSeats.length >= MAX_SEATS;

  // A trial covers one member. Kept separate from `atCap`: that one disables
  // the controls, whereas this needs them clickable so the click can explain
  // itself. Mirrors seatCapFor() on the server, which does the real enforcing.
  const trialCapReached =
    profile?.stripeSubscriptionStatus === "trialing" &&
    activeSeats.length >= TRIAL_MAX_SEATS;

  const trialSeatCopy = `Your trial includes ${TRIAL_MAX_SEATS} team member${TRIAL_MAX_SEATS === 1 ? "" : "s"
    }. Upgrade to the full plan to add more.`;

  /**
   * True when the click should be stopped and the upgrade prompt shown.
   *
   * Re-reads the profile before deciding: `stripeSubscriptionStatus` is a
   * webhook-derived copy, and this page never refreshes it on its own. A trial
   * that converted to paid in another tab would otherwise leave a paying owner
   * staring at an upgrade prompt with no way past it, since the server would
   * happily have allowed the seat.
   */
  const blockedByTrialCap = async () => {
    if (!trialCapReached) return false;

    const fresh = await refreshProfile().catch(() => null);
    // Only trust a definite answer; on a failed refresh fall back to what we
    // had rather than letting the attempt through to a certain rejection.
    const status = fresh?.stripeSubscriptionStatus ?? profile?.stripeSubscriptionStatus;
    if (status !== "trialing") return false;

    setUpgradeMessage(trialSeatCopy);
    return true;
  };

  // Only active seats are billed, so only they consume capacity.
  const monthlyTotal = useMemo(
    () =>
      activeSeats.reduce(
        (total, seat) =>
          total + (tierOption(seat.seatPlanAnalyzerLimit)?.amount ?? 0),
        0
      ),
    [activeSeats]
  );
  const onTrial = profile?.stripeSubscriptionStatus === "trialing";
  // Seats ride the owner's single subscription, so if it lapses every seat is
  // suspended — logins disabled, nothing billed — even though the seat itself
  // still exists and returns intact on resubscribe. Read from the owner's live
  // profile rather than the seat's mirrored isSubscribed so this stays honest
  // even if webhook propagation was missed.
  const accountInactive = profile?.isSubscribed !== true;

  // "All" leads with the seats you can act on; removed ones sink to the end.
  const visibleSeats =
    filter === "active"
      ? activeSeats
      : filter === "removed"
        ? removedSeats
        : [...activeSeats, ...removedSeats];

  const refresh = async () => {
    try {
      setLoading(true);
      const next = await listSeats();
      setSeats(next);
      setDrafts(buildDrafts(next));
      setReactivateDrafts(buildReactivateDrafts(next));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load seats.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Members never see this page.
    if (profile && !owner) {
      navigate("/dashboard", { replace: true });
      return;
    }
    if (owner) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, profile?.uid]);

  const openAddSeat = async () => {
    // Say it up front. Filling in an email, tier and permission only to be
    // refused on submit is wasted work.
    if (await blockedByTrialCap()) return;

    setAddError("");
    setNewEmail("");
    setNewTier(1);
    setNewPermission("own");
    setAddOpen(true);
  };

  const handleAdd = async () => {
    if (!newEmail.trim()) {
      setAddError("Enter an email address.");
      return;
    }
    try {
      setBusy(true);
      setAddError("");
      await addSeat({
        email: newEmail.trim(),
        tier: newTier,
        permission: newPermission,
      });
      setAddOpen(false);
      await refresh();
    } catch (err) {
      // The trial seat cap is not something a retry fixes, so swap the add
      // form for a prompt that leads where it can actually be resolved.
      if ((err as SeatApiError)?.upgradeRequired) {
        setAddOpen(false);
        setUpgradeMessage(
          err instanceof Error
            ? err.message
            : "Upgrade to the full plan to add more team members."
        );
        return;
      }

      setAddError(err instanceof Error ? err.message : "Failed to add seat.");
    } finally {
      setBusy(false);
    }
  };

  // Tier/permission edits are staged locally (no network call) until the owner
  // explicitly saves — changing a dropdown must never silently update Stripe
  // billing by itself.
  const setDraftTier = (seat: Seat, tier: SeatPlanAnalyzerLimit) =>
    setDrafts((prev) => ({
      ...prev,
      [seat.uid]: { ...(prev[seat.uid] ?? draftFromSeat(seat)), tier },
    }));

  const setDraftPermission = (seat: Seat, permission: MemberPermission) =>
    setDrafts((prev) => ({
      ...prev,
      [seat.uid]: { ...(prev[seat.uid] ?? draftFromSeat(seat)), permission },
    }));

  const isSeatDirty = (seat: Seat) => {
    const draft = drafts[seat.uid];
    if (!draft) return false;
    return (
      draft.tier !== (seat.seatPlanAnalyzerLimit ?? 1) ||
      draft.permission !== (seat.memberPermission ?? "own")
    );
  };

  const handleDiscardSeat = (seat: Seat) =>
    setDrafts((prev) => ({ ...prev, [seat.uid]: draftFromSeat(seat) }));

  // Which fields a seat's draft would actually change, used both to build the
  // update payload and to spell the change out in the confirmation dialog.
  const pendingSeatChanges = (seat: Seat) => {
    const draft = drafts[seat.uid];
    const payload: {
      tier?: SeatPlanAnalyzerLimit;
      permission?: MemberPermission;
    } = {};
    if (!draft) return payload;
    if (draft.tier !== (seat.seatPlanAnalyzerLimit ?? 1)) payload.tier = draft.tier;
    if (draft.permission !== (seat.memberPermission ?? "own")) {
      payload.permission = draft.permission;
    }
    return payload;
  };

  const confirmSaveSeat = async () => {
    if (!seatPendingSave) return;

    const payload = pendingSeatChanges(seatPendingSave);
    if (Object.keys(payload).length === 0) {
      setSeatPendingSave(null);
      return;
    }

    try {
      setBusy(true);
      setSeatActionError("");
      await updateSeat(seatPendingSave.uid, payload);
      // Close before refreshing: refresh() rebuilds `drafts`, which would leave
      // the still-open dialog describing an empty set of changes for a frame.
      setSeatPendingSave(null);
      await refresh();
    } catch (err) {
      setSeatActionError(
        err instanceof Error ? err.message : "Failed to update seat."
      );
    } finally {
      setBusy(false);
    }
  };

  const setReactivateDraftTier = (seat: Seat, tier: SeatPlanAnalyzerLimit) =>
    setReactivateDrafts((prev) => ({
      ...prev,
      [seat.uid]: { ...(prev[seat.uid] ?? draftFromSeat(seat)), tier },
    }));

  const setReactivateDraftPermission = (
    seat: Seat,
    permission: MemberPermission
  ) =>
    setReactivateDrafts((prev) => ({
      ...prev,
      [seat.uid]: { ...(prev[seat.uid] ?? draftFromSeat(seat)), permission },
    }));

  const confirmReactivateSeat = async () => {
    if (!seatPendingReactivate) return;
    const draft =
      reactivateDrafts[seatPendingReactivate.uid] ??
      draftFromSeat(seatPendingReactivate);
    try {
      setBusy(true);
      setSeatActionError("");
      await reactivateSeat(seatPendingReactivate.uid, {
        tier: draft.tier,
        permission: draft.permission,
      });
      setSeatPendingReactivate(null);
      await refresh();
    } catch (err) {
      // Reactivating counts against the same cap as adding, so it hits the
      // trial paywall the same way.
      if ((err as SeatApiError)?.upgradeRequired) {
        setSeatPendingReactivate(null);
        setUpgradeMessage(
          err instanceof Error
            ? err.message
            : "Upgrade to the full plan to add more team members."
        );
        return;
      }

      setSeatActionError(
        err instanceof Error ? err.message : "Failed to reactivate seat."
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmRemoveSeat = async () => {
    if (!seatPendingRemove) return;
    try {
      setBusy(true);
      setSeatActionError("");
      await removeSeat(seatPendingRemove.uid);
      setSeatPendingRemove(null);
      await refresh();
    } catch (err) {
      setSeatActionError(
        err instanceof Error ? err.message : "Failed to remove seat."
      );
    } finally {
      setBusy(false);
    }
  };

  if (!owner) {
    return null;
  }

  const openSlotCount = Math.max(MAX_SEATS - activeSeats.length, 0);

  const filters: { id: SeatFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: seats.length },
    { id: "active", label: "Active", count: activeSeats.length },
    { id: "removed", label: "Removed", count: removedSeats.length },
  ];

  return (
    <div className="suros-gradient team-page">
      <button className="team-back" onClick={() => navigate("/dashboard")}>
        ← Back
      </button>

      <div className="team-shell">
        <header className="team-head">
          <div>
            <p className="team-kicker">Team</p>
            <h1 className="team-title">Seats</h1>
            <p className="team-lede">
              Teammates work under your company branding and get everything you
              do: Unlimited bids, price estimates, change orders, and file uploads. The plan you
              pick only sets how many plan analyses they get each month.
            </p>
          </div>
          <div className="team-head-actions">
            <button
              className="btn-ghost"
              onClick={() => navigate("/billing")}
            >
              Manage subscription
            </button>
            <button
              className="btn-flare"
              onClick={openAddSeat}
              disabled={atCap || busy}
              title={
                atCap
                  ? `All ${MAX_SEATS} seats are filled. Remove a seat to add another.`
                  : undefined
              }
            >
              Add seat
            </button>
          </div>
        </header>

        {error && <div className="team-alert">{error}</div>}

        {accountInactive && seats.length > 0 && (
          <div className="team-notice">
            Your subscription is inactive, so every seat is suspended — their
            logins are turned off and nothing is being billed. Seats are kept as
            they are; restart your subscription and everyone comes back with the
            same plan and access.
          </div>
        )}

        {/* Capacity: who holds a seat, what it costs, what's left. */}
        <section className="rail-card">
          <div className="rail-head">
            <p className="team-kicker">
              {activeSeats.length} of {MAX_SEATS} seats filled
            </p>
            <div>
              <div className="rail-total">
                ${monthlyTotal}
                <span className="rail-total-unit">/mo</span>
              </div>
              <p className="rail-note">
                {accountInactive
                  ? "Paused while your subscription is inactive"
                  : onTrial
                    ? "Billed when your trial ends"
                    : "Added to your subscription"}
              </p>
            </div>
          </div>

          <ol className="rail">
            {activeSeats.map((seat) => (
              <li key={seat.uid} className="slot slot-filled">
                <span className="slot-bar" />
                <span className="slot-name">
                  {seat.displayName || seat.email}
                </span>
                <span className="slot-meta">
                  {tierPrice(seat.seatPlanAnalyzerLimit)} ·{" "}
                  {tierShort(seat.seatPlanAnalyzerLimit)}
                </span>
              </li>
            ))}

            {Array.from({ length: openSlotCount }).map((_, index) => (
              <li key={`open-${index}`} className="slot-shell">
                <button className="slot slot-open" onClick={openAddSeat} disabled={busy}>
                  + Add seat
                  <span className="slot-open-label">Open slot</span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <div className="seat-filters">
          {filters.map((entry) => (
            <button
              key={entry.id}
              className={`seat-filter${
                filter === entry.id ? " seat-filter-on" : ""
              }`}
              onClick={() => setFilter(entry.id)}
              aria-pressed={filter === entry.id}
            >
              {entry.label}
              <span className="seat-filter-count">{entry.count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="seat-empty">
            <p className="seat-empty-text">Loading seats…</p>
          </div>
        ) : visibleSeats.length === 0 ? (
          <div className="seat-empty">
            <p className="seat-empty-title">
              {filter === "removed"
                ? "No removed seats"
                : filter === "active"
                  ? "No active seats"
                  : "No seats yet"}
            </p>
            {/* No button here on purpose: whenever this shows, the capacity
                rail just above is already offering open slots, and the header
                keeps its own Add seat control. */}
            <p className="seat-empty-text">
              {filter === "removed"
                ? "Seats you remove stay here, so you can bring someone back later."
                : "Pick an open slot above to add a teammate — they'll get an email to set their password."}
            </p>
          </div>
        ) : (
          <div className="seat-grid">
            {visibleSeats.map((seat) => {
              const removed = seat.seatStatus === "removed";
              const draft = drafts[seat.uid] ?? draftFromSeat(seat);
              const dirty = !removed && isSeatDirty(seat);
              const reactivateDraft =
                reactivateDrafts[seat.uid] ?? draftFromSeat(seat);

              return (
                <article
                  key={seat.uid}
                  className={`seat-card${removed ? " seat-card-removed" : ""}${
                    dirty ? " seat-card-dirty" : ""
                  }`}
                >
                  <div className="seat-card-head">
                    <div className="seat-card-meta">
                      <span className="seat-status">
                        <span
                          className={`seat-status-dot${
                            removed
                              ? " seat-status-dot-off"
                              : accountInactive
                                ? " seat-status-dot-warn"
                                : ""
                          }`}
                        />
                        {removed
                          ? "Removed"
                          : accountInactive
                            ? "Suspended"
                            : "Active"}
                      </span>
                      {formatAddedOn(seat.createdAt) && (
                        <span className="seat-added">
                          Added {formatAddedOn(seat.createdAt)}
                        </span>
                      )}
                    </div>
                    <h2 className="seat-name">
                      {seat.displayName || seat.email}
                    </h2>
                    {seat.displayName && <p className="seat-email">{seat.email}</p>}
                  </div>

                  {removed ? (
                    <>
                      <p className="seat-hint">
                        Their old password still works, and billing restarts
                        prorated for this cycle.
                      </p>

                      <div className="seat-fields">
                        <label className="seat-field">
                          <span className="seat-label">Plan</span>
                          <select
                            className="seat-select"
                            value={reactivateDraft.tier}
                            disabled={busy}
                            onChange={(e) =>
                              setReactivateDraftTier(
                                seat,
                                Number(e.target.value) as SeatPlanAnalyzerLimit
                              )
                            }
                          >
                            {TIER_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.price} — {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="seat-field">
                          <span className="seat-label">Access</span>
                          <select
                            className="seat-select"
                            value={reactivateDraft.permission}
                            disabled={busy}
                            onChange={(e) =>
                              setReactivateDraftPermission(
                                seat,
                                e.target.value as MemberPermission
                              )
                            }
                          >
                            {PERMISSION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="seat-foot">
                        <button
                          className="btn-reactivate"
                          disabled={busy || atCap || accountInactive}
                          title={
                            accountInactive
                              ? "Restart your subscription to reactivate seats."
                              : atCap
                                ? `All ${MAX_SEATS} seats are filled. Remove a seat to bring this one back.`
                                : undefined
                          }
                          onClick={async () => {
                            // Same reasoning as Add seat: refuse before the
                            // confirmation dialog, not after it.
                            if (await blockedByTrialCap()) return;

                            setSeatActionError("");
                            setSeatPendingReactivate(seat);
                          }}
                        >
                          Reactivate seat
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="seat-fields">
                        <label className="seat-field">
                          <span className="seat-label">Plan</span>
                          <select
                            className="seat-select"
                            value={draft.tier}
                            disabled={busy}
                            onChange={(e) =>
                              setDraftTier(
                                seat,
                                Number(e.target.value) as SeatPlanAnalyzerLimit
                              )
                            }
                          >
                            {TIER_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.price} — {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="seat-field">
                          <span className="seat-label">Access</span>
                          <select
                            className="seat-select"
                            value={draft.permission}
                            disabled={busy}
                            onChange={(e) =>
                              setDraftPermission(
                                seat,
                                e.target.value as MemberPermission
                              )
                            }
                          >
                            {PERMISSION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="seat-foot">
                        {dirty && (
                          <div className="seat-dirty">
                            <p className="seat-dirty-note">
                              Not saved yet — nothing is billed until you save.
                            </p>
                            <div className="seat-dirty-actions">
                              <button
                                className="btn-save"
                                disabled={busy || accountInactive}
                                title={
                                  accountInactive
                                    ? "Restart your subscription to change seat plans."
                                    : undefined
                                }
                                onClick={() => {
                                  setSeatActionError("");
                                  setSeatPendingSave(seat);
                                }}
                              >
                                Save changes
                              </button>
                              <button
                                className="btn-discard"
                                disabled={busy}
                                onClick={() => handleDiscardSeat(seat)}
                              >
                                Discard
                              </button>
                            </div>
                          </div>
                        )}

                        <button
                          className="btn-remove"
                          disabled={busy}
                          onClick={() => {
                            setSeatActionError("");
                            setSeatPendingRemove(seat);
                          }}
                        >
                          Remove seat
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* ==== ADD SEAT ==== */}
      {addOpen && (
        <div className="billing-modal-overlay">
          <div className="billing-modal billing-modal-form">
            <h2>Add a seat</h2>
            <p>
              They're created right away and emailed a link to set their
              password.
            </p>

            <label className="form-field">
              <span className="form-label">Teammate email</span>
              <input
                type="email"
                className="form-input"
                value={newEmail}
                disabled={busy}
                placeholder="teammate@company.com"
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </label>

            <label className="form-field">
              <span className="form-label">Plan</span>
              <select
                className="form-select"
                value={newTier}
                disabled={busy}
                onChange={(e) =>
                  setNewTier(Number(e.target.value) as SeatPlanAnalyzerLimit)
                }
              >
                {TIER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.price} — {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span className="form-label">Access</span>
              <select
                className="form-select"
                value={newPermission}
                disabled={busy}
                onChange={(e) =>
                  setNewPermission(e.target.value as MemberPermission)
                }
              >
                {PERMISSION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <p className="form-note">
              {onTrial
                ? `Your account is still in its free trial, so this seat rides the trial free. It starts billing at ${tierPrice(
                    newTier
                  )} when the trial ends.`
                : `Billing starts now: ${tierPrice(
                    newTier
                  )} is added to your subscription, prorated for the rest of this cycle, and appears on your next invoice.`}
            </p>

            {addError && <p className="billing-modal-error">{addError}</p>}

            <div className="billing-modal-actions">
              <button
                className="secondary"
                onClick={() => setAddOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="primary" onClick={handleAdd} disabled={busy}>
                {busy ? "Adding…" : "Add seat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==== SAVE CHANGES ==== */}
      {seatPendingSave &&
        (() => {
          const changes = pendingSeatChanges(seatPendingSave);
          const tierChanging = changes.tier !== undefined;
          return (
            <div className="billing-modal-overlay">
              <div className="billing-modal">
                <h2>
                  {tierChanging ? "Update plan and billing?" : "Update access?"}
                </h2>
                <p>
                  {tierChanging && (
                    <>
                      This changes {seatPendingSave.email}'s plan from{" "}
                      {tierPrice(seatPendingSave.seatPlanAnalyzerLimit ?? 1)} to{" "}
                      <strong>{tierPrice(changes.tier)}</strong>, updating their
                      line item on your Stripe invoice — prorated for the rest of
                      this billing cycle.
                    </>
                  )}
                  {tierChanging && changes.permission !== undefined && " "}
                  {changes.permission !== undefined && (
                    <>
                      Their access becomes{" "}
                      <strong>{permissionLabel(changes.permission)}</strong>.
                      {!tierChanging && " This does not affect billing."}
                    </>
                  )}
                </p>

                {seatActionError && (
                  <p className="billing-modal-error">{seatActionError}</p>
                )}

                <div className="billing-modal-actions">
                  <button
                    className="secondary"
                    onClick={() => setSeatPendingSave(null)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary"
                    onClick={confirmSaveSeat}
                    disabled={busy}
                  >
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ==== REACTIVATE ==== */}
      {seatPendingReactivate && (
        <div className="billing-modal-overlay">
          <div className="billing-modal">
            <h2>Reactivate this seat?</h2>
            <p>
              This adds {seatPendingReactivate.email} back to your subscription
              at{" "}
              {tierPrice(
                (
                  reactivateDrafts[seatPendingReactivate.uid] ??
                  draftFromSeat(seatPendingReactivate)
                ).tier
              )}
              , prorated for the rest of your current billing cycle. Their
              existing login is re-enabled immediately — their old password still
              works — and we'll email them a fresh set-password link.
            </p>

            {seatActionError && (
              <p className="billing-modal-error">{seatActionError}</p>
            )}

            <div className="billing-modal-actions">
              <button
                className="secondary"
                onClick={() => setSeatPendingReactivate(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="primary"
                onClick={confirmReactivateSeat}
                disabled={busy}
              >
                {busy ? "Reactivating…" : "Reactivate seat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==== REMOVE ==== */}
      {seatPendingRemove && (
        <div className="billing-modal-overlay">
          <div className="billing-modal">
            <h2>Remove this seat?</h2>
            <p>
              Remove {seatPendingRemove.email}? Their login is revoked
              immediately and billing stops, but every bid, change order, and
              file they created stays in the account.
            </p>

            {seatActionError && (
              <p className="billing-modal-error">{seatActionError}</p>
            )}

            <div className="billing-modal-actions">
              <button
                className="secondary"
                onClick={() => setSeatPendingRemove(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="danger"
                onClick={confirmRemoveSeat}
                disabled={busy}
              >
                {busy ? "Removing…" : "Remove seat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trial seat cap. Not an error the owner can retry past — the only way
          forward is billing, so the primary action goes there. */}
      {upgradeMessage && (
        <div className="billing-modal-overlay">
          <div className="billing-modal">
            <h2>Upgrade to add more team members</h2>

            <p>{upgradeMessage}</p>

            <div className="billing-modal-actions">
              <button
                className="secondary"
                onClick={() => setUpgradeMessage("")}
              >
                Not now
              </button>
              <button
                className="primary"
                onClick={() => navigate("/billing")}
              >
                Manage subscription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
