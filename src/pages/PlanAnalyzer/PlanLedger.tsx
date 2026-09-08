import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";

/**
 * The plan analyzer results tables. Every module (scopes, verification, safety,
 * conflicts, RFIs) renders the same structure: a column header, then one band
 * per category with its items listed underneath it. Bands replace the old
 * click-through tiles, so the numbers a band reports have to be counted from
 * the full row set — the favorites filter is applied here, after counting,
 * rather than by the caller.
 *
 * This reads as a table but carries no table roles. ARIA wants
 * table > rowgroup > row > cell with nothing generic in between, which the
 * group sections, the band buttons and the rows wrapper all break; a half-valid
 * role="table" hides the rows from assistive tech entirely, which is worse than
 * none. So it is exposed as a grouped list of headings and labelled buttons. Add
 * the roles back only alongside the flatter DOM they require.
 */

export type LedgerTone =
  | "neutral"
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "clarify"
  | "inferred"
  | "risk";

export type LedgerColumn = {
  key: string;
  label: string;
  /** Any grid track value: "1fr", "minmax(0, 220px)", "180px". */
  width: string;
};

export type LedgerRow = {
  id: string;
  /** Plain-text name for the row, used by the mark button's screen reader label. */
  label: string;
  cells: ReactNode[];
};

export type LedgerGroup = {
  key: string;
  label: string;
  tone?: LedgerTone;
  /** Optional band tag, for categories whose type is a property of the group. */
  tag?: string;
  rows: LedgerRow[];
};

type PlanLedgerProps = {
  columns: LedgerColumn[];
  groups: LedgerGroup[];
  markedIds: Set<string>;
  onToggleMark: (id: string) => void;
  canMark: boolean;
  blockedReason?: string;
  favoritesOnly: boolean;
  /** Shown when the favorites filter hides every row. */
  filteredEmptyMessage: string;
};

const padNumber = (value: number) => String(value).padStart(2, "0");
const formatMark = (index: number) => padNumber(index + 1);

export default function PlanLedger({
  columns,
  groups,
  markedIds,
  onToggleMark,
  canMark,
  blockedReason,
  favoritesOnly,
  filteredEmptyMessage,
}: PlanLedgerProps) {
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<string[]>([]);
  const headRef = useRef<HTMLDivElement | null>(null);
  const groupRefs = useRef(new Map<string, HTMLElement>());
  const groupToRevealRef = useRef<string | null>(null);

  const registerGroup = (key: string) => (node: HTMLElement | null) => {
    if (node) {
      groupRefs.current.set(key, node);
    } else {
      groupRefs.current.delete(key);
    }
  };

  const toggleGroup = (key: string) => {
    const willCollapse = !collapsedGroupKeys.includes(key);

    if (willCollapse) {
      groupToRevealRef.current = key;
    }

    setCollapsedGroupKeys((current) =>
      current.includes(key) ? current.filter((groupKey) => groupKey !== key) : [...current, key]
    );
  };

  // Collapsing pulls rows out from above the scroll position, which would
  // otherwise drop you into the middle of the next group. Put the band you just
  // closed back under the column header so the next group starts at its first
  // row. Runs after the rows are gone but before paint, so the jump lands in the
  // same frame as the collapse rather than reading as a separate movement.
  useLayoutEffect(() => {
    const key = groupToRevealRef.current;
    if (!key) return;
    groupToRevealRef.current = null;

    const section = groupRefs.current.get(key);
    if (!section) return;

    // Where the sticky header's bottom edge sits: its own height plus the gap
    // it keeps from the viewport edge. On narrow screens the header is hidden,
    // so its height is 0 and only the gap counts, which is exactly where bands
    // stick there.
    const head = headRef.current;
    const stickyTop = head ? parseFloat(getComputedStyle(head).top) || 0 : 0;
    const headOffset = (head?.offsetHeight ?? 0) + stickyTop;
    const sectionTop = section.getBoundingClientRect().top;

    // Already looking at the band, so nothing scrolled past.
    if (sectionTop >= headOffset) return;

    window.scrollTo({ top: sectionTop + window.scrollY - headOffset, behavior: "auto" });
  }, [collapsedGroupKeys]);

  const columnTemplate = columns.map((column) => column.width).join(" ");

  const preparedGroups = groups.map((group) => {
    const markedCount = group.rows.filter((row) => markedIds.has(row.id)).length;
    const visibleRows = favoritesOnly
      ? group.rows.filter((row) => markedIds.has(row.id))
      : group.rows;

    return { group, markedCount, visibleRows };
  });

  const hasVisibleRows = preparedGroups.some(({ visibleRows }) => visibleRows.length > 0);

  return (
    <div
      className="plan-ledger"
      style={{ "--ledger-columns": columnTemplate } as React.CSSProperties}
    >
      <div className="plan-ledger-head" ref={headRef}>
        {/* The mark column carries no label; its bordered buttons say what it
            does. The cell still has to exist so the columns line up. */}
        <span className="plan-ledger-head-cell" aria-hidden="true" />
        {columns.map((column) => (
          <span key={column.key} className="plan-ledger-head-cell">
            {column.label}
          </span>
        ))}
      </div>

      {favoritesOnly && !hasVisibleRows ? (
        <div className="plan-ledger-filtered-empty">{filteredEmptyMessage}</div>
      ) : null}

      {preparedGroups.map(({ group, markedCount, visibleRows }) => {
        if (favoritesOnly && !visibleRows.length) {
          return null;
        }

        const isEmpty = group.rows.length === 0;
        const isCollapsed = collapsedGroupKeys.includes(group.key) || isEmpty;
        const fillPercent = group.rows.length
          ? Math.round((markedCount / group.rows.length) * 100)
          : 0;

        return (
          <section
            key={group.key}
            ref={registerGroup(group.key)}
            className={`plan-ledger-group plan-ledger-tone-${group.tone || "neutral"}${
              isEmpty ? " plan-ledger-group-empty" : ""
            }`}
          >
            <button
              type="button"
              className="plan-ledger-band"
              onClick={() => !isEmpty && toggleGroup(group.key)}
              aria-expanded={!isCollapsed}
              disabled={isEmpty}
            >
              <ChevronRight
                size={14}
                className={`plan-ledger-band-chevron${isCollapsed ? "" : " is-open"}`}
                aria-hidden="true"
              />
              <span className="plan-ledger-band-name">{group.label}</span>
              {group.tag ? <span className="plan-ledger-band-tag">{group.tag}</span> : null}
              <span className="plan-ledger-band-leader" aria-hidden="true" />
              {markedCount ? (
                <span className="plan-ledger-band-marked">
                  {markedCount} {markedCount === 1 ? "favorite" : "favorites"}
                </span>
              ) : null}
              <span className="plan-ledger-band-count">
                {isEmpty ? "None" : `${padNumber(group.rows.length)} items`}
              </span>
              <span
                className="plan-ledger-band-fill"
                style={{ width: `${fillPercent}%` }}
                aria-hidden="true"
              />
            </button>

            {isCollapsed ? null : (
              <div className="plan-ledger-rows">
                {visibleRows.map((row) => {
                  const isMarked = markedIds.has(row.id);
                  const markIndex = group.rows.findIndex(({ id }) => id === row.id);

                  return (
                    <div
                      key={row.id}
                      className={`plan-ledger-row${isMarked ? " is-marked" : ""}`}
                    >
                      <button
                        type="button"
                        className={`plan-ledger-mark${isMarked ? " is-marked" : ""}`}
                        onClick={() => onToggleMark(row.id)}
                        disabled={!canMark}
                        title={blockedReason}
                        aria-pressed={isMarked}
                        aria-label={
                          isMarked
                            ? `Remove ${row.label} from favorites`
                            : `Add ${row.label} to favorites`
                        }
                      >
                        <span className="plan-ledger-mark-number">{formatMark(markIndex)}</span>
                        <span className="plan-ledger-mark-box" aria-hidden="true">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      </button>

                      {row.cells.map((cell, cellIndex) => (
                        <div
                          key={columns[cellIndex]?.key || cellIndex}
                          className="plan-ledger-cell"
                          data-label={columns[cellIndex]?.label}
                        >
                          {cell}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
