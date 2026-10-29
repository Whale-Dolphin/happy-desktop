import type { SidebarItem, SidebarItemStory } from "../../src/Sidebar";
import { clayIconMark, clayIconSlugIs, happyIconMark } from "../../src/clayIcons";
import { localAgoTime } from "../../src/localTime";
import snapshot from "./snapshot.json";

/** Kirill's live sidebar, top level only, as the snapshot resolved it. */
type SnapshotRow =
    | { kind: "section"; id: string; label: string }
    | {
          kind: "row";
          id: string;
          title: string;
          targetKind: "bot" | "task" | "agent";
          icon: { type: "library"; slug: string } | { type: "image"; src: string } | null;
          working: boolean;
          unread: boolean;
          awaitingInput: boolean;
          lastActivityAt: number;
      };

/**
 * What each agent would say with set_status, written from its last messages:
 * `short` for a 2-line row, `long` (may wrap) for a 3-line row. `state` is the
 * dot the agent would set alongside it.
 */
type Status = {
    short: string;
    long: string;
    state?: NonNullable<SidebarItemStory["state"]>;
    working?: boolean;
    unread?: boolean;
    ring?: SidebarItemStory["ring"];
    /** 3-line rows only: the task's rolled-up line counts and unsent draft. */
    changeStats?: SidebarItemStory["changeStats"];
    draft?: string;
    /** 3-line rows only: the agent has said nothing yet. */
    empty?: boolean;
};

const STATUS: Record<string, Status> = {
    amhbrtv1r2vr8q3m1p5ldd1j: {
        short: "Both Pool previews are published",
        long: "Both Pool previews are out, and the onboarding helpers now only look around your Mac",
        ring: { total: 3, unseen: 0 },
    },
    epwr5j1d531g2tgsny9hkm9i: {
        short: "Sidebar left the way you set it",
        long: "Nothing moved: side quests and the cleanup row stay open the way you left them",
        state: "done",
        unread: true,
    },
    kmvrjzhv700vai7e81aysxue: {
        short: "Prototyping stem-cell row variants",
        long: "Renderer and agent previews shipped; now prototyping the stem-cell row variants",
        state: "working",
        working: true,
        changeStats: { added: 1284, deleted: 312 },
    },
    vi8iaq01vr4yrba1qp3ceq3p: {
        short: "Profiling and fixing, nothing pushed",
        long: "Still profiling and fixing in one long stretch, with the edits not pushed yet",
        state: "working",
        working: true,
        changeStats: { added: 86, deleted: 0 },
    },
    hmvrs8d5a00tf7mw5qii7eus: {
        short: "Final video ready for your OK",
        long: "Final onboarding video re-recorded with every fix; waiting on your OK to push",
        state: "needsYou",
        unread: true,
        ring: { total: 2, unseen: 2 },
    },
    i0ay9200oxuzffh2z9sdlx1u: {
        short: "Demo video live on the homepage",
        long: "Round 13 of the demo is on main and now plays on the homepage",
        state: "done",
        unread: true,
        ring: { total: 4, unseen: 1 },
    },
    tmvqdxyp500rpi0am5mewodh: {
        short: "Shipped and running on your Mac",
        long: "The cleanup prompt is on main and in the preview you run; nothing left to do",
    },
    lqo940wwa9j4kqeisjea6z8n: {
        short: "Fix ready in a draft PR",
        long: "Reviewed fix is in a draft PR with phone and iPad checks passing; not released",
        state: "needsYou",
    },
    r954f5j60fmgoyuzympjvnkj: {
        short: "Waiting on your OK to push",
        long: "Direct uploads for large files work; the push waits on your approval",
        state: "needsYou",
        unread: true,
        draft: "ok push it, but keep the old upload path behind the flag for a week",
    },
    dmvt1wzuz023lbxixlj82aro: {
        short: "Suggests regenerating the icons",
        long: "Icon history checked; suggests regenerating them in grids and waits on your call",
        state: "needsYou",
    },
    x6z8r887nl84i7x0n7j2bhzo: {
        short: "Tweet draft ready to read",
        long: "Drafted the voice tweet: lead with the reassurance, Happy and the link at the end",
    },
    nmvsibw3n016j34nj6t1fmi7: {
        short: "Compressed video shown in Finder",
        long: "The compressed Discord video is ready and revealed in Finder",
    },
    mmvsvmofe01nujd1u1j8a4er: {
        short: "Isaiah and Steve share one deadline",
        long: "Found the signed agreement: Isaiah and Steve share the February 1 full-time deadline",
    },
    bmvr2mvh000849qm60kn9kom: {
        short: "Handoff notes need a recipient",
        long: "Onboarding handoff notes are written; tell me which agent to pass them to",
        state: "needsYou",
    },
    bmvs23lm2001rx46qw1q6qr9: {
        short: "Synced to main",
        long: "Permissions persist per site and pages survive workspace switches; on main",
    },
    umvrrlwcu00jj3rwglw4lr71: {
        short: "Re-recording later today",
        long: "A tight one-take flow is written up; re-recording once you have slept",
    },
    wmvosdeyf008ux8bcz323ffy: {
        short: "On hold, conflicts with main",
        long: "The phone-linking PR stays on hold and untouched; it still conflicts with main",
        state: "blocked",
        unread: true,
    },
    bnekcbjtm1ot4s3n7codtfv4: {
        short: "Blocked until Codex signs in",
        long: "Can't run until Codex is signed in on this Mac; run codex login, then retry",
        state: "blocked",
    },
    qr1x6l7zp3j3v1m8td8h1dgl: {
        short: "Leak test on the memory fix",
        long: "The idle-session memory fix looks good so far; the leak test is still finishing",
        state: "working",
        working: true,
    },
    fwl2uaeb3rv9bqh3ojdvif5k: {
        short: "Onboarding up slightly this week",
        long: "Onboarding completion rose a little last week, mostly on Windows; not a trend yet",
    },
    r1npy5ljobdfmpe01lo803jc: {
        short: "Answering you on Telegram",
        long: "The Telegram front door is set up; your status questions go to the Chief of Staff",
    },
    oi8l30urp41t3mckvn87t4yc: {
        short: "Paused until the usage limit resets",
        long: "The tweet factory is paused until Claude's usage limit resets tomorrow",
        state: "blocked",
    },
    kwnj1c5i49sa62c5lsxeilq6: {
        short: "Couldn't confirm the X post opened",
        long: "Found no Expo session on this Mac, then couldn't confirm the X post opened",
    },
    cttfp4qog7cm41jukha2o6yf: {
        short: "Side-by-side speed test running",
        long: "The old and fixed daemons are racing with the Mac kept awake; results this afternoon",
        state: "working",
        working: true,
    },
    nnuwif5zjozp8cibu3cxhdjp: {
        short: "Waiting for limits to reset",
        long: "Not merging the big PR; splitting out the standalone fixes once limits reset",
        state: "blocked",
        unread: true,
    },
    z3jolqns7uy8ux6qtf3h529a: {
        short: "Tests can't start yet",
        long: "Nothing released: the test run can't start until the supervisor binary is back",
        state: "blocked",
    },
    lmvq9s58y00mr7m01kp5y0w4: {
        short: "On main, waiting for a release",
        long: "Both loading fixes are on main but won't reach your app until the next release",
    },
    wmvptbaky001og39z7wa8pa8: {
        short: "App Clip goes to branches",
        long: "The update card is on main; the App Clip goes to branches after your newer call",
        state: "done",
        unread: true,
    },
    vmvouqa6800bei7wrickp1qs: {
        short: "Both layout fixes on main",
        long: "The footer overlap fix and the text measuring fix are both on main",
    },
    bmvmjjnsw001zy7c534gqsho: {
        short: "Fixed, needs a real update to try",
        long: "The window stays normal while the agent updates; try it on the next real update",
        state: "needsYou",
    },
    frpcmpi3qpd249x6mu2190tf: {
        short: "Bun change landed on main",
        long: "The Happy Agent bun change is on main, re-applied cleanly on top of the latest",
    },
    fdg24twpj6g875hzvfjldgj1: {
        short: "Onboarding slightly up, no trend",
        long: "Onboarding completion edged up week over week; too small to call a trend",
        state: "done",
        unread: true,
    },
    dmvpnnbux008i7mev0v9dxy9: {
        short: "Worth a short intro call",
        long: "He looks relevant: keep the first call short, with room to go longer",
        empty: true,
    },
    nmvotjnbq001l1b972ksxvc5: {
        short: "On main, not in a preview yet",
        long: "Both MCP changes landed after the latest preview; they ship in the next one",
    },
};

/** The snapshot's own clock, so the times read as they did when it was taken. */
const NOW = snapshot.capturedAt;
const ZONE = { locale: "en-US", timeZone: "America/Los_Angeles" } as const;

export type RowOptions = {
    readonly lines: 2 | 3;
    readonly dot: "neutral" | "state";
};

function mark(row: Extract<SnapshotRow, { kind: "row" }>): Partial<SidebarItem> {
    // The app's own rule: Happy wears its mark, a library icon its clay icon,
    // and any other picture is a face.
    if (row.title === "Happy") return { imageMark: happyIconMark() };
    if (row.icon?.type === "library" && clayIconSlugIs(row.icon.slug))
        return { imageMark: clayIconMark(row.icon.slug) };
    if (row.icon?.type === "image") return { imageUrl: row.icon.src };
    return { icon: row.targetKind === "task" ? "tasks" : "agents" };
}

/** The snapshot as the sidebar's one list: headings and their top-level rows. */
export function variantItems(options: RowOptions): SidebarItem[] {
    return (snapshot.rows as SnapshotRow[]).map((row): SidebarItem => {
        if (row.kind === "section")
            return { id: row.id, kind: "section", label: row.label, collapsed: false };
        const status = STATUS[row.id];
        if (status === undefined) throw new Error(`No status written for ${row.id}`);
        const three = options.lines === 3;
        const signal = status.working ? "working" : status.unread ? "unread" : undefined;
        // With state dots the agent's state is the signal: any state shows.
        const stateSignal =
            status.state === undefined ? signal : status.state === "working" ? "working" : "unread";
        return {
            id: row.id,
            kind: "project",
            label: row.title,
            ...mark(row),
            story: {
                ...(three && status.empty ? {} : { subtitle: three ? status.long : status.short }),
                ...(three && status.changeStats ? { changeStats: status.changeStats } : {}),
                ...(three && status.draft !== undefined ? { draft: status.draft } : {}),
                time: localAgoTime(row.lastActivityAt, NOW, ZONE),
                ...(status.ring ? { ring: status.ring } : {}),
                ...(options.dot === "state"
                    ? {
                          ...(stateSignal ? { signal: stateSignal } : {}),
                          ...(status.state ? { state: status.state } : {}),
                      }
                    : signal
                      ? { signal }
                      : {}),
            },
        };
    });
}
