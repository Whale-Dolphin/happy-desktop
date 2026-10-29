import type { StoryTransform } from "@slopus/happy-agent-client";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import type { HappyAgentStoriesStore, HappyAgentStoryRoundVideoRecording } from "./storiesStore.js";

/** A round video the person recorded and laid on one frame of their draft. */
export interface HappyAgentStoryEditorRoundVideo {
    readonly frameId: string;
    readonly transform: StoryTransform;
    readonly recording: HappyAgentStoryRoundVideoRecording;
    /** Where the recording plays back from while it is only on this device. */
    readonly url: string;
}

export type HappyAgentStoryEditorSnapshot =
    | { readonly status: "closed" }
    | {
          readonly status: "open";
          readonly storyId: string;
          readonly caption: string;
          /** The frame on screen, by its place in the story. */
          readonly frameIndex: number;
          readonly roundVideo?: HappyAgentStoryEditorRoundVideo;
          /** Post was pressed and the daemon has not answered yet. */
          readonly posting: boolean;
          /** Why the last Post was refused, until the next one. */
          readonly error?: UserError;
      };

/**
 * The person's draft in the story editor: a repost they are making their own.
 * The caption and the round video are held here until Post, which saves them
 * onto the draft and posts it in one go; closing leaves the draft as it was.
 */
export interface HappyAgentStoryEditorStore {
    get(): HappyAgentStoryEditorSnapshot;
    subscribe(listener: () => void): () => void;
    editorOpen(storyId: string): void;
    editorClose(): void;
    captionUpdate(value: string): void;
    frameShow(index: number): void;
    /** Lays a new recording on the frame on screen, replacing any recorded before. */
    roundVideoRecord(recording: HappyAgentStoryRoundVideoRecording): void;
    roundVideoTransformUpdate(transform: StoryTransform): void;
    roundVideoRemove(): void;
    /** Saves and posts the draft; closes the editor once it is posted. */
    storyPost(): Promise<void>;
    [Symbol.dispose](): void;
}

const CLOSED: HappyAgentStoryEditorSnapshot = { status: "closed" };

/** Where a new circle lands: lower left, a third of the canvas across, as Telegram drops it. */
const ROUND_VIDEO_START: StoryTransform = { x: 0.26, y: 0.72, scale: 0.36, rotation: 0 };

export interface HappyAgentStoryEditorDeps {
    readonly stories: HappyAgentStoriesStore;
    /** Makes and frees the address a recording plays from; the browser's by default. */
    readonly objectUrl?: {
        create(data: Blob): string;
        revoke(url: string): void;
    };
}

export function happyAgentStoryEditorStoreCreate(
    deps: HappyAgentStoryEditorDeps,
): HappyAgentStoryEditorStore {
    const objectUrl = deps.objectUrl ?? {
        create: (data: Blob) => URL.createObjectURL(data),
        revoke: (url: string) => URL.revokeObjectURL(url),
    };
    const listeners = new Set<() => void>();
    let snapshot: HappyAgentStoryEditorSnapshot = CLOSED;
    let disposed = false;
    const publish = (next: HappyAgentStoryEditorSnapshot): void => {
        if (next === snapshot) return;
        const previous = snapshot.status === "open" ? snapshot.roundVideo?.url : undefined;
        const kept = next.status === "open" ? next.roundVideo?.url : undefined;
        if (previous !== undefined && previous !== kept) objectUrl.revoke(previous);
        snapshot = next;
        for (const listener of [...listeners]) listener();
    };
    const open = (
        change: (
            current: Extract<HappyAgentStoryEditorSnapshot, { status: "open" }>,
        ) => HappyAgentStoryEditorSnapshot,
    ): void => {
        if (disposed || snapshot.status !== "open") return;
        publish(change(snapshot));
    };
    const frameIdAt = (storyId: string, index: number): string | undefined => {
        const entry = deps.stories.get().stories.get(storyId);
        return entry?.type === "ready" ? entry.story.frames[index]?.id : undefined;
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        editorOpen(storyId) {
            if (disposed) return;
            const entry = deps.stories.get().stories.get(storyId);
            const caption = entry?.type === "ready" ? (entry.story.caption ?? "") : "";
            deps.stories.storiesRequest([storyId]);
            publish({ status: "open", storyId, caption, frameIndex: 0, posting: false });
        },
        editorClose() {
            if (disposed) return;
            publish(CLOSED);
        },
        captionUpdate(value) {
            open((current) => ({ ...current, caption: value }));
        },
        frameShow(index) {
            open((current) => ({ ...current, frameIndex: Math.max(0, index) }));
        },
        roundVideoRecord(recording) {
            open((current) => {
                const frameId = frameIdAt(current.storyId, current.frameIndex);
                if (frameId === undefined) return current;
                return {
                    ...current,
                    roundVideo: {
                        frameId,
                        transform: current.roundVideo?.transform ?? ROUND_VIDEO_START,
                        recording,
                        url: objectUrl.create(recording.data),
                    },
                };
            });
        },
        roundVideoTransformUpdate(transform) {
            open((current) =>
                current.roundVideo
                    ? { ...current, roundVideo: { ...current.roundVideo, transform } }
                    : current,
            );
        },
        roundVideoRemove() {
            open((current) => {
                if (!current.roundVideo) return current;
                const { roundVideo: _removed, ...rest } = current;
                return rest;
            });
        },
        async storyPost() {
            if (disposed || snapshot.status !== "open" || snapshot.posting) return;
            const editing = snapshot;
            const { error: _error, ...rest } = editing;
            publish({ ...rest, posting: true });
            try {
                await deps.stories.storyPublish(editing.storyId, {
                    caption: editing.caption.trim() === "" ? null : editing.caption,
                    ...(editing.roundVideo
                        ? {
                              roundVideo: {
                                  frameId: editing.roundVideo.frameId,
                                  transform: editing.roundVideo.transform,
                                  recording: editing.roundVideo.recording,
                              },
                          }
                        : {}),
                });
                if (snapshot.status === "open" && snapshot.storyId === editing.storyId)
                    publish(CLOSED);
            } catch (error) {
                const failure = happyAgentUserError(error);
                open((current) =>
                    current.storyId === editing.storyId
                        ? { ...current, posting: false, error: failure }
                        : current,
                );
                throw failure;
            }
        },
        [Symbol.dispose]() {
            if (disposed) return;
            publish(CLOSED);
            disposed = true;
            listeners.clear();
        },
    };
}
