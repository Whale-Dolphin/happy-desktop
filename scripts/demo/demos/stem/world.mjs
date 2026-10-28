// The stem-cell take reuses the core demo's fixtures: the waveform code,
// Steve's phone message, and the offline shipping screenplay. Its opening is
// new work in the Spaces sidebar: the first message names it, Focus (the
// daemon's sidebar helper, still titled Prioritizing in this release) gives it
// an icon from the clay library and files it into its section.
export * from "../core/world.mjs";
import * as core from "../core/world.mjs";

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

/** A subject title: what the sidebar row is called once it is named. */
export const sessionTitle = "Voice waveform";
export const icon = "new-feature";

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
            const filmed = after.includes(core.prompt);
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
    if (system.includes("You are Prioritizing")) return await focusReply(payload);
    const sessionId = payload.options?.sessionId ?? "";
    const messages = payload.context?.messages ?? [];
    const input = messages.map(textOf).join("\n");
    if (sessionId.endsWith(":title")) {
        if (input.includes(core.prompt)) {
            // The sent message settles before the row takes its name.
            await focusGate("name");
            return { content: [text(`<title>${sessionTitle}</title>`)] };
        }
        const seed = seeds.find((candidate) => input.includes(candidate.message));
        if (seed) return { content: [text(`<title>${seed.title}</title>`)] };
        return undefined;
    }
    const seed = seeds.find((candidate) => input.includes(candidate.message));
    if (seed && !input.includes(core.prompt))
        return focusPaced([text(seed.reply)], { textDeltaDelayMs: 0, completionDelayMs: 0 });
    // The filmed work starts once its row has its icon, so naming and filing
    // read as their own beat before the first tool row arrives.
    if (
        input.includes(core.prompt) &&
        !messages.some((message) => message.role === "assistant") &&
        !emitted.has(`stem:work:${sessionId}`)
    ) {
        emitted.set(`stem:work:${sessionId}`, true);
        await focusGate("work");
    }
    return await core.reply(payload, emitted);
}
