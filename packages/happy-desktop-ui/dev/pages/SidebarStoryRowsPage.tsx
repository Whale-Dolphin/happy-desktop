import { Sidebar, type SidebarItem } from "../../src/Sidebar";
import { happyIconMark } from "../../src/clayIcons";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-009b";

const states: SidebarItem[] = [
    { id: "empty", kind: "agent", label: "New work", icon: "chat", story: {} },
    {
        id: "working",
        kind: "agent",
        label: "Sidebar polish",
        icon: "chat",
        story: {
            subtitle: "Checking the layout at every width",
            time: "14:05",
            signal: "working",
            ring: { total: 3, unseen: 2 },
        },
    },
    {
        id: "waiting",
        kind: "agent",
        label: "Windows signing",
        icon: "chat",
        unread: true,
        story: {
            subtitle: "Ready for your review",
            time: "Yesterday",
            signal: "waiting",
            ring: { total: 2, unseen: 0 },
        },
    },
    {
        id: "long",
        kind: "agent",
        label: "A long title that still leaves room for an old date",
        icon: "chat",
        story: {
            subtitle:
                "Shipped to preview with a very long status that should end in an ellipsis on the same line",
            time: "Oct 12",
        },
    },
    {
        id: "shipped",
        kind: "agent",
        label: "Composer cleanup",
        icon: "chat",
        story: { subtitle: "On main", time: "Sep 3" },
    },
];

const nested: SidebarItem[] = [
    {
        id: "happy",
        kind: "agent",
        label: "Happy",
        imageMark: happyIconMark(),
        collapsed: false,
        story: { subtitle: "Keeping your work organized", time: "14:05" },
    },
    {
        id: "prioritizing",
        kind: "agent",
        label: "Prioritizing",
        icon: "chat",
        depth: 1,
        story: { subtitle: "Arranging the sidebar", signal: "working", time: "14:04" },
    },
    {
        id: "login",
        kind: "agent",
        label: "GitHub CLI login",
        icon: "chat",
        depth: 1,
        story: { time: "14:01" },
    },
    {
        id: "release",
        kind: "agent",
        label: "Desktop release",
        icon: "chat",
        collapsed: false,
        story: { subtitle: "Shipped to preview", time: "Tue" },
    },
    {
        id: "review",
        kind: "agent",
        label: "Review",
        icon: "chat",
        collapsed: false,
        depth: 1,
        story: { subtitle: "Checking the release notes", time: "Mon" },
    },
    {
        id: "detail",
        kind: "agent",
        label: "Verify signing",
        icon: "chat",
        depth: 2,
        story: { subtitle: "Signature verified", time: "Mon" },
    },
    { id: "next", kind: "agent", label: "Next project", icon: "chat", story: { time: "Fri" } },
];

const headers: SidebarItem[] = [
    {
        id: "desktop",
        kind: "section",
        label: "Desktop",
        collapsed: false,
        action: { icon: "plus", label: "New work in Desktop" },
    },
    {
        id: "chat",
        kind: "agent",
        label: "Sidebar polish",
        icon: "chat",
        story: { subtitle: "On main", time: "Tue" },
    },
    {
        id: "finished",
        kind: "section",
        label: "Finished",
        collapsed: true,
        action: { icon: "plus", label: "New work in Finished" },
    },
    { id: "hidden", kind: "agent", label: "Hidden work", story: {} },
];

export function SidebarStoryRowsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Sidebar story rows"
            summary="Fixed title and status lanes, recent and old timestamps, nested sessions, and section controls."
        >
            {[
                { width: 1100, height: 760 },
                { width: 720, height: 640 },
            ].flatMap((window) =>
                ["states", "nested", "headers"].map((scene) => (
                    <FullScreenSpecimen
                        key={`${window.width}-${scene}`}
                        number={scene === "states" ? "01" : "02"}
                        label={scene}
                        detail="Light and dark · actual sidebar components"
                        screen={`${scene}-${window.width}x${window.height}`}
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
                                                items:
                                                    scene === "states"
                                                        ? states
                                                        : scene === "nested"
                                                          ? nested
                                                          : headers,
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
