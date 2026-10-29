import { Sidebar, type SidebarItem } from "../../src/Sidebar";
import { clayIconMark, happyIconMark, type ClayIconSlug } from "../../src/clayIcons";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-009b";

/** A project's picture, as the daemon hands one over: a square image. */
const projectPicture = (from: string, to: string, letter: string) =>
    `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="40" height="40" fill="url(#g)"/><text x="20" y="27" font-family="-apple-system,Helvetica,Arial" font-size="20" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`,
    )}`;
const DESKTOP = projectPicture("#6d5dfc", "#b26cf6", "D");
const AGENT = projectPicture("#0f9d7a", "#4cc38a", "A");

const top = (
    id: string,
    label: string,
    slug: ClayIconSlug,
    story: SidebarItem["story"],
    extra: Partial<SidebarItem> = {},
): SidebarItem => ({
    id,
    kind: "project",
    label,
    imageMark: clayIconMark(slug),
    ...extra,
    story,
});

/** A row nested under another, as the window draws it: one compact line. */
const nested = (
    id: string,
    label: string,
    depth: number,
    extra: Partial<SidebarItem> = {},
): SidebarItem => ({
    id,
    kind: "agent",
    label,
    depth,
    icon: "agents",
    story: {},
    ...extra,
});

const list: SidebarItem[] = [
    {
        id: "happy",
        kind: "project",
        label: "Happy",
        imageMark: happyIconMark(),
        story: { subtitle: "Keeping your work organized", time: "now" },
    },
    top("polish", "Sidebar polish", "wip", {
        subtitle: "Checking the rows at every window width",
        time: "now",
        signal: "working",
        ring: { total: 3, unseen: 2 },
    }),
    top("signing", "Windows signing", "pull-request", {
        subtitle: "Ready for your review: the installer is signed and notarized",
        time: "5m",
        signal: "unread",
        ring: { total: 2, unseen: 0 },
    }),
    top("release", "Desktop release 0.42", "project-kickoff", {
        subtitle: "Shipped to preview; production waits on the crash report triage",
        time: "2h",
    }),
    top("cleanup", "Composer cleanup", "cleanup", {
        subtitle: "On main",
        time: "Tue",
        signal: "unread",
    }),
    top("review", "Code review queue", "code-review", { subtitle: "Two left", time: "10/12" }),
];

const tree: SidebarItem[] = [
    top(
        "release",
        "Desktop release 0.42",
        "project-kickoff",
        {
            subtitle: "Coordinating the signing and the release notes",
            time: "2m",
            signal: "working",
        },
        { collapsed: false },
    ),
    nested("signing", "Windows signing", 1, {
        imageUrl: DESKTOP,
        collapsed: false,
        changeStats: { added: 120, deleted: 8 },
        story: { signal: "working" },
    }),
    nested("verify", "Verify the signature", 2, {
        imageUrl: DESKTOP,
        changeStats: { added: 14, deleted: 3 },
        story: { signal: "unread" },
    }),
    nested("notary", "Notary log reader", 2, { status: "ready" }),
    nested("notes", "Release notes", 1, {
        imageUrl: AGENT,
        changeStats: { added: 42, deleted: 0 },
        story: { signal: "unread" },
    }),
    nested("check", "Crash report triage", 1, {}),
    top("polish", "Sidebar polish", "wip", {
        subtitle: "Waiting on review",
        time: "1h",
    }),
    top("cleanup", "Composer cleanup", "cleanup", { subtitle: "On main", time: "Mon" }),
];

const headers: SidebarItem[] = [
    {
        id: "desktop",
        kind: "section",
        label: "Desktop",
        collapsed: false,
        action: { icon: "plus", label: "New work in Desktop" },
    },
    top("polish", "Sidebar polish", "wip", { subtitle: "On main", time: "Tue" }),
    top("signing", "Windows signing", "pull-request", {
        subtitle: "Ready for your review",
        time: "Mon",
        signal: "unread",
    }),
    {
        id: "finished",
        kind: "section",
        label: "Finished",
        collapsed: true,
        action: { icon: "plus", label: "New work in Finished" },
    },
    top("hidden", "Hidden work", "wip", {}),
];

const scenes = { list, tree, headers } as const;

export function SidebarStoryRowsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Sidebar story rows"
            summary="Two-line chat rows with relative times, one corner signal and Telegram separators; compact nested rows with deltas; section headings."
        >
            {[
                { width: 1100, height: 760 },
                { width: 720, height: 640 },
            ].flatMap((window) =>
                (Object.keys(scenes) as (keyof typeof scenes)[]).map((scene, index) => (
                    <FullScreenSpecimen
                        key={`${window.width}-${scene}`}
                        number={String(index + 1).padStart(2, "0")}
                        label={scene}
                        detail="Light and dark · actual sidebar components"
                        screen={`${String(index + 1).padStart(2, "0")}-${scene}-${window.width}x${window.height}`}
                        window={window}
                    >
                        <div style={{ display: "flex", height: "100%", gap: 24, padding: 24 }}>
                            {(["light", "dark"] as const).map((mode) => (
                                <ThemeScope key={mode} mode={mode}>
                                    <Sidebar
                                        style={{ width: 300 }}
                                        activeItemId=""
                                        foldControlPlacement="trailing"
                                        foldControlReveal="hover"
                                        itemFoldControls={false}
                                        onItemSelect={() => {}}
                                        onItemAction={() => {}}
                                        onItemCollapseToggle={() => {}}
                                        onSectionAction={() => {}}
                                        onSectionCollapseToggle={() => {}}
                                        sections={[
                                            {
                                                id: "work",
                                                label: "Work",
                                                collapsed: false,
                                                action: { icon: "plus", label: "New work" },
                                                items: scenes[scene],
                                            },
                                            {
                                                id: "older",
                                                label: "Older",
                                                collapsed: true,
                                                action: { icon: "plus", label: "New older work" },
                                                items: [
                                                    {
                                                        id: "old",
                                                        kind: "agent",
                                                        label: "Archived",
                                                        story: {},
                                                    },
                                                ],
                                            },
                                        ]}
                                    />
                                </ThemeScope>
                            ))}
                        </div>
                    </FullScreenSpecimen>
                )),
            )}
        </ComponentPage>
    );
}
