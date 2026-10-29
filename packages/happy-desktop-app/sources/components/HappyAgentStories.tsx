import {
    happyAgentProtocol,
    type HappyAgentArtifactId,
    type HappyAgentInlineArtifactsStore,
    type HappyAgentStickersSnapshot,
    type HappyAgentStickersStore,
    type HappyAgentStories,
    type HappyAgentStoriesSnapshot,
    type HappyAgentStoryEditorSnapshot,
} from "happy-desktop-state";
import {
    Icon,
    StemCellGrowth,
    StoriesRow,
    StoryEditor,
    StoryInlineCard,
    StoryViewer,
    type HtmlPreviewRenderer,
    type InlinePageFit,
    type SidebarItem,
    type StoriesRowAuthor,
    type StoryArtifactRender,
    type StorySticker,
    type StoryViewerAuthor,
} from "happy-desktop-ui";
import { useCallback, useSyncExternalStore } from "react";
import { inlineArtifactsStoreNoop } from "../conversationInlinePages";

type Story = happyAgentProtocol.Story;
type StoryFeedAuthor = happyAgentProtocol.StoryFeedAuthor;
type Sticker = happyAgentProtocol.Sticker;

function initialsOf(name: string): string {
    const words = name.trim().split(/\s+/u).filter(Boolean);
    const letters =
        words.length > 1
            ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
            : (words[0] ?? "?").slice(0, 2);
    return letters.toUpperCase();
}

function firstName(name: string): string {
    return name.trim().split(/\s+/u)[0] ?? name;
}

/** "just now", "5m ago", "3h ago": how long ago a story was posted, as iOS writes it. */
function postedLabel(story: Story): string {
    const at = story.postedAt ?? story.updatedAt;
    const minutes = Math.max(0, Math.floor((Date.now() - at) / 60_000));
    if (story.status === "draft") return "Draft";
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${String(minutes)}m ago`;
    return `${String(Math.floor(minutes / 60))}h ago`;
}

/**
 * The feed's author key: "self" for the person, whose circle stands before the
 * daemon answers and must keep its identity when it does, else their user ID.
 */
function authorKey(author: StoryFeedAuthor): string {
    return author.isSelf ? "self" : (author.userId ?? "self");
}

/**
 * How a sticker overlay or picker cell draws, from the catalog. A pack not
 * read yet is asked for, and the sticker draws once it arrives.
 */
function stickerSourceOf(
    hub: HappyAgentStories,
    store: HappyAgentStickersStore,
    snapshot: HappyAgentStickersSnapshot,
): {
    readonly byId: (packId: string, stickerId: string) => StorySticker | undefined;
    readonly of: (sticker: Sticker) => StorySticker;
} {
    const of = (sticker: Sticker): StorySticker => ({
        format: sticker.format,
        url: hub.urls.sticker(sticker.packId, sticker.id, sticker.format === "tgs"),
        width: sticker.width,
        height: sticker.height,
    });
    return {
        of,
        byId: (packId, stickerId) => {
            const stickers = snapshot.stickers.get(packId);
            if (!stickers) {
                // Records what is wanted; the read starts after this render.
                store.packsRequest([packId]);
                return undefined;
            }
            const sticker = stickers.find((each) => each.id === stickerId);
            return sticker ? of(sticker) : undefined;
        },
    };
}

export interface HappyAgentStoriesRowProps {
    readonly hub: HappyAgentStories;
}

/**
 * The stories row above the sidebar, from the feed, in the daemon's order:
 * everyone with a story up, the person first while theirs is, under their own
 * name, as on iOS. It is drawn once the daemon has answered, folded until the
 * person opens it; a story is made only from a conversation.
 */
export function HappyAgentStoriesRow(props: HappyAgentStoriesRowProps) {
    const store = props.hub.stories();
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    const rowStore = props.hub.row();
    const row = useSyncExternalStore(rowStore.subscribe, rowStore.get, rowStore.get);
    const screen = props.hub.screen();
    const feed = snapshot.feed;
    if (feed.status !== "ready") return null;
    const authors: readonly StoriesRowAuthor[] = feed.authors
        .filter((author) => author.storyIds.length > 0)
        .map((author) => ({
            id: authorKey(author),
            // Your own circle reads as iOS has it.
            name: author.isSelf ? "My Story" : firstName(author.name),
            ...(author.photo ? { photoUrl: props.hub.urls.photo(author.photo) } : {}),
            initials: initialsOf(author.name),
            self: author.isSelf,
            stories: {
                total: author.storyIds.length,
                unseen: author.isSelf ? 0 : author.unseenCount,
            },
            ring: !author.isSelf && author.unseenCount > 0 ? "unseen" : "seen",
        }));
    return (
        <StoriesRow
            authors={authors}
            collapsed={row.collapsed}
            data-testid="stories-row"
            onAuthorOpen={(authorId) => screen.viewerOpen({ kind: "row", authorId })}
            onCollapse={rowStore.rowCollapse}
            onExpand={rowStore.rowExpand}
        />
    );
}

function viewerAuthors(
    hub: HappyAgentStories,
    snapshot: HappyAgentStoriesSnapshot,
): StoryViewerAuthor[] {
    if (snapshot.feed.status !== "ready") return [];
    return snapshot.feed.authors.map((author) => ({
        id: authorKey(author),
        name: author.name,
        ...(author.photo ? { photoUrl: hub.urls.photo(author.photo) } : {}),
        initials: initialsOf(author.name),
        self: author.isSelf,
        stories: author.storyIds.flatMap((storyId) => {
            const entry = snapshot.stories.get(storyId);
            return entry?.type === "ready" && entry.story.status === "posted" ? [entry.story] : [];
        }),
    }));
}

/** The name and picture an agent's stories are watched under: its row's. */
export interface HappyAgentStoryAgent {
    readonly name: string;
    readonly mark?: Pick<SidebarItem, "icon" | "imageMark" | "imageUrl" | "stemCell">;
}

/** An agent's row picture as the viewer's avatar wears it. */
function agentAvatar(
    agent: HappyAgentStoryAgent | undefined,
): Pick<StoryViewerAuthor, "photoUrl" | "mark"> {
    const mark = agent?.mark;
    if (!mark) return {};
    if (mark.imageMark || mark.stemCell)
        return {
            mark: (
                <StemCellGrowth
                    imageClassName="happy-story-viewer__mark"
                    imageMark={mark.imageMark}
                    size={20}
                    stemCell={mark.stemCell}
                />
            ),
        };
    if (mark.imageUrl) return { photoUrl: mark.imageUrl };
    return mark.icon ? { mark: <Icon name={mark.icon} size={18} /> } : {};
}

export interface HappyAgentStoriesScreensProps {
    readonly hub: HappyAgentStories;
    /** Who an agent is, from the window's lists; absent until they know it. */
    readonly agentOf: (agentId: string) => HappyAgentStoryAgent | undefined;
    /** The artifacts live frames and windows show, each at its latest version. */
    readonly artifacts?: HappyAgentInlineArtifactsStore;
    /** The host's isolated page engine; without one a live page shows its background. */
    readonly artifactPage?: HtmlPreviewRenderer;
    onLinkOpen(url: string): void;
    onSourceOpen(agentId: string): void;
}

/** The viewer and the editor, mounted once beside whatever the window shows. */
export function HappyAgentStoriesScreens(props: HappyAgentStoriesScreensProps) {
    const screenStore = props.hub.screen();
    const screen = useSyncExternalStore(screenStore.subscribe, screenStore.get, screenStore.get);
    const editorStore = props.hub.editor();
    const editor = useSyncExternalStore(editorStore.subscribe, editorStore.get, editorStore.get);
    if (screen.viewer) return <HappyAgentStoryViewerScreen {...props} target={screen.viewer} />;
    if (editor.status === "open") return <HappyAgentStoryEditorScreen {...props} editor={editor} />;
    return null;
}

const ignore = (): void => undefined;

/**
 * Live frames and windows as isolated pages: an HTML artifact served as its
 * own site. An artifact being read draws nothing yet; one that is gone, or is
 * not a page this host can serve, says so.
 */
function useStoryArtifactRender(
    props: Pick<HappyAgentStoriesScreensProps, "artifacts" | "artifactPage">,
): StoryArtifactRender | undefined {
    const store = props.artifacts ?? inlineArtifactsStoreNoop;
    const artifacts = useSyncExternalStore(store.subscribe, store.get, store.get);
    const page = props.artifactPage;
    if (!props.artifacts || !page) return undefined;
    return (target) => {
        const artifactId = target.artifactId as HappyAgentArtifactId;
        // Records what is wanted; the read starts after this render.
        store.request([artifactId]);
        const entry = artifacts.get(artifactId);
        if (entry === undefined) return { type: "loading" };
        if (entry.type === "missing" || entry.status === "deleted") return { type: "unavailable" };
        const site = entry.site;
        if (site?.type === "opening") return { type: "loading" };
        if (site?.type !== "opened") return { type: "unavailable" };
        return {
            type: "page",
            page: page({ source: site.url, previewFailed: ignore, previewLoaded: ignore }),
        };
    };
}

/** The repost chip's words, and where it leads when the person may open the session. */
function repostChipOf(
    story: Story,
    open: (agentId: string) => void,
): { readonly label: string; onOpen?(): void } | undefined {
    const from = story.repostOf;
    if (!from) return undefined;
    return {
        label: `Reposted from ${from.title ?? "an agent"}`,
        ...(from.canOpen ? { onOpen: () => open(from.agentId) } : {}),
    };
}

/** Every agent with a story up, each under its own name and picture, newest first. */
function ringAuthors(
    snapshot: HappyAgentStoriesSnapshot,
    agentOf: (agentId: string) => HappyAgentStoryAgent | undefined,
): StoryViewerAuthor[] {
    if (snapshot.feed.status !== "ready") return [];
    return snapshot.feed.rings.map((ring) => {
        const agent = agentOf(ring.agentId);
        const name = agent?.name ?? "Agent";
        return {
            id: `agent:${ring.agentId}`,
            name,
            ...agentAvatar(agent),
            initials: initialsOf(name),
            self: false,
            stories: ring.storyIds.flatMap((storyId) => {
                const entry = snapshot.stories.get(storyId);
                return entry?.type === "ready" && entry.story.status === "posted"
                    ? [entry.story]
                    : [];
            }),
        };
    });
}

function HappyAgentStoryViewerScreen(
    props: HappyAgentStoriesScreensProps & {
        readonly target: NonNullable<
            ReturnType<ReturnType<HappyAgentStories["screen"]>["get"]>["viewer"]
        >;
    },
) {
    const { hub, target } = props;
    const store = hub.stories();
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    const stickersStore = hub.stickers();
    const stickers = useSyncExternalStore(
        stickersStore.subscribe,
        stickersStore.get,
        stickersStore.get,
    );
    const source = stickerSourceOf(hub, stickersStore, stickers);
    const artifactRender = useStoryArtifactRender(props);
    const screen = hub.screen();
    const editor = hub.editor();
    let authors: StoryViewerAuthor[];
    let startAuthorId: string;
    let startStoryId: string | undefined;
    if (target.kind === "row") {
        authors = viewerAuthors(hub, snapshot);
        startAuthorId = target.authorId;
    } else if (target.kind === "ring") {
        authors = ringAuthors(snapshot, props.agentOf);
        startAuthorId = `agent:${target.agentId}`;
    } else {
        const entry = snapshot.stories.get(target.storyId);
        const story = entry?.type === "ready" ? entry.story : undefined;
        const feedAuthor =
            story && snapshot.feed.status === "ready"
                ? snapshot.feed.authors.find((author) => author.userId === story.authorUserId)
                : undefined;
        const agent =
            story?.author?.kind === "agent" ? props.agentOf(story.author.agentId) : undefined;
        const name = agent?.name ?? feedAuthor?.name ?? "Story";
        startAuthorId = "story";
        startStoryId = target.storyId;
        authors = story
            ? [
                  {
                      id: "story",
                      name,
                      ...(agent
                          ? agentAvatar(agent)
                          : feedAuthor?.photo
                            ? { photoUrl: hub.urls.photo(feedAuthor.photo) }
                            : {}),
                      initials: initialsOf(name),
                      // Only its author reads a draft or a story's view count.
                      self:
                          feedAuthor?.isSelf ??
                          (story.status === "draft" || story.viewCount !== null),
                      stories: [story],
                  },
              ]
            : [];
    }
    const sourceOpen = (agentId: string) => {
        screen.viewerClose();
        props.onSourceOpen(agentId);
    };
    return (
        <StoryViewer
            {...(artifactRender ? { artifactRender } : {})}
            authors={authors}
            frameUrl={hub.urls.frame}
            onClose={() => screen.viewerClose()}
            onDelete={(storyId) => store.storyDelete(storyId)}
            onFeedback={(story, frameId, text) => store.storyFeedbackSend(story.id, frameId, text)}
            onLinkOpen={props.onLinkOpen}
            onOwnStoryShown={(storyId) => store.storyRefresh(storyId)}
            onReact={(storyId, emoji) => store.storyReactionToggle(storyId, emoji)}
            onRepost={(story) => {
                // The draft opens in the editor once the daemon has made it;
                // a refusal leaves the person watching.
                void store.storyRepost(story.id).then(
                    (draftId) => {
                        screen.viewerClose();
                        editor.editorOpen(draftId);
                    },
                    () => undefined,
                );
            }}
            onRepostSourceOpen={(story) => {
                if (story.repostOf?.canOpen) sourceOpen(story.repostOf.agentId);
            }}
            onSeen={(storyId) => store.storySeen(storyId)}
            onSourceOpen={(story) => {
                if (story.source) sourceOpen(story.source.agentId);
            }}
            onViewersRequest={(storyId) => store.storyViewersRequest(storyId)}
            overlayMediaUrl={hub.urls.overlayMedia}
            postedLabel={postedLabel}
            startAuthorId={startAuthorId}
            {...(startStoryId ? { startStoryId } : {})}
            sticker={source.byId}
            viewerPhotoUrl={(viewer) => (viewer.photo ? hub.urls.photo(viewer.photo) : undefined)}
            viewers={(storyId) => {
                const entry = snapshot.viewers.get(storyId);
                return entry?.status === "failed"
                    ? { status: "failed", message: entry.error.message }
                    : entry;
            }}
        />
    );
}

/** The person's draft — a repost — in the editor, until it is posted or closed. */
function HappyAgentStoryEditorScreen(
    props: HappyAgentStoriesScreensProps & {
        readonly editor: Extract<HappyAgentStoryEditorSnapshot, { status: "open" }>;
    },
) {
    const { hub, editor } = props;
    const store = hub.stories();
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    const stickersStore = hub.stickers();
    const stickers = useSyncExternalStore(
        stickersStore.subscribe,
        stickersStore.get,
        stickersStore.get,
    );
    const source = stickerSourceOf(hub, stickersStore, stickers);
    const artifactRender = useStoryArtifactRender(props);
    const editorStore = hub.editor();
    // Records what is wanted; the read starts after this render.
    store.storiesRequest([editor.storyId]);
    const entry = snapshot.stories.get(editor.storyId);
    const story = entry?.type === "ready" ? entry.story : undefined;
    if (!story || story.frames.length === 0) return null;
    const repost = repostChipOf(story, (agentId) => {
        editorStore.editorClose();
        props.onSourceOpen(agentId);
    });
    return (
        <StoryEditor
            {...(artifactRender ? { artifactRender } : {})}
            caption={editor.caption}
            {...(editor.error ? { error: editor.error.message } : {})}
            frameIndex={editor.frameIndex}
            frameUrl={hub.urls.frame}
            onCaptionChange={editorStore.captionUpdate}
            onClose={editorStore.editorClose}
            onFrameShow={editorStore.frameShow}
            onPost={() => {
                // A refusal shows in the editor, which stays open.
                void editorStore.storyPost().catch(() => undefined);
            }}
            onRoundVideoRecorded={editorStore.roundVideoRecord}
            onRoundVideoRemove={editorStore.roundVideoRemove}
            onRoundVideoTransform={editorStore.roundVideoTransformUpdate}
            overlayMediaUrl={hub.urls.overlayMedia}
            posting={editor.posting}
            {...(repost ? { repost } : {})}
            {...(editor.roundVideo
                ? {
                      roundVideo: {
                          frameId: editor.roundVideo.frameId,
                          url: editor.roundVideo.url,
                          mirrored: editor.roundVideo.recording.mirrored,
                          transform: editor.roundVideo.transform,
                      },
                  }
                : {})}
            roundVideoMaxMs={happyAgentProtocol.MAX_STORY_ROUND_VIDEO_DURATION_MS}
            sticker={source.byId}
            story={story}
        />
    );
}

export interface HappyAgentStoryInlineProps {
    readonly hub: HappyAgentStories;
    readonly storyId: string;
    /** Where the chat learns the card's height, so it is drawn whole. */
    readonly fit: InlinePageFit;
}

/** A story an agent drafted, in its chat, with Post while it is the reader's draft. */
export function HappyAgentStoryInline(props: HappyAgentStoryInlineProps) {
    const { hub, storyId } = props;
    const store = hub.stories();
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    const stickersStore = hub.stickers();
    const stickers = useSyncExternalStore(
        stickersStore.subscribe,
        stickersStore.get,
        stickersStore.get,
    );
    const source = stickerSourceOf(hub, stickersStore, stickers);
    // Records what is wanted; the read starts after this render.
    store.storiesRequest([storyId]);
    const entry = snapshot.stories.get(storyId);
    const screen = hub.screen();
    // Identity contract: one observer per card and chat fit, not one per
    // store notification.
    const fit = props.fit;
    const measuredRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (!node) return;
            const report = () => fit.heightChanged(node.getBoundingClientRect().height);
            const observer = new ResizeObserver(report);
            observer.observe(node);
            report();
            return () => observer.disconnect();
        },
        [fit],
    );
    return (
        // The frame lays its page out in a row, which would stretch a direct
        // child to the frame's own height; the column lets the measured card
        // keep its natural height.
        <div style={{ display: "flex", flexDirection: "column" }}>
            <div
                // The chat sizes this row from its model, so the card's height is
                // reported; it never changes once drawn.
                ref={measuredRef}
                style={{ display: "flex", flex: "none", flexDirection: "column" }}
            >
                <StoryInlineCard
                    data-testid="story-inline"
                    frameUrl={hub.urls.frame}
                    onOpen={(story) => {
                        screen.viewerOpen({ kind: "story", storyId: story.id });
                    }}
                    onPost={(story) => {
                        // A refused post shows its error on the card.
                        void store
                            .storyPost(story.id, story.artifactVersion)
                            .catch(() => undefined);
                    }}
                    state={
                        entry === undefined || entry.type === "loading"
                            ? { type: "loading" }
                            : entry.type === "missing"
                              ? { type: "missing" }
                              : {
                                    type: "ready",
                                    story: entry.story,
                                    // Only its author may read a draft.
                                    mine: entry.story.status === "draft",
                                    ...(entry.posting ? { posting: true } : {}),
                                    ...(entry.postError ? { error: entry.postError.message } : {}),
                                }
                    }
                    sticker={source.byId}
                />
            </div>
        </div>
    );
}
