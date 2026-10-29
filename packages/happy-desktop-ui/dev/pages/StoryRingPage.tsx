import { useState } from "react";
import { clayIconMark, happyIconMark, type ClayIconSlug } from "../../src/clayIcons";
import { Sidebar, type SidebarItem, type SidebarReorder } from "../../src/Sidebar";
import { SidebarFooter } from "../../src/SidebarFooter";
import { StemCellGrowth } from "../../src/StemCellGrowth";
import { StoryRing } from "../../src/StoryRing";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-319";

const noop = () => undefined;

function Clay(props: { readonly slug: ClayIconSlug }) {
    return (
        <StemCellGrowth
            imageClassName="happy-sidebar__image-mark"
            imageMark={clayIconMark(props.slug)}
            size={20}
        />
    );
}

const story = (
    id: string,
    label: string,
    slug: ClayIconSlug,
    extra: Partial<SidebarItem> & { story?: SidebarItem["story"] },
) =>
    ({
        id,
        imageMark: clayIconMark(slug),
        kind: "project",
        label,
        ...extra,
        story: { ...extra.story },
    }) satisfies SidebarItem;
const heading = (id: string, label: string) =>
    ({ collapsed: false, id, kind: "section", label }) satisfies SidebarItem;

/*
 * The design's day: a fixed head, then sections Focus named for today and
 * filled from most to least important. Nothing here is a layout the client
 * decides; the sections and their order are what the agent and the person
 * agreed, and the person drags anything anywhere.
 */
const DAY: readonly SidebarItem[] = [
    { icon: "search", id: "search", kind: "action", label: "Search" },
    { icon: "compose", id: "create", kind: "action", label: "New" },
    {
        id: "happy",
        imageMark: happyIconMark(),
        kind: "project",
        label: "Happy",
        story: { subtitle: "Two things running" },
    },
    story("focus", "Focus Agent", "triage", {
        story: {
            subtitle: "Good morning. What matters today?",
            ring: { total: 1, unseen: 1 },
            signal: "waiting",
        },
        unread: true,
    }),
    heading("priority", "Priority"),
    story("inline-diffs", "Inline sidebar diffs", "new-feature", {
        story: {
            subtitle: "Shipped — Focus's ideas now show right in the sidebar",
            ring: { total: 3, unseen: 3 },
        },
    }),
    story("stories", "Stories", "design", {
        story: {
            subtitle: "Testing with a few friends",
            ring: { total: 4, unseen: 2 },
            signal: "working",
        },
    }),
    heading("tell-people", "Tell people"),
    story("ios", "iOS Stem Cells", "app-store-release", {
        story: {
            subtitle: "Ready for a new test build. Send it?",
            ring: { total: 1, unseen: 1 },
            signal: "waiting",
        },
    }),
    story("x-post", "X post", "marketing", {
        story: { subtitle: "Draft is ready to read", ring: { total: 2, unseen: 0 } },
    }),
    heading("chores", "Chores"),
    story("phone", "Phone connection", "debugging", {
        story: { subtitle: "Making reconnects survive restarts", signal: "working" },
    }),
    heading("side-quests", "Side quests"),
    story("bench", "Agent benchmark", "performance", { story: { subtitle: "Paused" } }),
    story("quiet", "A row whose agent set no status", "wip", { story: {} }),
];

function moved(rows: readonly SidebarItem[], move: SidebarReorder): SidebarItem[] {
    const breaks = (item: SidebarItem) => item.kind === "section" || item.kind === "separator";
    const from = rows.findIndex((item) => item.id === move.id);
    let end = from + 1;
    if (rows[from]!.kind === "section") while (end < rows.length && !breaks(rows[end]!)) end += 1;
    const carried = rows.slice(from, end);
    const rest = [...rows.slice(0, from), ...rows.slice(end)];
    let at = 0;
    if (move.afterId !== null) {
        const after = rest.findIndex((item) => item.id === move.afterId);
        at = after + 1;
        if (rows[from]!.kind === "section" && rest[after]!.kind === "section")
            while (at < rest.length && !breaks(rest[at]!)) at += 1;
    }
    return [...rest.slice(0, at), ...carried, ...rest.slice(at)];
}

/** The day's sidebar, live: drag rows between sections, press a ring or a name. */
function DaySidebar() {
    const [rows, setRows] = useState<readonly SidebarItem[]>(DAY);
    const [opened, setOpened] = useState("Press a ring or a row");
    return (
        <div data-screen="02-rows" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <DimensionRule label="width 300 · rows 52" />
            <div
                style={{
                    background: "var(--groupped-background)",
                    display: "flex",
                    flexDirection: "column",
                    height: "760px",
                    width: "300px",
                }}
            >
                <Sidebar
                    activeItemId="inline-diffs"
                    foldControlPlacement="trailing"
                    foldControlReveal="hover"
                    footer={<SidebarFooter onSettingsOpen={noop} />}
                    onItemCollapseToggle={noop}
                    onItemReorder={(_, move) => setRows((current) => moved(current, move))}
                    onItemSelect={(id) => setOpened(`Opened the chat of ${id}`)}
                    onItemStoryOpen={(id) => setOpened(`Opened the stories of ${id}`)}
                    sections={[{ id: "spaces", items: [...rows] }]}
                    style={{ width: "100%" }}
                />
            </div>
            <span data-testid="story-ring-opened" style={{ color: "var(--text-secondary)" }}>
                {opened}
            </span>
        </div>
    );
}

export function StoryRingPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A row's mark grown to 28px inside a 40px story ring: one segment per story, seen ones first in thin grey and unseen ones last in the stories gradient, 3px apart. No stories, no ring, and the box keeps its size. The ring never spins. In the sidebar a story row is two lines — the name and the status its agent set — with one signal in the bottom-right corner: a dot while it waits on you, a quiet bar while it works."
            title="Story ring"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="Box 40 · mark 28 · ring radius 18.5 · unseen 2px, seen 1.25px, gap 3px"
                    label="Segments"
                    number="RG-01"
                    stage="chrome"
                >
                    <div
                        data-screen="01-ring"
                        style={{ alignItems: "center", display: "flex", gap: "16px" }}
                    >
                        <StoryRing>
                            <Clay slug="wip" />
                        </StoryRing>
                        <StoryRing segments={{ total: 1, unseen: 1 }}>
                            <Clay slug="new-feature" />
                        </StoryRing>
                        <StoryRing segments={{ total: 1, unseen: 0 }}>
                            <Clay slug="new-feature" />
                        </StoryRing>
                        <StoryRing segments={{ total: 3, unseen: 3 }}>
                            <Clay slug="deploy" />
                        </StoryRing>
                        <StoryRing segments={{ total: 4, unseen: 2 }}>
                            <Clay slug="design" />
                        </StoryRing>
                        <StoryRing segments={{ total: 2, unseen: 0 }}>
                            <Clay slug="marketing" />
                        </StoryRing>
                    </div>
                </Specimen>
                <Specimen
                    detail="Sidebar 300 · fixed head, then the sections Focus named · drag works as ever"
                    label="Story rows"
                    number="RG-02"
                    stage="app"
                >
                    <DaySidebar />
                </Specimen>
            </div>
        </ComponentPage>
    );
}
