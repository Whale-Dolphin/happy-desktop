/*
 * GYM SCENARIO — onboarding: FIXTURE. Happy's model during onboarding, as a
 * model following the onboarding recipe in its instructions might answer, in
 * the words review/video-script-v9.md gives each step. Every reply is scripted
 * here, never a model. Happy Agent hands Happy's model each press as the
 * person's own message, `[Pressed "Label" in your message]` and what it did,
 * what the person did not do as a hidden `<happy-onboarding-event>`, and
 * Focus's report as a message from Focus; this answers each with the next
 * step, and calls `save_profile` and `send_agent_message` where the recipe
 * says to, so the daemon does its real work and the tool calls show as they
 * would.
 */
import { chatActionEscape } from "happy-desktop-state";

/** FIXTURE — the work Focus proposes for the stand-in person. Never shown as real. */
export const ONBOARDING_FIXTURE_WORK: readonly {
    readonly title: string;
    readonly icon: string;
    readonly topic: string;
    readonly why: string;
    readonly firstMessage: string;
    readonly ongoing?: true;
}[] = [
    {
        title: "Onboarding redesign",
        icon: "ux",
        topic: "Sign-in and onboarding",
        why: "happy-desktop · most of this week",
        firstMessage: "Plan the rest of the onboarding redesign. Read only, then wait for me.",
    },
    {
        title: "Windows sign-in",
        icon: "login",
        topic: "Sign-in and onboarding",
        why: "happy-desktop · open sign-in branch",
        firstMessage: "Plan the Windows sign-in fix. Read only, then wait for me.",
    },
    {
        title: "Release CI",
        icon: "flaky",
        topic: "Release pipeline",
        why: "happy-agent · CI retries in your sessions",
        firstMessage: "Find why release CI is flaky. Read only, then wait for me.",
    },
    {
        title: "Release check-in",
        icon: "app-store-release",
        topic: "Release pipeline",
        why: "a standing job you keep doing by hand",
        firstMessage: "Suggest a weekday release check-in. Change nothing yet.",
        ongoing: true,
    },
];

type TreeNode = { readonly name: string; readonly children: readonly TreeNode[] };
type Started = { readonly id?: string; readonly title: string; readonly topic?: string };
type Places = { readonly tree: readonly TreeNode[]; readonly reads: readonly string[] };

/**
 * What this script answers: a press the person made, as the step it moves to,
 * or what happened that they did not do themselves, as Happy Agent's onboarding
 * guide names both.
 */
export type OnboardingEvent =
    | {
          readonly kind: "begin";
          readonly connected?: readonly { readonly app: string; readonly account?: string }[];
          readonly model: { readonly name: string; readonly effort: string };
          readonly profile?: { readonly name: string; readonly email: string };
      }
    | { readonly kind: "profileChangeAsked" }
    | { readonly kind: "profileSaved"; readonly name: string; readonly places?: Places }
    | { readonly kind: "discoverAsked" }
    /** Focus reported back to Happy, with the proposal it left open. */
    | { readonly kind: "focusFinished"; readonly proposal?: string }
    | { readonly kind: "workTellAsked" }
    | { readonly kind: "workChangeAsked" }
    | { readonly kind: "workAccepted"; readonly started: readonly Started[] }
    | { readonly kind: "newChatOpened" }
    | { readonly kind: "newChatSkipped" }
    | {
          readonly kind: "phoneAnswered";
          readonly choice: "opened" | "later";
          readonly name: string;
          readonly started: readonly Started[];
      }
    | { readonly kind: "phonePaired"; readonly name: string; readonly started: readonly Started[] }
    | { readonly kind: "providerAdded"; readonly app: string };

const EVENT_OPEN = "<happy-onboarding-event>";
const EVENT_CLOSE = "</happy-onboarding-event>";
const PRESSED = /^\[Pressed "([^"]*)"(?: with [\s\S]*? ticked)? in your message\]\n\n([\s\S]*)$/u;
/** Focus's report to Happy, as the daemon sends it once Focus's turn ends. */
const FOCUS_FINISHED = /^Message from agent \S+:\n\nFocus finished\./u;

/**
 * What one message in Happy's conversation asks this script to answer: a
 * hidden event, or the person's press with what it did. Nothing for anything
 * else, such as what the person typed.
 */
export function onboardingEventRead(text: string): OnboardingEvent | undefined {
    const start = text.lastIndexOf(EVENT_OPEN);
    const end = text.lastIndexOf(EVENT_CLOSE);
    if (start !== -1 && end > start) {
        try {
            return JSON.parse(text.slice(start + EVENT_OPEN.length, end)) as OnboardingEvent;
        } catch {
            return undefined;
        }
    }
    if (FOCUS_FINISHED.test(text.trim())) {
        const proposal = /open proposal is ([a-z0-9]{24})/u.exec(text)?.[1];
        return { kind: "focusFinished", ...(proposal ? { proposal } : {}) };
    }
    const pressed = PRESSED.exec(text.trim());
    return pressed ? pressRead(pressed[1] ?? "", pressed[2] ?? "") : undefined;
}

/** A press by the words on its control, and the outcome Happy Agent wrote under it. */
function pressRead(label: string, outcome: string): OnboardingEvent | undefined {
    switch (label) {
        case "That's me":
            return profileSavedRead(outcome) ?? { kind: "profileChangeAsked" };
        case "Change it":
        case "Type my name and email":
            return { kind: "profileChangeAsked" };
        case "Discover what I've been working on":
            return { kind: "discoverAsked" };
        case "I'll tell you":
        case "I'll tell you instead":
            return { kind: "workTellAsked" };
        case "Change these":
            return { kind: "workChangeAsked" };
        case "Good to go":
            return {
                kind: "workAccepted",
                started: [
                    ...outcome.matchAll(/^- (.+), under (.+?)(?: \(data-item (\S+)\))?$/gmu),
                ].map((match) => ({
                    title: match[1] ?? "",
                    topic: match[2] ?? "",
                    ...(match[3] ? { id: match[3] } : {}),
                })),
            };
        case "Try Create":
            return { kind: "newChatOpened" };
        case "Continue":
        case "Skip for now":
            return { kind: "newChatSkipped" };
        case "I've downloaded and opened Happy":
        case "Later":
        case "Pair later":
            return {
                kind: "phoneAnswered",
                choice:
                    label !== "I've downloaded and opened Happy" ||
                    outcome.includes("couldn't open")
                        ? "later"
                        : "opened",
                ...closingRead(outcome),
            };
        default:
            return undefined;
    }
}

/** A saved profile, as "That's me" and `save_profile` report it. */
export function profileSavedRead(
    outcome: string,
): Extract<OnboardingEvent, { kind: "profileSaved" }> | undefined {
    const saved = /^Saved their name and email: (.+), [^,\s]+@\S+\.$/mu.exec(outcome);
    if (!saved) return undefined;
    const placesAt = outcome.indexOf("Places you can read");
    const readsAt = outcome.indexOf("What you read there:");
    if (placesAt === -1 || readsAt === -1) return { kind: "profileSaved", name: saved[1] ?? "" };
    const treeLines = outcome.slice(placesAt, readsAt).split("\n").slice(1).filter(Boolean);
    const reads = outcome
        .slice(readsAt)
        .split("\n")
        .slice(1)
        .flatMap((line) => (line.startsWith("- ") ? [line.slice(2)] : []));
    return {
        kind: "profileSaved",
        name: saved[1] ?? "",
        places: { tree: treeRead(treeLines), reads },
    };
}

/** An indented "- name" list as the tree it writes. */
function treeRead(lines: readonly string[]): TreeNode[] {
    const root: { name: string; children: TreeNode[] }[] = [];
    const stack: { depth: number; children: { name: string; children: TreeNode[] }[] }[] = [
        { depth: -1, children: root },
    ];
    for (const line of lines) {
        const match = /^( *)- (.+)$/u.exec(line);
        if (!match) continue;
        const depth = (match[1] ?? "").length / 2;
        while ((stack.at(-1)?.depth ?? -1) >= depth) stack.pop();
        const node = {
            name: match[2] ?? "",
            children: [] as { name: string; children: TreeNode[] }[],
        };
        stack.at(-1)?.children.push(node);
        stack.push({ depth, children: node.children });
    }
    return root;
}

/** The person's name and the chats onboarding started, as the last steps' outcomes say them. */
function closingRead(outcome: string): { name: string; started: Started[] } {
    return {
        name: /^Their name: (.+)\.$/mu.exec(outcome)?.[1] ?? "",
        started: [...outcome.matchAll(/^- (\S+): (.+) \((.+)\)$/gmu)].map((match) => ({
            id: match[1] ?? "",
            title: match[2] ?? "",
            topic: match[3] ?? "",
        })),
    };
}

/** What Happy's model does next: say something, or call one of its tools. */
export type OnboardingStep =
    | { readonly kind: "say"; readonly text: string }
    | {
          readonly kind: "call";
          readonly name: string;
          readonly arguments: Record<string, unknown>;
          /** What the model says before the call, in the same turn. */
          readonly text?: string;
      };

/** Where the turn stands since the event: the tools already answered, and what the person typed. */
export type OnboardingTurn = {
    readonly results: ReadonlyMap<string, string>;
    /** What the person typed after the event, when they did. */
    readonly typed?: string;
    /** What Happy's model wrote last before the event. */
    readonly previous?: string;
};

const menuOf = (...buttons: readonly string[]) =>
    ["<menu>", ...buttons.map((button) => `  ${button}`), "</menu>"].join("\n");

const treeOf = (nodes: readonly TreeNode[], depth = 1): string =>
    nodes
        .map((node) => {
            const pad = "  ".repeat(depth);
            const name = chatActionEscape(node.name);
            return node.children.length === 0
                ? `${pad}<li>${name}</li>`
                : `${pad}<li>${name}\n${pad}  <ul>\n${treeOf(node.children, depth + 2)}\n${pad}  </ul>\n${pad}</li>`;
        })
        .join("\n");

const say = (...parts: readonly string[]): OnboardingStep => ({
    kind: "say",
    text: parts.join("\n\n"),
});

const NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** The next step for one event, following the recipe's steps in order. */
export function onboardingHappyStep(event: OnboardingEvent, turn: OnboardingTurn): OnboardingStep {
    switch (event.kind) {
        case "begin": {
            const [connected] = event.connected ?? [];
            const opening = connected
                ? `Connected to ${chatActionEscape(connected.app)}${connected.account ? ` as ${chatActionEscape(connected.account)}` : ""}. `
                : "";
            const model = `${event.model.name} · ${event.model.effort}`;
            const intro = `${opening}I've set ${model} as the default, and I'll use it for the rest of onboarding. Change it here, in Settings, or just ask me.`;
            const figure = '<figure data-setting="default-model"></figure>';
            const free = "From here on, use the buttons or just message me anything below.";
            const profile = event.profile;
            if (!profile)
                return say(
                    intro,
                    figure,
                    `${free} What should I call you, and which email should your Happy profile use?`,
                    menuOf(
                        '<button data-action="onboarding.profileChange" data-emphasis>Type my name and email</button>',
                    ),
                );
            return say(
                intro,
                figure,
                `${free} What should I call you? I found this in your Git settings:`,
                `**${chatActionEscape(profile.name)}** · ${chatActionEscape(profile.email)}`,
                menuOf(
                    '<button data-action="onboarding.profileConfirm" data-emphasis>That\'s me</button>',
                    '<button data-action="onboarding.profileChange">Change it</button>',
                ),
            );
        }
        case "profileChangeAsked": {
            const saved = turn.results.get("save_profile");
            const savedRead = saved === undefined ? undefined : profileSavedRead(saved);
            if (savedRead) return onboardingHappyStep(savedRead, { results: new Map() });
            const typed =
                turn.typed === undefined ? undefined : /^(.+?),\s*(\S+@\S+)\s*$/u.exec(turn.typed);
            if (typed && saved === undefined)
                return {
                    kind: "call",
                    name: "save_profile",
                    arguments: { name: typed[1]?.trim(), email: typed[2] },
                };
            return say(
                saved === undefined
                    ? "Type your name and the email for your Happy profile below, like Ada Lovelace, ada@example.com."
                    : `That didn't save: ${saved} Type your name and email below again.`,
            );
        }
        case "profileSaved": {
            const name = event.name.split(" ")[0] ?? event.name;
            const places = event.places;
            if (!places)
                return say(
                    `Thanks, ${name}. I can't see your history on this computer. What are you working on, and what matters most right now?`,
                    menuOf(
                        '<button data-action="onboarding.workTell" data-emphasis>I\'ll tell you</button>',
                        '<button data-action="onboarding.newChatSkip">Skip for now</button>',
                    ),
                );
            return say(
                `Thanks, ${name}. I can organize the work you already have going and help you decide what comes first. I'll look in these places:`,
                ["<ul data-tree>", treeOf(places.tree), "</ul>"].join("\n"),
                "I'll read which projects your Codex sessions worked in, what you asked, and the last 30 days of commits. What I read goes only to the AI you connected, and I won't change any files.",
                menuOf(
                    '<button data-action="onboarding.discover" data-emphasis>Discover what I\'ve been working on</button>',
                    '<button data-action="onboarding.workTell">I\'ll tell you instead</button>',
                ),
            );
        }
        case "discoverAsked":
            /* The daemon started Focus with the press and wrote its spawn row;
               Happy only says who Focus is. */
            return say(
                "I'm handing this to Focus, my sub-agent that keeps your work organized and helps you stay on track. You'll rarely need to talk to Focus directly, and you can always ask me instead.",
            );
        case "focusFinished":
            if (event.proposal === undefined)
                return say(
                    "Focus didn't find anything to organize. What are you working on, and what matters most right now?",
                );
            return say(
                "Here's how Focus would organize it, most important first. Good to go places these in your sidebar and starts each chat on a read-only plan. To change anything, just tell me.",
                `<figure data-sidebar-proposal="${event.proposal}"></figure>`,
                menuOf(
                    `<button data-action="sidebar.proposalAccept" data-proposal="${event.proposal}" data-emphasis>Good to go</button>`,
                ),
            );
        case "workTellAsked":
        case "workChangeAsked":
            return say(
                event.kind === "workTellAsked"
                    ? "Sure. What are you working on, and what matters most right now? A sentence or two below is enough."
                    : "What should change? Tell me below, and I'll ask Focus to redo it.",
            );
        case "workAccepted": {
            const topics = [
                ...new Set(event.started.map((chat) => chat.topic ?? "").filter(Boolean)),
            ];
            const count = event.started.length;
            const chats = `${NUMBERS[count] ?? String(count)} ${count === 1 ? "chat" : "chats"}`;
            return say(
                count === 0
                    ? "I didn't start anything."
                    : `I placed ${count === 1 ? "that chat" : `those ${chats}`}${topics.length > 0 ? ` under ${listOf(topics)}` : ""}. ${
                          count === 1
                              ? "It's drafting a read-only plan now and will wait for your approval"
                              : "Each one is drafting a read-only plan now and will wait for your approval"
                      } before changing anything.`,
                "Whenever you want to start something new, press **Create** in the sidebar, or ⌘N. New chats name and organize themselves as you talk.",
                menuOf(
                    '<button data-action="onboarding.newChat" data-emphasis>Try Create</button>',
                    '<button data-action="onboarding.newChatSkip">Continue</button>',
                ),
            );
        }
        case "newChatOpened":
        case "newChatSkipped":
            return say(
                `${event.kind === "newChatOpened" ? "That new row below me is your blank chat. " : ""}Want to follow your agents and reply from your phone? Scan a code to get the app, then open it.`,
                "<figure data-phone-app></figure>",
                menuOf(
                    '<button data-action="onboarding.phone" data-choice="opened" data-emphasis>I\'ve downloaded and opened Happy</button>',
                    '<button data-action="onboarding.phone" data-choice="later">Later</button>',
                ),
            );
        case "phoneAnswered":
            if (event.choice === "opened")
                return say(
                    "In Happy on your phone, tap **Scan** and scan this code. When both screens show the same emoji, approve on each. Your phone then talks to this computer directly.",
                    "<figure data-phone-pair></figure>",
                    menuOf(
                        '<button data-action="onboarding.phone" data-choice="later">Pair later</button>',
                    ),
                );
            return doneOf(event.name, event.started);
        case "phonePaired":
            return doneOf(event.name, event.started);
        case "providerAdded":
            return say(
                `${chatActionEscape(event.app)} is connected too.`,
                ...(turn.previous ? [turn.previous] : []),
            );
    }
}

/** "A", "A and B", "A, B and C". */
function listOf(items: readonly string[]): string {
    return items.length <= 1
        ? (items[0] ?? "")
        : `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}

/** The last step: ready, and the first chat to go to. */
function doneOf(name: string, started: readonly Started[]): OnboardingStep {
    const first = name.split(" ")[0] ?? name;
    const chat = started[0];
    return say(
        `You're all set, ${first}. I stay at the top of your sidebar. Come back here anytime to coordinate your work, change a setting, or fix anything. ${
            chat
                ? `Jump into ${chatActionEscape(chat.title)}, or tell me what you need.`
                : "Tell me what you need."
        }`,
        chat
            ? menuOf(
                  `<button data-action="onboarding.workOpen" data-item="${chatActionEscape(chat.id ?? "")}" data-emphasis>${chatActionEscape(chat.title)}</button>`,
                  '<button data-action="onboarding.finish">Stay here</button>',
              )
            : menuOf('<button data-action="onboarding.finish" data-emphasis>Done</button>'),
    );
}
