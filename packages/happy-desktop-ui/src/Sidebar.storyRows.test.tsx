import "./styles.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Sidebar, type SidebarItem, type SidebarItemStory } from "./Sidebar";
import { createRenderer } from "./testing";

const part = (root: ParentNode, name: string) =>
    root.querySelector<HTMLElement>(`[data-happy-desktop-ui="${name}"]`)!;
const row = (root: ParentNode, id: string) =>
    root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
const bounds = (element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    return [box.x, box.y, box.width, box.height];
};
const titlePosition = (element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    return [box.x, box.y, box.height];
};

it("holds the same title, row and sibling boxes as statuses, rings, times and corner signals change", async () => {
    let update: (story: SidebarItemStory) => void = () => {};
    function Fixture() {
        const [story, setStory] = useState<SidebarItemStory>({});
        update = setStory;
        return (
            <Sidebar
                activeItemId=""
                onItemSelect={() => {}}
                style={{ width: 280 }}
                sections={[
                    {
                        id: "work",
                        items: [
                            { id: "parent", kind: "agent", label: "Sidebar polish", story },
                            {
                                id: "child",
                                kind: "agent",
                                label: "Nested session",
                                depth: 1,
                                story,
                            },
                            { id: "next", kind: "agent", label: "Next task", story: {} },
                        ],
                    },
                ]}
            />
        );
    }
    const view = createRenderer().render(() => <Fixture />, { width: 304, height: 260 });
    await view.ready();
    const root = view.$('[data-happy-desktop-ui="sidebar"]').element;
    const parent = row(root, "parent");
    const child = row(root, "child");
    const next = row(root, "next");
    const labels = [parent, child].map((element) => part(element, "sidebar-item-label"));
    const initial = [...[parent, child, next].map(bounds), ...labels.map(titlePosition)];
    expect(parent.getBoundingClientRect().height).toBe(60);
    expect(child.getBoundingClientRect().height).toBe(28);
    for (const story of [
        { subtitle: "On main", time: "9/3" },
        {
            subtitle:
                "A long status that must ellipsize rather than wrapping into a third line or making the title move",
            time: "Wed",
            signal: "working",
            ring: { total: 3, unseen: 2 },
        },
        { subtitle: "Ready for your review", time: "14:05", signal: "unread" },
        {},
    ] satisfies SidebarItemStory[]) {
        flushSync(() => update(story));
        expect(row(root, "parent")).toBe(parent);
        expect(row(root, "child")).toBe(child);
        expect([...[parent, child, next].map(bounds), ...labels.map(titlePosition)]).toEqual(
            initial,
        );
        const subtitle = part(parent, "sidebar-item-subtitle");
        expect(subtitle.getBoundingClientRect().height).toBe(18);
        expect(getComputedStyle(subtitle).whiteSpace).toBe("nowrap");
        expect(getComputedStyle(subtitle).textOverflow).toBe("ellipsis");
        // A nested row is one compact line: no status, no time.
        expect(part(child, "sidebar-item-subtitle")).toBeNull();
        expect(part(child, "sidebar-item-time")).toBeNull();
        for (const element of [parent, child]) {
            expect(element.querySelector(".happy-shimmer-text")).toBeNull();
            const signal = part(element, "sidebar-item-corner");
            if (story.signal === "working") {
                expect(part(signal, "spinner").dataset.variant).toBe("braille-2");
                expect(part(signal, "spinner-braille-canvas")).toBeTruthy();
            } else if (story.signal === "unread") {
                expect(signal.dataset.signal).toBe("unread");
                // The dot is 10px beside a status, 8px on a nested line, centred
                // in the same 18px slot.
                expect(getComputedStyle(signal, "::before").width).toBe(
                    element === parent ? "10px" : "8px",
                );
                expect(signal.getBoundingClientRect().width).toBe(18);
                expect(signal.querySelector(".happy-spinner")).toBeNull();
            } else expect(signal).toBeNull();
        }
    }
});

it("aligns each nested mark with its parent's text without connectors, and parts top-level rows with a hairline from the text to the edge", async () => {
    const items: SidebarItem[] = [
        { id: "parent", kind: "agent", label: "Happy", story: {}, collapsed: false },
        {
            id: "child",
            kind: "agent",
            label: "Prioritizing",
            depth: 1,
            story: {},
            collapsed: false,
        },
        { id: "grandchild", kind: "agent", label: "Review", depth: 2, story: {} },
        { id: "sibling", kind: "agent", label: "GitHub CLI login", depth: 1, story: {} },
        { id: "next", kind: "agent", label: "Next task", story: {} },
        { id: "last", kind: "agent", label: "Last task", story: {} },
    ];
    const view = createRenderer().render(
        () => (
            <Sidebar
                activeItemId=""
                style={{ width: 300 }}
                onItemSelect={() => {}}
                onItemCollapseToggle={() => {}}
                itemFoldControls={false}
                foldControlPlacement="trailing"
                sections={[{ id: "work", items }]}
            />
        ),
        { width: 324, height: 360 },
    );
    await view.ready();
    const root = view.$('[data-happy-desktop-ui="sidebar"]').element;
    for (const [parentId, childId] of [
        ["parent", "child"],
        ["child", "grandchild"],
        ["parent", "sibling"],
    ]) {
        const parentLabel = part(
            row(root, parentId!),
            "sidebar-item-label",
        ).getBoundingClientRect();
        const mark = part(row(root, childId!), "sidebar-item-leading").getBoundingClientRect();
        expect(mark.left).toBe(parentLabel.left);
        expect(mark.width).toBe(20);
    }
    for (const [index, item] of items.entries()) {
        const element = row(root, item.id);
        expect(element.querySelector(".happy-sidebar__item-branch")).toBeNull();
        // Rows stand 2px apart; the last child of an open tree keeps 6px more
        // clear of the hairline over the next top-level row.
        if (index > 0)
            expect(
                element.getBoundingClientRect().top -
                    row(root, items[index - 1]!.id).getBoundingClientRect().bottom,
            ).toBe(item.id === "next" ? 8 : 2);
    }
    for (const connector of root.querySelectorAll<HTMLElement>(".happy-sidebar__tree-connector"))
        expect(getComputedStyle(connector).visibility).toBe("hidden");
    // Without fold controls, the rows that hold others show no chevron.
    expect(root.querySelector('[data-happy-desktop-ui="sidebar-item-fold"]')).toBeNull();
    // A hairline stands over every top-level row but the first, after an open
    // tree too, from the text column to the sidebar's right edge; nested rows
    // are never parted.
    const hairline = (id: string) =>
        getComputedStyle(part(row(root, id), "sidebar-item-body"), "::before");
    for (const id of ["parent", "child", "grandchild", "sibling"])
        expect(hairline(id).content).toBe("none");
    for (const id of ["next", "last"]) expect(hairline(id).content).not.toBe("none");
    // An open tree keeps the children's 10px rhythm under its status.
    expect(row(root, "parent").getBoundingClientRect().height).toBe(54);
    const body = part(row(root, "last"), "sidebar-item-body").getBoundingClientRect();
    const label = part(row(root, "last"), "sidebar-item-label").getBoundingClientRect();
    expect(label.left - row(root, "last").getBoundingClientRect().left).toBe(64);
    expect(body.left + parseFloat(hairline("last").left)).toBe(label.left);
    expect(body.left + parseFloat(hairline("last").width)).toBe(root.getBoundingClientRect().right);
    // Rows that hold others say whether they are open, though they draw no fold.
    expect(row(root, "parent").getAttribute("aria-expanded")).toBe("true");
    expect(row(root, "child").getAttribute("aria-expanded")).toBe("true");
    expect(row(root, "grandchild").hasAttribute("aria-expanded")).toBe(false);
});

it("shows only folded arrows at rest and both controls on hover, without shifting either heading form", async () => {
    const view = createRenderer().render(
        () => (
            <Sidebar
                activeItemId=""
                onItemSelect={() => {}}
                onItemAction={() => {}}
                onItemCollapseToggle={() => {}}
                onSectionAction={() => {}}
                onSectionCollapseToggle={() => {}}
                foldControlPlacement="trailing"
                foldControlReveal="hover"
                style={{ width: 280 }}
                sections={[
                    {
                        id: "work",
                        label: "Work",
                        collapsed: false,
                        action: { icon: "plus", label: "New work", reveal: "always" },
                        items: [
                            {
                                id: "open",
                                kind: "section",
                                label: "Desktop",
                                collapsed: false,
                                action: {
                                    icon: "plus",
                                    label: "New desktop work",
                                },
                            },
                            { id: "task", kind: "agent", label: "Sidebar polish", story: {} },
                            {
                                id: "folded",
                                kind: "section",
                                label: "Older",
                                collapsed: true,
                                action: { icon: "plus", label: "New older work" },
                            },
                        ],
                    },
                    {
                        id: "archive",
                        label: "Archive",
                        collapsed: true,
                        action: { icon: "plus", label: "New archived work" },
                        items: [],
                    },
                ]}
            />
        ),
        { width: 304, height: 350 },
    );
    await view.ready();
    const root = view.$('[data-happy-desktop-ui="sidebar"]').element;
    const heads = [
        ...root.querySelectorAll<HTMLElement>(".happy-sidebar__section-head"),
        row(root, "open"),
        row(root, "folded"),
    ];
    for (const head of heads) {
        await userEvent.unhover(head);
        const inline = head.classList.contains("happy-sidebar__section-item");
        const fold = part(head, inline ? "sidebar-section-item-fold" : "sidebar-section-fold");
        const action = part(
            head,
            inline ? "sidebar-section-item-action" : "sidebar-section-action",
        );
        const label = part(head, inline ? "sidebar-section-item-label" : "sidebar-section-label");
        const before = [bounds(head), bounds(label), bounds(fold), bounds(action)];
        expect(getComputedStyle(fold).opacity).toBe(
            head.hasAttribute("data-collapsed") ? "1" : "0",
        );
        expect(getComputedStyle(action).opacity).toBe("0");
        await userEvent.hover(head);
        expect(getComputedStyle(fold).opacity).toBe("1");
        expect(getComputedStyle(action).opacity).toBe("1");
        expect([bounds(head), bounds(label), bounds(fold), bounds(action)]).toEqual(before);
        await userEvent.unhover(head);
    }
});
