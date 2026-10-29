import type { SidebarItem } from "../../src/Sidebar";
import { SidebarProposal } from "../../src/SidebarProposal";
import { clayIconMark } from "../../src/clayIcons";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-311";

/* Fixture data: a made-up developer's proposed work. */
const PROPOSED: SidebarItem[] = [
    { collapsed: false, id: "signin", kind: "section", label: "Sign-in and onboarding" },
    {
        id: "redesign",
        imageMark: clayIconMark("ux"),
        kind: "project",
        label: "Onboarding redesign",
        note: "new",
    },
    {
        id: "windows",
        imageMark: clayIconMark("login"),
        kind: "project",
        label: "Windows sign-in",
        note: "new",
    },
    { collapsed: false, id: "release", kind: "section", label: "Release pipeline" },
    {
        id: "ci",
        imageMark: clayIconMark("flaky"),
        kind: "project",
        label: "Release CI",
        note: "new",
    },
    {
        id: "checkin",
        imageMark: clayIconMark("app-store-release"),
        kind: "project",
        label: "Release check-in",
        note: "new · ongoing",
    },
];

/* A revision that moves rows the person already has, under their current sections. */
const MOVED: SidebarItem[] = [
    { collapsed: false, id: "this-week", kind: "section", label: "This week" },
    { emoji: "🪟", id: "signing", kind: "view", label: "Windows installer signing" },
    { emoji: "⚡", id: "voice", kind: "view", label: "Voice dictation latency" },
    { collapsed: false, id: "releases", kind: "section", label: "Releases" },
    { emoji: "🤖", id: "android", kind: "view", label: "Android release 2.4" },
];

function Column(props: { children: React.ReactNode }) {
    return (
        <div
            style={{
                background: "var(--background)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "16px",
                width: "420px",
            }}
        >
            {props.children}
        </div>
    );
}

export function SidebarProposalPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A sidebar Focus proposes, previewed in a chat as the real Sidebar at its full height, with no scroll of its own. It shows what the proposal changes and the sections around it; the decision is the chat's own button, and a change is asked for in words. Answered or revised, it stays in the chat, read-only, with one line saying where it stands."
            title="Sidebar proposal"
        >
            <Specimen
                detail="card ≤ 360 px · 12 px padding · 1 px hairline · no footer while open"
                label="In a chat — open"
                number="01"
                stage="surface"
            >
                <div
                    data-screen="sidebar-proposal-open"
                    style={{ display: "flex", flexDirection: "column", gap: "16px" }}
                >
                    <Column>
                        <SidebarProposal
                            revision={1}
                            sections={[{ id: "open", items: PROPOSED, label: "" }]}
                            status="open"
                        />
                    </Column>
                    <DimensionRule label="420 px chat column · the chat scrolls, the proposal never does" />
                </div>
            </Specimen>
            <Specimen
                detail="answered or revised, the rows are read-only and one line says where it stands"
                label="Answered"
                number="02"
                stage="surface"
            >
                <Column>
                    <SidebarProposal
                        revision={1}
                        sections={[{ id: "a", items: PROPOSED, label: "" }]}
                        status="accepted"
                    />
                    <SidebarProposal
                        revision={2}
                        sections={[{ id: "m", items: MOVED, label: "" }]}
                        status="superseded"
                        summary="Grouped what you touched this week at the top."
                    />
                </Column>
            </Specimen>
        </ComponentPage>
    );
}
