// The stem-cell take reuses the core demo's fixtures: the waveform code,
// Steve's phone message, and the offline shipping screenplay. Its opening is
// new work in the Spaces sidebar: the first message names it, Focus (the
// daemon's sidebar helper) gives it an icon from the clay library and files it
// into its section. The work itself also publishes a small inline artifact.
export * from "../core/world.mjs";
import * as core from "../core/world.mjs";
import { stevePhoneMessage } from "../core/protocol.mjs";

export const id = "stem";

// Today's picker, as Kirill's own installation lists it. GPT-6 Sol is left out
// through the same per-provider include_models a person sets in happy.toml.
export const models = {
    codex: ["openai/gpt-6.1-sol", "openai/gpt-6.1-terra", "openai/gpt-6-astra"],
    claude: ["anthropic/opus-5-5", "anthropic/sonnet-5-5", "anthropic/fable-5-1"],
    grok: ["xai/grok-4.7"],
};

// Stem cells are not project sessions, so the classic world's worktree
// sessions would never reach this sidebar. The background rows are new work
// of their own, made off camera through the same API the Create row uses.
export const sessions = [];
export const worktrees = [];

/** What the person types: short, the way new work is usually started. */
export const prompt = "Add an animated waveform to the voice agent.";
/** A subject title: what the sidebar row is called once it is named. */
export const sessionTitle = "Voice waveform";
/** The clay icon Focus gives the row; `waveform` needs a daemon whose slug list has it. */
export const icon = process.env.STEM_DEMO_ICON ?? "new-feature";
/** The model picked on camera, and the mode later messages keep. */
export const opusMode = {
    ...core.seedMode,
    effort: "medium",
    modelId: "anthropic/opus-5-5",
    providerId: "claude",
};
export const artifactTitle = "Voice waveform";
export const completionText =
    "Done. The waveform animates while either side is speaking, and Astra is reviewing the control flow.";
/** The page the agent publishes: the waveform itself, speaking and silent. */
export const artifactPage = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
:root { color-scheme: light dark; }
html, body { margin: 0; background: transparent; }
body { font-family: var(--happy-host-font, system-ui); color: var(--happy-host-text, #eee); }
.row { display: flex; align-items: center; gap: 18px; padding: 6px 0; }
.bars { display: flex; align-items: center; gap: 4px; height: 56px; width: 220px; }
.bars i { width: 5px; height: 6px; border-radius: 3px; background: #f0b85a; }
.speaking i { background: linear-gradient(#f3c26b, #e07aae); animation: wave 1s ease-in-out infinite; }
@keyframes wave { 0%, 100% { height: 6px; } 50% { height: var(--h); } }
.label { font-size: 13px; line-height: 18px; }
.label span { display: block; color: var(--happy-host-muted, #999); font-family: var(--happy-host-mono, monospace); font-size: 12px; }
.silent i { opacity: 0.45; }
</style>
</head>
<body>
<div class="row"><div class="bars speaking" id="speaking"></div><div class="label">Agent speaking<span>waveformActive → true</span></div></div>
<div class="row"><div class="bars silent" id="silent"></div><div class="label">Silent<span>waveformActive → false</span></div></div>
<script>
for (const id of ["speaking", "silent"]) {
  const bars = document.getElementById(id);
  for (let i = 0; i < 28; i++) {
    const bar = document.createElement("i");
    bar.style.setProperty("--h", Math.round(14 + 40 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.37))) + "px");
    bar.style.animationDelay = (-(i * 83) % 1000) + "ms";
    bars.append(bar);
  }
}
</script>
</body>
</html>
`;

/** Sections the person made, top to bottom, above the default Bots and Tasks. */
export const sections = [
    { id: "voice", label: "Voice" },
    { id: "happy-app", label: "Happy app" },
    { id: "travel", label: "Travel" },
];
/** Where Focus files the filmed request. */
export const section = "voice";

/** Earlier new work, each filed by Focus from its first message. */
export const seeds = [
    {
        message: "Check how voice follows the session I’m looking at.",
        title: "Voice routing",
        icon: "navigation",
        section: "voice",
        reply: "Voice tools use the active session ID. Opening another session updates that same routing state, so the next voice action follows the conversation you’re looking at.",
    },
    {
        message: "Pull the next useful step out of my voice-interface notes.",
        title: "Voice notes",
        icon: "notes",
        section: "voice",
        reply: "Make the speaking state visible without interrupting the conversation. Reuse the existing voice bars and leave the call timer and tap-to-end action alone.",
    },
    {
        message: "How should the message list behave when new replies arrive?",
        title: "Message scroll",
        icon: "ux",
        section: "happy-app",
        reply: "If you’re at the bottom, follow the new reply. If you’ve scrolled up, keep the same message under your eyes.",
    },
    {
        message: "Make the release notes for 1.9 read like a changelog people want to open.",
        title: "Release notes",
        icon: "docs",
        section: "happy-app",
        reply: "Lead with the two things people will notice, then one line per fix. Drop internal names and keep every entry under twelve words.",
    },
    {
        message: "Make the Japan itinerary feel less rushed. Keep Kyoto and add a day in Naoshima.",
        title: "Japan trip",
        icon: "travel",
        section: "travel",
        reply: "Give Kyoto three quiet days, leave one morning open for the market, and take the ferry to Naoshima for a full day.",
    },
];

const text = (value) => ({ type: "text", text: value });
const tool = (name, args) => ({ type: "toolCall", name, arguments: args });
const textOf = (message) =>
    typeof message.content === "string"
        ? message.content
        : (message.content ?? [])
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("\n");

// Focus's two filmed beats. A seed's placement runs ungated, off camera.
const focusGates = new Map();
const focusReached = new Set();
export function focusRelease(name) {
    focusGates.get(name)?.();
    focusGates.delete(name);
}
export function focusHasReached(name) {
    return focusReached.has(name);
}
function focusGate(name) {
    focusReached.add(name);
    return new Promise((resolve) => focusGates.set(name, resolve));
}
export function close() {
    for (const resolve of focusGates.values()) resolve();
    focusGates.clear();
    core.close();
}

const focusPaced = (content, timing = {}) => ({
    content,
    textDeltaChunkSize: 4096,
    textDeltaDelayMs: 200,
    toolCallDeltaDelayMs: 200,
    completionDelayMs: 100,
    ...timing,
});

/**
 * Focus's screenplay. Its tools are the daemon's own: list_sidebar reads the
 * document, set_space_icon applies at once, and edit_sidebar's move is queued
 * until the turn ends, when the daemon applies it as one calm batch.
 */
async function focusReply(payload) {
    const messages = payload.context?.messages ?? [];
    const briefAt = messages.findLastIndex(
        (message) => message.role === "user" || message.role === "agent",
    );
    const brief = textOf(messages[briefAt] ?? {});
    const answered = messages
        .slice(briefAt + 1)
        .filter((message) => message.role === "assistant").length;
    const placing = [...brief.matchAll(/New work started in row (\w+)\. Its first message:/gu)]
        .map((match) => {
            const after = brief.slice(match.index);
            const filmed = after.includes(prompt);
            const seed = seeds.find((candidate) => after.includes(candidate.message));
            if (filmed) return { spaceId: match[1], icon, section, filmed };
            return seed ? { spaceId: match[1], icon: seed.icon, section: seed.section } : undefined;
        })
        .filter((entry) => entry !== undefined);
    const filmed = placing.some((entry) => entry.filmed);
    if (answered === 0) return focusPaced([tool("list_sidebar", {})]);
    if (answered === 1) {
        const listed = messages.slice(briefAt + 1).find((message) => message.role !== "assistant");
        const sidebar = JSON.parse(textOf(listed ?? {}) || "{}");
        const html = sidebar.html ?? "";
        const own = (sidebar.spaces ?? []).find(
            (space) => space.role === "focus" || space.role === "prioritizing",
        );
        const edits = [];
        // Its own row sits right after Happy, as its instructions ask.
        if (own && !html.includes(`<happy-space id="${own.id}"`)) {
            const happy = html.match(/ *<happy-space id="\w+"\/>\n/u)?.[0];
            if (happy)
                edits.push({
                    oldText: happy,
                    newText: `${happy}  <happy-space id="${own.id}"/>\n`,
                });
        }
        for (const entry of placing) {
            const row = `  <happy-space id="${entry.spaceId}"/>\n`;
            const heading = html.match(
                new RegExp(` *<happy-section id="${entry.section}"[^>]*/>\n`, "u"),
            )?.[0];
            if (!html.includes(row) || !heading) continue;
            edits.push({ oldText: row, newText: "" });
            edits.push({ oldText: heading, newText: `${heading}${row}` });
        }
        if (filmed) await focusGate("icon");
        return focusPaced([
            ...placing.map((entry) =>
                tool("set_space_icon", { spaceId: entry.spaceId, slug: entry.icon }),
            ),
            ...(edits.length > 0
                ? [tool("edit_sidebar", { baseVersion: sidebar.version, edits })]
                : []),
        ]);
    }
    if (filmed) await focusGate("file");
    const labels = placing
        .map((entry) => sections.find((candidate) => candidate.id === entry.section)?.label)
        .filter(Boolean);
    return focusPaced([
        text(labels.length > 0 ? `Filed new work under ${labels.join(" and ")}.` : "Ready."),
    ]);
}

export async function reply(payload, emitted) {
    const system = payload.context?.systemPrompt ?? "";
    // Focus's helper prompt; releases before 0.4.110 still call it Prioritizing.
    if (system.includes("You are Focus") || system.includes("You are Prioritizing"))
        return await focusReply(payload);
    const sessionId = payload.options?.sessionId ?? "";
    const messages = payload.context?.messages ?? [];
    const input = messages.map(textOf).join("\n");
    if (sessionId.endsWith(":title")) {
        if (input.includes(prompt)) {
            // The sent message settles before the row takes its name.
            await focusGate("name");
            return { content: [text(`<title>${sessionTitle}</title>`)] };
        }
        const seed = seeds.find((candidate) => input.includes(candidate.message));
        if (seed) return { content: [text(`<title>${seed.title}</title>`)] };
        return undefined;
    }
    const seed = seeds.find((candidate) => input.includes(candidate.message));
    if (seed && !input.includes(prompt))
        return focusPaced([text(seed.reply)], { textDeltaDelayMs: 0, completionDelayMs: 0 });
    // Astra's review and Steve's ship are the core take's screenplay.
    const fromSteve = messages.some(
        (message) => message.role === "user" && textOf(message).trim() === stevePhoneMessage,
    );
    if (input.includes("CORE_ASTRA_REVIEW") || fromSteve || !input.includes(prompt))
        return await core.reply(payload, emitted);
    return await workReply(payload, emitted);
}

/** The artifact the agent made, as its create_artifact result names it. */
function artifactIdRead(messages) {
    for (const message of [...messages].reverse()) {
        if (message.role !== "tool" && message.role !== "toolResult") continue;
        const found = textOf(message).match(
            /(?:\bid |artifactId"?\s*[:=]\s*"?|id=")([a-z0-9]{20,32})\b/u,
        );
        if (found) return found[1];
    }
    throw new Error(`create_artifact named no artifact: ${JSON.stringify(messages.at(-1))}`);
}

/**
 * The filmed work. Read, Edit, create_artifact, write_artifact_file and
 * create_agent are the daemon's own tools; the screenplay chooses them.
 */
async function workReply(payload, emitted) {
    const sessionId = payload.options?.sessionId ?? "";
    const messages = payload.context?.messages ?? [];
    const key = `stem:${sessionId}`;
    const step = emitted.get(key) ?? 0;
    emitted.set(key, step + 1);
    // The work starts once its row has its icon, so naming and filing read as
    // their own beat before the first tool row arrives.
    if (step === 0) {
        await focusGate("work");
        return core.paced(
            [
                { type: "thinking", thinking: "Checking the existing waveform and voice state." },
                tool("Read", { file_path: core.voicePath }),
            ],
            { thinkingDeltaChunkSize: 4096, thinkingDeltaDelayMs: 2500, toolCallDeltaDelayMs: 600 },
        );
    }
    if (step === 1) {
        await core.gate(sessionId, "reading");
        return core.paced([tool("Read", { file_path: core.logicPath })]);
    }
    if (step === 2) {
        await core.gate(sessionId, "implementation");
        return core.paced(
            [
                tool("Edit", {
                    file_path: core.logicPath,
                    old_string: "    return false;",
                    new_string:
                        "    return connected && (\n        agentSpeaking || userSpeaking\n    );",
                }),
            ],
            { toolCallDeltaDelayMs: 350 },
        );
    }
    if (step === 3) {
        await core.gate(sessionId, "artifact");
        return core.paced([
            tool("create_artifact", {
                type: "html",
                title: artifactTitle,
                display: "inline_expanded",
            }),
        ]);
    }
    if (step === 4)
        return core.paced([
            tool("write_artifact_file", {
                artifactId: artifactIdRead(messages),
                path: "index.html",
                content: artifactPage,
            }),
        ]);
    if (step === 5) {
        await core.gate(sessionId, "astra-launch");
        return core.paced([
            tool("create_agent", {
                title: core.astraTask,
                model: "openai/gpt-6-astra",
                provider: "codex",
                effort: "high",
                text: `CORE_ASTRA_REVIEW\nReview ${core.logicPath} and its existing caller in ${core.voicePath}. Check speaking and idle behavior, connecting and error states. Do not edit.`,
            }),
        ]);
    }
    await core.gate(sessionId, "finishing");
    return core.paced([text(completionText)], { textDeltaDelayMs: 1200, completionDelayMs: 900 });
}
