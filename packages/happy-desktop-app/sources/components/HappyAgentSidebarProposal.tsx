import {
    sidebarDocumentView,
    sidebarProposalDiff,
    type HappyAgentSidebarProposalsStore,
    type HappyAgentSpacesSnapshot,
    type SidebarDocumentView,
} from "happy-desktop-state";
import { SidebarProposal, type InlinePageFit, type SidebarItem } from "happy-desktop-ui";
import { useSyncExternalStore } from "react";
import { happyAgentSpacesItems, type HappyAgentSpacesPlaces } from "./HappyAgentSpacesSidebar";

const LIST = "proposal";
/** A preview has no Search or Create of its own. */
const COMMAND_NONE = undefined;

export interface HappyAgentSidebarProposalProps {
    readonly store: HappyAgentSidebarProposalsStore;
    readonly artifactId: string;
    /** Where an inline page learns the proposal's height; a figure learns it itself. */
    readonly fit?: InlinePageFit;
    /** The person's spaces, which the proposal's rows name. */
    readonly snapshot: HappyAgentSpacesSnapshot;
    readonly places: HappyAgentSpacesPlaces;
    readonly titleShimmerEnabled: boolean;
    readonly stemCellAnimation: boolean;
    readonly sessionRow: (agentId: string) => SidebarItem | undefined;
}

/** The proposal's document, or nothing while it is not one the window draws. */
function viewOf(html: string | undefined): SidebarDocumentView | undefined {
    if (html === undefined) return undefined;
    try {
        return sidebarDocumentView(html);
    } catch {
        return undefined;
    }
}

/**
 * The part of a proposed sidebar worth reading: each run under a heading that
 * holds something the proposal changes, heading and all, so a new or moved row
 * is read among its neighbours. Runs it leaves as they are, and the rules
 * between runs, are left out. Without the sidebar it changes, all of it.
 */
function changedRuns(
    items: readonly SidebarItem[],
    anchorOf: ReadonlyMap<string, string | null>,
    changed: ReadonlySet<string> | undefined,
): SidebarItem[] {
    const rows = items.filter((item) => item.kind !== "separator");
    if (changed === undefined) return rows;
    const runs: SidebarItem[][] = [];
    for (const item of rows) {
        if (runs.length === 0 || ((item.depth ?? 0) === 0 && item.kind === "section"))
            runs.push([]);
        runs.at(-1)!.push(item);
    }
    return runs
        .filter((run) =>
            run.some((item) => {
                const key = anchorOf.get(item.id) ?? item.id;
                return changed.has(key);
            }),
        )
        .flat();
}

/**
 * A sidebar Focus proposed, previewed in a chat: what it changes, drawn by the
 * same rows as the window's sidebar, at its full height. It is read-only; the
 * decision is the chat's own button, and a change is asked for in words.
 */
export function HappyAgentSidebarProposal(props: HappyAgentSidebarProposalProps) {
    const { store, artifactId } = props;
    const proposals = useSyncExternalStore(store.subscribe, store.get, store.get);
    // Records what is wanted; the read starts after this render.
    store.proposalsRequest([artifactId]);
    const entry = proposals.get(artifactId);
    const proposal = entry?.type === "ready" ? entry.proposal : undefined;
    const view = viewOf(proposal?.html);
    const current = viewOf(props.snapshot.sidebar?.html);
    const drawn = view
        ? happyAgentSpacesItems({
              view,
              snapshot: props.snapshot,
              places: props.places,
              editable: false,
              titleShimmerEnabled: props.titleShimmerEnabled,
              stemCellAnimation: props.stemCellAnimation,
              search: COMMAND_NONE,
              create: COMMAND_NONE,
              sessionRow: props.sessionRow,
              worktreeRows: () => [],
              ...(proposal ? { newRows: proposal.newRows } : {}),
          })
        : undefined;
    /* What the proposal changes, by node key; once it is decided the sidebar is
       it, so the whole proposal is read as it was. */
    const changed =
        view && current && proposal?.status === "open"
            ? new Set(
                  sidebarProposalDiff(current, view).changes.flatMap((change) => [
                      change.key,
                      ...change.members,
                  ]),
              )
            : undefined;
    const rows = drawn ? changedRuns(drawn.items, drawn.anchorOf, changed) : undefined;
    return (
        // The inline frame stretches its child to the height it reserves, so the
        // proposal is measured in a box of its own that keeps its content height.
        <div
            data-testid="sidebar-proposal-page"
            style={{ display: "flex", flexDirection: "column" }}
        >
            <div
                // The chat sizes this row from its model, so every height the
                // proposal settles on is reported; nothing scrolls inside it.
                ref={(node) => {
                    const fit = props.fit;
                    if (!node || !fit) return;
                    const report = () => fit.heightChanged(node.getBoundingClientRect().height);
                    const observer = new ResizeObserver(report);
                    observer.observe(node);
                    report();
                    return () => observer.disconnect();
                }}
                style={{ display: "flex", flex: "none", flexDirection: "column" }}
            >
                {entry?.type === "missing" ? (
                    <span>This proposal is no longer available.</span>
                ) : proposal && rows ? (
                    <SidebarProposal
                        {...(proposal.error ? { notice: proposal.error.message } : {})}
                        sections={[{ id: LIST, items: rows }]}
                        status={proposal.status}
                        revision={proposal.revision}
                    />
                ) : (
                    <span>Loading the proposed sidebar…</span>
                )}
            </div>
        </div>
    );
}
