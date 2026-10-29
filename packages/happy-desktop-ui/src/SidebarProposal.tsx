import { useState, type ReactNode } from "react";
import { Sidebar, type SidebarProps } from "./Sidebar";

/**
 * Where one proposal stands. `open` is the only state the person can act in;
 * a proposal they answered says how, and one the agent revised points on to
 * the newer version below it.
 */
export type SidebarProposalStatus = "open" | "accepted" | "declined" | "superseded";

export interface SidebarProposalProps {
    /** The proposed sidebar's rows, drawn by the same `Sidebar` the window uses. */
    readonly sections: SidebarProps["sections"];
    readonly status: SidebarProposalStatus;
    /**
     * The agent's drafts of it, counted from 1: the first reads as the
     * proposal alone, a revision says which it is. The person's own edits never count.
     */
    readonly revision: number;
    /** What the agent changed, in one line, above the rows. */
    readonly summary?: string;
    /** Why the last edit did not go through, under the rows. */
    readonly notice?: string;
    /** A row in the proposal was clicked; it may open what the row stands for. */
    readonly onItemSelect?: SidebarProps["onItemSelect"];
    /** Editing the proposal: the same moves, folds and names as the window's sidebar. */
    readonly onItemReorder?: SidebarProps["onItemReorder"];
    readonly onItemCollapseToggle?: SidebarProps["onItemCollapseToggle"];
    readonly itemRename?: SidebarProps["itemRename"];
    readonly itemMenuItems?: SidebarProps["itemMenuItems"];
    readonly onItemMenuSelect?: SidebarProps["onItemMenuSelect"];
    readonly onDragChange?: SidebarProps["onDragChange"];
}

const STATUS: Record<Exclude<SidebarProposalStatus, "open">, string> = {
    accepted: "In your sidebar now.",
    declined: "You kept your own sidebar.",
    superseded: "Revised below.",
};

/**
 * C-311 SidebarProposal — a sidebar Focus proposes, previewed in a chat as the
 * real `Sidebar` at its full height: the chat scrolls, the proposal never does.
 * It is a preview: the decision is the chat's own button, and a change is
 * asked for in words. While it is open a drag, fold or rename the owner allows
 * edits the proposal, never the person's own sidebar. Answered or revised, it
 * stays in the chat as it was, read-only, with one line saying where it stands. A read-only card still folds and unfolds for the
 * reader, in this card alone, so a folded section can be looked into.
 */
export function SidebarProposal(props: SidebarProposalProps): ReactNode {
    const open = props.status === "open";
    // Sections the reader turned over in a read-only card; the proposal itself is untouched.
    const [turned, setTurned] = useState<ReadonlySet<string>>(() => new Set());
    const sections =
        open || turned.size === 0
            ? props.sections
            : props.sections.map((section) => ({
                  ...section,
                  items: section.items.map((item) =>
                      turned.has(item.id) ? { ...item, collapsed: item.collapsed !== true } : item,
                  ),
              }));
    const turn = (id: string): void =>
        setTurned((current) => {
            const next = new Set(current);
            if (!next.delete(id)) next.add(id);
            return next;
        });
    return (
        <section
            aria-label={
                props.revision > 1
                    ? `Proposed sidebar, revision ${String(props.revision)}`
                    : "Proposed sidebar"
            }
            className="happy-sidebar-proposal"
            data-happy-desktop-ui="sidebar-proposal"
            data-status={props.status}
        >
            <header className="happy-sidebar-proposal__header">
                <span className="happy-sidebar-proposal__title">Proposed sidebar</span>
                {props.revision > 1 ? (
                    <span className="happy-sidebar-proposal__version">
                        {`v${String(props.revision)}`}
                    </span>
                ) : null}
            </header>
            {props.summary ? (
                <p className="happy-sidebar-proposal__summary">{props.summary}</p>
            ) : null}
            <div className="happy-sidebar-proposal__frame">
                <Sidebar
                    activeItemId=""
                    className="happy-sidebar-proposal__sidebar"
                    foldControlPlacement="trailing"
                    foldControlReveal="hover"
                    onItemSelect={props.onItemSelect ?? (() => undefined)}
                    sections={sections}
                    {...(open
                        ? {
                              itemMenuItems: props.itemMenuItems,
                              itemRename: props.itemRename,
                              onDragChange: props.onDragChange,
                              onItemCollapseToggle: props.onItemCollapseToggle,
                              onItemMenuSelect: props.onItemMenuSelect,
                              onItemReorder: props.onItemReorder,
                          }
                        : { onItemCollapseToggle: turn })}
                />
            </div>
            {props.notice || !open ? (
                <footer className="happy-sidebar-proposal__footer">
                    {props.notice ? (
                        <span
                            className="happy-sidebar-proposal__notice"
                            data-happy-desktop-ui="sidebar-proposal-notice"
                            role="alert"
                        >
                            {props.notice}
                        </span>
                    ) : null}
                    {open ? null : (
                        <span
                            className="happy-sidebar-proposal__status"
                            data-happy-desktop-ui="sidebar-proposal-status"
                        >
                            {STATUS[props.status]}
                        </span>
                    )}
                </footer>
            ) : null}
        </section>
    );
}
