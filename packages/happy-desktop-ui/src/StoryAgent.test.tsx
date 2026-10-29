import "./styles.css";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Sidebar, type SidebarItem } from "./Sidebar";
import type { StoryArtifactTarget } from "./StoryCanvas";
import { StoryViewer } from "./StoryViewer";
import type { Story, StoryFrame } from "./storyTypes";
import { createRenderer } from "./testing";

/*
 * Agent stories, as the person meets them: a conversation's row wears its
 * agent's ring and one corner signal, the ring opens the stories and the text
 * the chat; in the viewer an agent's story takes feedback for the agent,
 * pauses with Space and while the field is in use, scrubs with Shift-scroll
 * and steps past either end, draws an artifact frame as a live page, and
 * offers a repost.
 */

const at = (x: number, y: number, scale: number) => ({ x, y, scale, rotation: 0 });

function frame(id: string, kind: "image" | "artifact"): StoryFrame {
    return {
        id,
        kind,
        width: kind === "image" ? 1080 : null,
        height: kind === "image" ? 1920 : null,
        thumbhash: null,
        durationMs: null,
        asset:
            kind === "image"
                ? { type: "artifact_file", artifactId: "story", version: 1, path: `${id}.png` }
                : { type: "artifact", artifactId: "board" },
        available: true,
        placement: at(0.5, 0.5, 1),
        background: ["#223344", "#112233"],
        overlays: [],
    };
}

const AGENT_STORY: Story = {
    id: "agent-story",
    status: "posted",
    authorUserId: "owner",
    createdBy: { kind: "agent", agentId: "agent-1" },
    author: { kind: "agent", agentId: "agent-1" },
    ringAgentId: "agent-1",
    source: null,
    caption: null,
    frames: [frame("f-photo", "image"), frame("f-page", "artifact")],
    audience: "team",
    artifactVersion: 1,
    createdAt: 0,
    updatedAt: 0,
    postedAt: Date.now() - 60_000,
    expiresAt: null,
    seen: false,
    viewCount: null,
    myReaction: null,
    reactions: [],
    version: "1",
};

// A transparent pixel stands in for the photo, so nothing waits on the network.
const PIXEL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

it("draws a conversation's row with its ring and one corner signal; the ring opens stories, the text the chat", async () => {
    const acts: string[] = [];
    const items: SidebarItem[] = [
        {
            id: "waiting",
            kind: "project",
            icon: "doc",
            label: "Release",
            status: "awaitingInput",
            unread: true,
            story: {
                subtitle: "Ready for a test build. Send it?",
                ring: { total: 2, unseen: 1 },
                signal: "waiting",
            },
        },
        {
            id: "working",
            kind: "project",
            icon: "doc",
            label: "Benchmarks",
            status: "working",
            story: { subtitle: "Running the third pass", signal: "working" },
        },
    ];
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId=""
                data-testid="story-rows"
                onItemSelect={(id) => acts.push(`open:${id}`)}
                onItemStoryOpen={(id) => acts.push(`stories:${id}`)}
                sections={[{ id: "spaces", items }]}
                style={{ width: 300, height: 240 }}
            />
        ),
        { width: 320, height: 260 },
    );
    await view.ready();
    const root = view.$('[data-testid="story-rows"]').element;
    const row = (id: string) =>
        root.querySelector<HTMLElement>(
            `[data-happy-desktop-ui="sidebar-item"][data-item-id="${id}"]`,
        )!;

    // Two lines: the title, then the agent's status.
    expect(row("waiting").getBoundingClientRect().height).toBe(52);
    expect(row("waiting").textContent).toContain("Ready for a test build. Send it?");

    // One corner signal per row, never a second dot.
    const corners = (id: string) =>
        [
            ...row(id).querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="sidebar-item-corner"]',
            ),
        ].map((corner) => corner.dataset.signal);
    expect(corners("waiting")).toEqual(["waiting"]);
    expect(corners("working")).toEqual(["working"]);
    expect(
        row("waiting").querySelector('[data-happy-desktop-ui="sidebar-item-unread"]'),
    ).toBeNull();

    // A row with stories opens them from its ring; one without has no ring to press.
    const ring = row("waiting").querySelector<HTMLElement>('[data-happy-desktop-ui="story-ring"]')!;
    expect(ring.dataset.opens).toBe("");
    expect(ring.dataset.unseen).toBe("");
    expect(
        row("working").querySelector('[data-happy-desktop-ui="story-ring"][data-opens]'),
    ).toBeNull();

    await userEvent.click(ring);
    expect(acts).toEqual(["stories:waiting"]);
    await userEvent.click(
        row("waiting").querySelector<HTMLElement>(".happy-sidebar__item-subtitle")!,
    );
    expect(acts).toEqual(["stories:waiting", "open:waiting"]);
});

it("takes feedback for the agent, pauses, scrubs, shows a live page, and offers a repost", async () => {
    const feedback: { storyId: string; frameId: string; text: string }[] = [];
    const reposted: string[] = [];
    const pages: StoryArtifactTarget[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <StoryViewer
                artifactRender={(target) => {
                    pages.push(target);
                    return {
                        type: "page",
                        page: <div data-testid="live-page">Release board</div>,
                    };
                }}
                authors={[
                    {
                        id: "agent:agent-1",
                        name: "Release",
                        initials: "RE",
                        self: false,
                        stories: [AGENT_STORY],
                    },
                ]}
                frameUrl={() => PIXEL}
                onClose={() => {}}
                onFeedback={(story, frameId, text) => {
                    feedback.push({ storyId: story.id, frameId, text });
                    return Promise.resolve();
                }}
                onLinkOpen={() => {}}
                onReact={() => {}}
                onRepost={(story) => reposted.push(story.id)}
                onSeen={() => {}}
                postedLabel={() => "1m ago"}
                startAuthorId="agent:agent-1"
                sticker={() => undefined}
            />
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();
    const room = document.querySelector<HTMLElement>('[data-happy-desktop-ui="story-viewer"]')!;
    const playing = () =>
        document.querySelector<HTMLElement>(
            '.happy-story-viewer__segment-fill[data-state="playing"]',
        )!;
    const playState = () => playing().style.animationPlayState;
    const shownFrame = () =>
        [...document.querySelectorAll(".happy-story-viewer__segment-fill")].findIndex(
            (fill) => fill.getAttribute("data-state") === "playing",
        );
    expect(shownFrame()).toBe(0);
    expect(playState()).toBe("running");

    // Space pauses and resumes.
    room.focus();
    await userEvent.keyboard(" ");
    expect(playState()).toBe("paused");
    await userEvent.keyboard(" ");
    expect(playState()).toBe("running");

    // Writing to the agent holds the story; Enter sends it, quoting the frame.
    const input = view.$('[data-testid="story-viewer-feedback-input"]').element as HTMLInputElement;
    await userEvent.click(input);
    expect(playState()).toBe("paused");
    await userEvent.keyboard("Make the chart bigger");
    // The field keeps its keys: Space typed there never resumed the story.
    expect(playState()).toBe("paused");
    await userEvent.keyboard("{Enter}");
    await expect
        .poll(() => feedback)
        .toEqual([{ storyId: "agent-story", frameId: "f-photo", text: "Make the chart bigger" }]);
    await expect.poll(() => input.placeholder).toBe("Sent");
    expect(input.value).toBe("");
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).not.toBe(input);
    expect(playState()).toBe("running");

    // Shift-scrolling moves through the frame, and on past its end to the next.
    const stage = document.querySelector<HTMLElement>(".happy-story-viewer__stage")!;
    // Each turn lands before the next, as a wheel's do.
    const wheel = async (deltaX: number) => {
        stage.dispatchEvent(
            new WheelEvent("wheel", { deltaX, shiftKey: true, bubbles: true, cancelable: true }),
        );
        await new Promise((resolve) => requestAnimationFrame(resolve));
    };
    /** Turns the wheel until the story leaves the frame on screen. */
    const wheelPast = async (deltaX: number) => {
        const from = shownFrame();
        for (let turn = 0; turn < 12 && shownFrame() === from; turn += 1) await wheel(deltaX);
    };
    await wheel(100);
    const scrubbed = Number(playing().getAnimations()[0]?.currentTime ?? 0);
    expect(scrubbed).toBeGreaterThanOrEqual(1100);
    await wheelPast(200);
    expect(shownFrame()).toBe(1);

    // The artifact frame is its live page.
    await expect.poll(() => document.querySelector('[data-testid="live-page"]')).not.toBeNull();
    expect(pages.at(-1)).toEqual({ artifactId: "board" });

    // Scrolling back past the start returns to the photo.
    await wheelPast(-200);
    expect(shownFrame()).toBe(0);

    await userEvent.click(view.$('[data-testid="story-viewer-repost"]').element);
    expect(reposted).toEqual(["agent-story"]);
});
