/*
 * GYM SCENARIO — onboarding: the scripted model behind it. Every reply here is
 * a fixture, never a model. It answers what the real Happy Agent asks during
 * Happy's first conversation, so the real daemon does its real work with
 * realistic output:
 *
 * - Happy's own conversation, handed each press, onboarding event and
 *   Focus's report, answers it as `onboardingHappyStep` writes it, calling
 *   `save_profile` and messaging Focus where the recipe says to;
 * - Focus, messaged by Happy, reads the person's work with `discover_work`
 *   and proposes `ONBOARDING_FIXTURE_WORK` with `propose_sidebar`;
 * - naming gives each planning chat its proposed title;
 * - Focus, told about new work, gives it its clay icon and leaves a row
 *   already under its topic where it is;
 * - each planning chat answers with a short read-only plan and asks before
 *   doing anything, with no tool call, so nothing is written;
 * - anything else gets a one-word answer.
 */
import {
    ONBOARDING_FIXTURE_WORK,
    onboardingEventRead,
    onboardingHappyStep,
    type OnboardingEvent,
} from "./onboardingHappyModel.js";

import type { GymInferenceScript } from "./inferenceServer.js";
import { ONBOARDING_PACE } from "./onboardingPace.js";
import type { GymContentBlock, GymInferenceRequest, GymInferenceResponse } from "./types.js";

/** Each proposed idea's read-only first plan, by its title. */
const PLANS: Readonly<Record<string, readonly string[]>> = {
    "Onboarding redesign": [
        "Here's how I'd finish the onboarding redesign. I haven't changed anything.",
        "",
        "- Read the first-run flow in `happy-desktop` and list every screen it still shows.",
        "- Compare it with the chat-first onboarding: connecting an AI, your work, priorities, the phone.",
        "- Note what's left, smallest first: copy, the phone preview, the model-driven steps.",
        "- Check each step in the real window against the Blueprint screens.",
        "",
        "Want me to go ahead?",
    ],
    "Windows sign-in": [
        "Here's my plan for Windows sign-in. I haven't changed anything.",
        "",
        "- Read the sign-in code in `happy-desktop` and follow the Windows path end to end.",
        "- Go through the recent sign-in commits for what changed there.",
        "- Outline a fix, and how to check it on a Windows machine before it ships.",
        "",
        "Want me to go ahead?",
    ],
    "Release CI": [
        "Here's how I'd look into the flaky release CI. I haven't changed anything.",
        "",
        "- Read the release workflow in `happy-agent` and list its jobs and their timeouts.",
        "- Go through recent CI commits and failed runs for the step that flakes.",
        "- Suggest how to reproduce it and what to log while it runs.",
        "- Propose the smallest fix to try first.",
        "",
        "Want me to go ahead?",
    ],
    "Release check-in": [
        "Here's what an ongoing release check-in could look like. Nothing is set up yet.",
        "",
        "- Each weekday morning, read what changed since the last release in both folders.",
        "- Check the latest release CI runs and anything still failing.",
        "- Post a short summary here, with what needs you first.",
        "",
        "Want me to go ahead?",
    ],
};

/** The proposed work, as Focus proposes it. */
type Work = (typeof ONBOARDING_FIXTURE_WORK)[number];
const IDEAS: readonly Work[] = ONBOARDING_FIXTURE_WORK;

const BRIEF =
    /New work started in row (\w+)\. Its first message:\n\n([\s\S]*?)\n\n(?:Choose its icon|The person already placed)/gu;

/**
 * The scenario's model. `dump` receives every request as the daemon sent it,
 * for reading what a scripted turn has to answer.
 */
export function gymOnboardingInferenceScript(
    dump?: (request: GymInferenceRequest) => void,
): GymInferenceScript {
    return (request) => {
        dump?.(request);
        const sessionId =
            typeof request.options.sessionId === "string" ? request.options.sessionId : "";
        if (sessionId.endsWith(":title") || sessionId.startsWith("naming:"))
            return titleReply(request);
        const instructions = systemPromptOf(request.context);
        // Focus's prompt names it "Focus" or, since its rename, "the Focus Agent".
        if (/You are (the )?Focus\b/u.test(instructions)) return focusReply(request);
        /* Happy's own conversation during onboarding: one event, one step. */
        const since = instructions.includes("# Onboarding")
            ? onboardingSince(request.context)
            : undefined;
        if (since) {
            const step = onboardingHappyStep(since.event, since.turn);
            const text = step.text;
            return {
                content: [
                    /* A turn that ends after its tool answered says nothing more. */
                    ...(text === undefined || text === "" ? [] : [{ type: "text" as const, text }]),
                    ...(step.kind === "call"
                        ? [
                              {
                                  type: "toolCall" as const,
                                  name: step.name,
                                  arguments: step.arguments,
                              },
                          ]
                        : []),
                ],
                /* A real model's rate: about a second to the first token, which
                   covers the hold on what was chosen, then two or three tokens
                   every ~45 ms, about 55 tokens a second. The gym provider
                   streams evenly, so there is no jitter between chunks. */
                delayMs: ONBOARDING_PACE.modelFirstTokenMs,
                textDeltaChunkSize: 10,
                textDeltaDelayMs: 45,
                completionDelayMs: 0,
            };
        }
        const prompt = latestPromptText(request.context);
        const idea = IDEAS.find((each) => each.firstMessage === prompt.trim());
        if (idea) {
            return {
                content: [
                    {
                        type: "text",
                        text: (PLANS[idea.title] ?? ["Want me to go ahead?"]).join("\n"),
                    },
                ],
                /* The new chats answer off screen while onboarding goes on. */
                textDeltaChunkSize: 10,
                textDeltaDelayMs: 28,
                completionDelayMs: 0,
            };
        }
        return text("Okay.");
    };
}

/** Naming: the proposal's own title for a planning chat. */
function titleReply(request: GymInferenceRequest): GymInferenceResponse {
    const message = latestUserText(request.context);
    const idea = IDEAS.find((each) => message.includes(each.firstMessage));
    const title =
        idea?.title ??
        message
            .replace(/^The first user message:\s*/u, "")
            .split(/\s+/u)
            .slice(0, 4)
            .join(" ");
    return text(
        `<title>${title}</title>\n<recap>${idea ? "Making a first plan, then waiting for you." : "Started."}</recap>`,
    );
}

/**
 * Focus: Happy's message asks it to organize the person's work, which it
 * proposes; a brief about new work gets that work its icon and place.
 */
function focusReply(request: GymInferenceRequest): GymInferenceResponse {
    const turn = currentTurn(request.context);
    /* Asked to organize the person's work: by Happy's message, or as the task
       the daemon started Focus with. */
    if (turn.prompt.includes("Message from agent") || turn.prompt.includes("most important first"))
        return focusProposeReply(turn);
    return focusFileReply(turn);
}

/**
 * Focus organizing the person's work, in three steps of one turn: read their
 * work and the sidebar; propose the fixture's work under its topics, as new
 * chats; say so in a sentence, which the daemon hands back to Happy.
 */
function focusProposeReply(turn: ReturnType<typeof currentTurn>): GymInferenceResponse {
    if (turn.steps === 0)
        return {
            content: [
                { type: "toolCall", name: "discover_work", arguments: {} },
                { type: "toolCall", name: "list_sidebar", arguments: {} },
            ],
            /* Reading the person's work takes a moment. */
            completionDelayMs: 1_200,
        };
    if (turn.steps === 1 && !turn.calls.has("propose_sidebar")) {
        const listed = turn.results.get("list_sidebar");
        const sidebar = listed ? sidebarRead(listed) : undefined;
        if (sidebar) {
            const topics = [...new Set(IDEAS.map((idea) => idea.topic))];
            const rowId = (idea: Work) =>
                `new-${idea.title.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`;
            const lines = topics.flatMap((topic, index) => [
                `  <happy-section id="topic${String(index + 1)}" label="${topic}"/>`,
                ...IDEAS.filter((idea) => idea.topic === topic).map(
                    (idea) => `  <happy-space id="${rowId(idea)}"/>`,
                ),
            ]);
            return {
                content: [
                    {
                        type: "toolCall",
                        name: "propose_sidebar",
                        arguments: {
                            baseVersion: sidebar.version,
                            edits: [{ oldText: "</nav>", newText: `${lines.join("\n")}\n</nav>` }],
                            newRows: IDEAS.map((idea) => ({
                                id: rowId(idea),
                                title: idea.title,
                                icon: idea.icon,
                                why: idea.why,
                                firstMessage: idea.firstMessage,
                            })),
                        },
                    },
                ],
                completionDelayMs: 1_000,
            };
        }
    }
    return text("Organized Ada's work under two topics, most important first.");
}

/**
 * Focus filing new work, in three steps of one turn: give each new row its
 * icon and read the sidebar; file the rows under their topics; say what it did.
 */
function focusFileReply(turn: ReturnType<typeof currentTurn>): GymInferenceResponse {
    const rows = [...turn.prompt.matchAll(BRIEF)].flatMap((match) => {
        const excerpt = (match[2] ?? "").replace(/…$/u, "");
        const idea = IDEAS.find((each) => each.firstMessage.startsWith(excerpt));
        return idea && match[1] ? [{ rowId: match[1], idea }] : [];
    });
    if (rows.length === 0) return text("Nothing to change.");
    // Three steps at most, so a reply this script did not foresee can never loop.
    if (turn.steps === 0) {
        return {
            content: [
                ...rows.flatMap(({ rowId, idea }): GymContentBlock[] => [
                    {
                        type: "toolCall",
                        name: "set_space_icon",
                        arguments: { spaceId: rowId, slug: idea.icon },
                    },
                ]),
                { type: "toolCall", name: "list_sidebar", arguments: {} },
            ],
            completionDelayMs: 0,
        };
    }
    if (turn.steps === 1 && !turn.calls.has("edit_sidebar")) {
        const listed = turn.results.get("list_sidebar");
        const sidebar = listed ? sidebarRead(listed) : undefined;
        const edits = sidebar ? filingEdits(sidebar.html, rows) : [];
        if (sidebar && edits.length > 0)
            return {
                content: [
                    {
                        type: "toolCall",
                        name: "edit_sidebar",
                        arguments: { baseVersion: sidebar.version, edits },
                    },
                ],
                completionDelayMs: 0,
            };
    }
    const filed = turn.results.get("list_sidebar");
    const sidebar = filed ? sidebarRead(filed) : undefined;
    const sections = [...new Set(rows.map(({ idea }) => sectionOf(sidebar?.html ?? "", idea)))];
    return text(`Gave the new work its icons and placed it under ${sections.join(" and ")}.`);
}

/** The section a row goes under: its topic when the sidebar has it, else the default for its kind. */
function sectionOf(html: string, idea: Work): string {
    if (headingOf(html, idea.topic)) return idea.topic;
    return "ongoing" in idea ? "Bots" : "Tasks";
}

function headingOf(html: string, label: string): string | undefined {
    return new RegExp(`^ {2}<happy-section id="[^"]+" label="${label}"[^>]*/>\\n`, "mu").exec(
        html,
    )?.[0];
}

/** A section's heading and the rows under it, as written. */
function blockOf(html: string, label: string): string | undefined {
    const heading = headingOf(html, label);
    if (!heading) return undefined;
    const start = html.indexOf(heading);
    const lines = html.slice(start + heading.length).split(/(?<=\n)/u);
    let block = heading;
    for (const line of lines) {
        if (!/^ {2}(<happy-space\b|<\/happy-space>| )/u.test(line)) break;
        block += line;
    }
    return block;
}

/**
 * Exact-text edits that move each row from where new work lands to the end of
 * its section, after the rows already placed there. A row the person already
 * placed under its topic stays where it is.
 */
function filingEdits(
    html: string,
    rows: readonly { readonly rowId: string; readonly idea: Work }[],
): { oldText: string; newText: string }[] {
    const edits: { oldText: string; newText: string }[] = [];
    const bySection = new Map<string, string[]>();
    for (const { rowId, idea } of rows) {
        const line = new RegExp(`^ {2}<happy-space id="${rowId}"[^>]*/>\\n`, "mu").exec(html)?.[0];
        if (!line) continue;
        const section = sectionOf(html, idea);
        if (blockOf(html, section)?.includes(line)) continue;
        edits.push({ oldText: line, newText: "" });
        bySection.set(section, [...(bySection.get(section) ?? []), line]);
    }
    for (const [section, lines] of bySection) {
        const block = blockOf(html, section);
        if (block) edits.push({ oldText: block, newText: block + lines.join("") });
    }
    return edits;
}

function sidebarRead(
    result: string,
): { readonly html: string; readonly version: number } | undefined {
    try {
        const value: unknown = JSON.parse(result);
        if (isRecord(value) && typeof value.html === "string" && typeof value.version === "number")
            return { html: value.html, version: value.version };
    } catch {
        // Not the JSON list_sidebar answers with.
    }
    return undefined;
}

function text(value: string): GymInferenceResponse {
    return { content: [{ type: "text", text: value }], completionDelayMs: 0 };
}

// ——— Reading the provider context ———

function systemPromptOf(context: unknown): string {
    return isRecord(context) && typeof context.systemPrompt === "string"
        ? context.systemPrompt
        : "";
}

function messagesOf(context: unknown): readonly Record<string, unknown>[] {
    if (!isRecord(context) || !Array.isArray(context.messages)) return [];
    return context.messages.filter(isRecord);
}

function contentText(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
        .flatMap((block) =>
            isRecord(block) && block.type === "text" && typeof block.text === "string"
                ? [block.text]
                : [],
        )
        .join("\n");
}

/**
 * The newest onboarding event in Happy's conversation and the turn since it:
 * the tools Happy's model called and their answers, and what the person typed.
 * Nothing once the person has typed past a step that does not ask them to.
 */
function onboardingSince(
    context: unknown,
): { readonly event: OnboardingEvent; readonly turn: OnboardingTurnRead } | undefined {
    const messages = messagesOf(context);
    const at = messages.findLastIndex(
        (each) =>
            each.role !== "assistant" &&
            each.role !== "tool" &&
            onboardingEventRead(contentText(each.content)) !== undefined,
    );
    if (at === -1) return undefined;
    const event = onboardingEventRead(contentText(messages[at]!.content))!;
    const after = messages.slice(at + 1);
    const typedAt = after.findLastIndex((each) => each.role === "user");
    const typed = typedAt === -1 ? undefined : contentText(after[typedAt]!.content);
    if (
        typed !== undefined &&
        event.kind !== "workTellAsked" &&
        event.kind !== "workChangeAsked" &&
        event.kind !== "profileChangeAsked"
    )
        return undefined;
    const named = new Map<string, string>();
    const results = new Map<string, string>();
    for (const message of typedAt === -1 ? after : after.slice(typedAt + 1)) {
        if (message.role === "assistant" && Array.isArray(message.content))
            for (const block of message.content)
                if (
                    isRecord(block) &&
                    block.type === "tool_call" &&
                    typeof block.name === "string" &&
                    typeof block.callId === "string"
                )
                    named.set(block.callId, block.name);
        const name = typeof message.callId === "string" ? named.get(message.callId) : undefined;
        if (message.role === "tool" && name) results.set(name, contentText(message.content));
    }
    const previous = messages
        .slice(0, at)
        .findLast((each) => each.role === "assistant" && contentText(each.content) !== "");
    return {
        event,
        turn: {
            results,
            ...(typed !== undefined ? { typed } : {}),
            ...(previous ? { previous: contentText(previous.content) } : {}),
        },
    };
}

type OnboardingTurnRead = Parameters<typeof onboardingHappyStep>[1];

function latestUserText(context: unknown): string {
    const message = messagesOf(context).findLast((each) => each.role === "user");
    return message ? contentText(message.content) : "";
}

/** The latest prompt from the person or another agent, without an agent message's envelope. */
function latestPromptText(context: unknown): string {
    const message = messagesOf(context).findLast(
        (each) => each.role === "user" || each.role === "agent",
    );
    if (!message) return "";
    const value = contentText(message.content);
    return message.role === "agent" ? value.replace(/^Message from agent \S+:\n\n/u, "") : value;
}

/** The turn being answered: its prompt, the tools already called in it, and their results by name. */
function currentTurn(context: unknown): {
    readonly prompt: string;
    readonly calls: ReadonlySet<string>;
    readonly results: ReadonlyMap<string, string>;
    /** The model's replies so far in this turn. */
    readonly steps: number;
} {
    const messages = messagesOf(context);
    const start = messages.findLastIndex((each) => each.role === "user" || each.role === "agent");
    const calls = new Set<string>();
    const named = new Map<string, string>();
    const results = new Map<string, string>();
    let steps = 0;
    for (const message of messages.slice(start + 1)) {
        if (message.role === "assistant" && Array.isArray(message.content)) {
            steps += 1;
            for (const block of message.content)
                if (
                    isRecord(block) &&
                    block.type === "tool_call" &&
                    typeof block.name === "string"
                ) {
                    calls.add(block.name);
                    if (typeof block.callId === "string") named.set(block.callId, block.name);
                }
        }
        const name = typeof message.callId === "string" ? named.get(message.callId) : undefined;
        if (message.role === "tool" && name) results.set(name, contentText(message.content));
    }
    return {
        prompt: start >= 0 ? contentText(messages[start]?.content) : "",
        calls,
        results,
        steps,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
