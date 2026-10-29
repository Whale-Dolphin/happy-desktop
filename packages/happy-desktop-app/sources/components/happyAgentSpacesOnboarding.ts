import {
    clayIconMark,
    type ClayIconSlug,
    type SidebarItem,
    type SidebarSection,
} from "happy-desktop-ui";

/**
 * What first run adds to the spaces sidebar while it goes on. Given only while
 * it runs; meanwhile a proposal is previewed and decided in Happy's chat, so the
 * sidebar draws none of its own.
 */
export interface HappyAgentSpacesOnboarding {
    /** The example shows, from Happy's first message until Start onboarding. */
    readonly exampleSidebar: boolean;
}

type ExampleRow = {
    readonly label: string;
    readonly icon: ClayIconSlug;
    readonly unread?: true;
};

/**
 * The example: a developer's Spaces sidebar a few weeks in, five sessions
 * under plain topics, one of them the oddly specific bug every codebase has.
 * It stays still: an example is not running.
 */
const EXAMPLE: readonly { readonly section: string; readonly rows: readonly ExampleRow[] }[] = [
    {
        section: "API",
        rows: [
            { label: "Rate limit the public API", icon: "api" },
            { label: "Speed up slow queries", icon: "database" },
        ],
    },
    {
        section: "Web app",
        rows: [
            { label: "Dark mode", icon: "dark-mode" },
            { label: "Fix the flaky checkout test", icon: "flaky" },
        ],
    },
    {
        section: "Bugs",
        rows: [{ label: 'Search breaks on the word "null"', icon: "debugging", unread: true }],
    },
];

/** The example, under the person's own rows, marked "Example" in dashed yellow. */
export function happyAgentSpacesExampleSection(): SidebarSection {
    return {
        id: "onboarding-example",
        attention: { tag: "Example" },
        items: EXAMPLE.flatMap((group): SidebarItem[] => [
            {
                id: `onboarding-example:section:${group.section}`,
                kind: "section",
                label: group.section,
                reorderable: false,
            },
            ...group.rows.map(
                (row): SidebarItem => ({
                    id: `onboarding-example:${row.label}`,
                    kind: "project",
                    label: row.label,
                    imageMark: clayIconMark(row.icon),
                    workingIndicator: "none",
                    reorderable: false,
                    ...(row.unread ? { unread: true } : {}),
                }),
            ),
        ]),
    };
}
