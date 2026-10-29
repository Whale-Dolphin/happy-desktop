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
        story: { subtitle: "Two things running", time: "09:12" },
    },
    story("focus", "Focus Agent", "triage", {
        story: {
            subtitle:
                "Good morning. Three things need you today; the release can't wait past noon.",
            time: "08:30",
            ring: { total: 1, unseen: 1 },
            signal: "waiting",
        },
        unread: true,
    }),
    heading("priority", "Priority"),
    story("inline-diffs", "Inline sidebar diffs", "new-feature", {
        story: {
            subtitle: "Shipped — Focus's ideas now show right in the sidebar",
            time: "Tue",
            ring: { total: 3, unseen: 3 },
        },
    }),
    story("stories", "Stories", "design", {
        story: {
            subtitle: "Testing with a few friends",
            time: "11:04",
            ring: { total: 4, unseen: 2 },
            signal: "working",
        },
    }),
    heading("tell-people", "Tell people"),
    story("ios", "iOS Stem Cells", "app-store-release", {
        story: {
            subtitle: "Ready for a new test build. Send it?",
            time: "10:47",
            ring: { total: 1, unseen: 1 },
            signal: "waiting",
        },
    }),
    story("x-post", "X post", "marketing", {
        story: {
            subtitle: "Draft is ready to read",
            time: "Mon",
            ring: { total: 2, unseen: 0 },
        },
        // Unread, not waiting: a heavier name and no dot.
        unread: true,
    }),
    story("launch-list", "Launch checklist", "kanban", { story: {} }),
    heading("chores", "Chores"),
    story("phone", "Phone connection", "debugging", {
        story: {
            subtitle: "Making reconnects survive restarts",
            time: "11:20",
            signal: "working",
        },
    }),
    heading("side-quests", "Side quests"),
    story("bench", "Agent benchmark", "performance", {
        story: { subtitle: "Paused", time: "12.10" },
    }),
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
            <DimensionRule label="width 300 · rows 64" />
            <div
                style={{
                    background: "var(--groupped-background)",
                    display: "flex",
                    flexDirection: "column",
                    height: "900px",
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

const STATUS_LINES = {
    none: undefined,
    one: "Running the third pass",
    two: "Ready for a test build once the last two crash reports are triaged and the changelog is short enough to read in one go",
} as const;
const SIGNALS = { idle: undefined, working: "working", waiting: "waiting" } as const;

/*
 * Every combination a row can be in, one under another: no status, one line
 * and more than two, each idle, working and waiting, and a Surface with no
 * agent at all. They are all one height and their names all stand on one line.
 */
const STATES: readonly SidebarItem[] = (
    Object.entries(STATUS_LINES) as [keyof typeof STATUS_LINES, string | undefined][]
).flatMap(([lines, subtitle]) =>
    (Object.entries(SIGNALS) as [keyof typeof SIGNALS, "working" | "waiting" | undefined][]).map(
        ([signal, value]) =>
            story(`${lines}-${signal}`, `Status ${lines} · ${signal}`, "wip", {
                story: {
                    ...(subtitle === undefined ? {} : { subtitle, time: "14:05" }),
                    ...(value === undefined ? {} : { signal: value }),
                    ...(lines === "one" ? { ring: { total: 2, unseen: 1 } } : {}),
                },
            }),
    ),
);

function StatesSidebar() {
    return (
        <div
            data-screen="03-states"
            style={{
                background: "var(--groupped-background)",
                display: "flex",
                flexDirection: "column",
                height: "720px",
                width: "300px",
            }}
        >
            <Sidebar
                activeItemId=""
                foldControlPlacement="trailing"
                onItemSelect={noop}
                onItemStoryOpen={noop}
                sections={[
                    {
                        id: "states",
                        items: [
                            ...STATES,
                            story("surface", "A Surface, no agent", "notes", { story: {} }),
                        ],
                    },
                ]}
                style={{ width: "100%" }}
            />
        </div>
    );
}

export function StoryRingPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A row's mark grown to 38px inside a 48px story ring: one segment per story, seen ones first in thin grey and unseen ones last in the stories gradient, 3px apart. No stories, no ring, and the box keeps its size. The ring never spins. In the sidebar a story row is a messenger's chat row, 64px whatever it says: the name in bold on a first line with the time the status was set at its end, the status under it in up to two muted lines, then an ellipsis, and one signal in the bottom-right corner — a dot while it waits on you, a quiet bar while it works. A hairline from the text column parts two story rows."
            title="Story ring"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="Box 48 · mark 38 · ring radius 22.75 · unseen 2px, seen 1.5px, gap 3px"
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
                <Specimen
                    detail="Status none, one line, past two lines × idle, working, waiting · and a Surface · all 64"
                    label="Every state, one height"
                    number="RG-03"
                    stage="app"
                >
                    <StatesSidebar />
                </Specimen>
            </div>
        </ComponentPage>
    );
}
