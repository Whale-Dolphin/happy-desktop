import { useState, type ReactNode } from "react";
import {
    StoryEditor,
    StoryViewer,
    type StoryArtifactRender,
    type StoryViewerAuthor,
} from "../../src";
import type { StoryTransform } from "../../src/storyTypes";
import { ComponentPage, Specimen } from "../kit";
import {
    FIXTURE_ARTIFACTS,
    STORY_AGENT,
    STORY_REPOST,
    fixtureFrameUrl,
    fixturePostedLabel,
    fixtureSticker,
} from "./storyFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-320";

const noop = () => {};

/** A square clip standing in for a webcam recording. */
const ROUND_VIDEO_URL = new URL("../assets/aspect-480x480.webm", import.meta.url).href;

/** The release board an agent's story shows live, drawn here in place of an isolated guest. */
function FixtureBoard() {
    const rows = [
        ["Desktop build", "passed", "#30d158"],
        ["Renderer preview", "passed", "#30d158"],
        ["iOS TestFlight", "running", "#ffd60a"],
        ["Release notes", "drafted", "#64d2ff"],
    ] as const;
    return (
        <div
            style={{
                display: "flex",
                flex: 1,
                flexDirection: "column",
                gap: 14,
                padding: "56px 22px 22px",
                background: "linear-gradient(#1b1f2e, #0e1018)",
                color: "#ffffff",
                fontFamily: "var(--happy-font-ui)",
            }}
        >
            <span style={{ fontSize: 13, opacity: 0.6 }}>Release 2.4</span>
            <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15 }}>
                Three fixes landed, one build to go
            </span>
            {rows.map(([label, state, color]) => (
                <div
                    key={label}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 14px",
                        borderRadius: 12,
                        background: "rgb(255 255 255 / 0.07)",
                        fontSize: 15,
                    }}
                >
                    <span>{label}</span>
                    <span style={{ color, fontWeight: 600 }}>{state}</span>
                </div>
            ))}
        </div>
    );
}

/** A small chart window's page. */
function FixtureChart() {
    const bars = [38, 52, 44, 70, 64, 88, 96];
    return (
        <div
            style={{
                display: "flex",
                flex: 1,
                flexDirection: "column",
                gap: 12,
                padding: 22,
                background: "#ffffff",
                color: "#111111",
                fontFamily: "var(--happy-font-ui)",
            }}
        >
            <span style={{ fontSize: 17, fontWeight: 700 }}>Crash-free sessions</span>
            <div style={{ display: "flex", flex: 1, alignItems: "flex-end", gap: 10 }}>
                {bars.map((height, index) => (
                    <span
                        key={index}
                        style={{
                            display: "flex",
                            flex: 1,
                            height: `${String(height)}%`,
                            borderRadius: 6,
                            background: index === bars.length - 1 ? "#0a84ff" : "#c7d7f5",
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

const artifactRender: StoryArtifactRender = (target) =>
    target.artifactId === FIXTURE_ARTIFACTS.board
        ? { type: "page", page: <FixtureBoard /> }
        : target.artifactId === FIXTURE_ARTIFACTS.chart
          ? { type: "page", page: <FixtureChart /> }
          : { type: "unavailable" };

const agentAuthors: readonly StoryViewerAuthor[] = [
    {
        id: "agent:agent-focus",
        name: "Release 2.4",
        initials: "R2",
        self: false,
        stories: [STORY_AGENT],
    },
];

/** The viewer and editor fill their window; the transform keeps the fixed overlay inside the card. */
function Window(props: { readonly screen: string; readonly children: ReactNode }) {
    return (
        <div
            data-screen={props.screen}
            style={{
                display: "flex",
                position: "relative",
                width: "1024px",
                height: "704px",
                overflow: "hidden",
                transform: "translateZ(0)",
            }}
        >
            {props.children}
        </div>
    );
}

/** The editor with its own draft state, so the circle drags and the caption types here. */
function LiveEditor(props: { readonly recorded: boolean }) {
    const [caption, setCaption] = useState("");
    const [frameIndex, setFrameIndex] = useState(0);
    const [transform, setTransform] = useState<StoryTransform | null>(
        props.recorded ? { x: 0.26, y: 0.72, scale: 0.36, rotation: 0 } : null,
    );
    const frame = STORY_REPOST.frames[frameIndex];
    return (
        <StoryEditor
            artifactRender={artifactRender}
            caption={caption}
            frameIndex={frameIndex}
            frameUrl={fixtureFrameUrl}
            onCaptionChange={setCaption}
            onClose={noop}
            onFrameShow={setFrameIndex}
            onPost={noop}
            onRoundVideoRecorded={() =>
                setTransform({ x: 0.26, y: 0.72, scale: 0.36, rotation: 0 })
            }
            onRoundVideoRemove={() => setTransform(null)}
            onRoundVideoTransform={setTransform}
            posting={false}
            repost={{ label: "Reposted from Release 2.4", onOpen: noop }}
            {...(transform && frame
                ? {
                      roundVideo: {
                          frameId: frame.id,
                          url: ROUND_VIDEO_URL,
                          mirrored: true,
                          transform,
                      },
                  }
                : {})}
            roundVideoMaxMs={60_000}
            sticker={fixtureSticker}
            story={STORY_REPOST}
        />
    );
}

export function StoryEditorPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="An agent's story in the viewer — a live page, feedback for the agent, repost — and the repost editor: the draft with its Reposted-from chip, a caption, Post, and a Telegram-style round video recorded from the webcam, dragged by its body and resized by its corner."
            title="Agent stories and the repost editor"
            width={1104}
        >
            <div className="specimen-grid">
                <Specimen
                    detail="1024×704 window · a live page frame, feedback, repost"
                    label="An agent's story"
                    number="SE-01"
                    stage="surface"
                >
                    <Window screen="01-agent-story">
                        <StoryViewer
                            artifactRender={artifactRender}
                            authors={agentAuthors}
                            frameUrl={fixtureFrameUrl}
                            onClose={noop}
                            onFeedback={() => Promise.resolve()}
                            onLinkOpen={noop}
                            onReact={noop}
                            onRepost={noop}
                            onSeen={noop}
                            postedLabel={fixturePostedLabel}
                            startAuthorId="agent:agent-focus"
                            sticker={fixtureSticker}
                        />
                    </Window>
                </Specimen>
                <Specimen
                    detail="1024×704 window · the draft before anything is added"
                    label="Repost editor"
                    number="SE-02"
                    stage="surface"
                >
                    <Window screen="02-repost-editor">
                        <LiveEditor recorded={false} />
                    </Window>
                </Specimen>
                <Specimen
                    detail="1024×704 window · a round video on the frame; drag it, pull its corner"
                    label="Repost with a round video"
                    number="SE-03"
                    stage="surface"
                >
                    <Window screen="03-round-video">
                        <LiveEditor recorded />
                    </Window>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
