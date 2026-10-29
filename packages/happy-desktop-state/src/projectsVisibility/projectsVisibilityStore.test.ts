import { expect, it, vi } from "vitest";
import {
    projectsVisibilityStoreCreate,
    projectsVisibilityConnection,
    type ProjectsVisibilityCacheDocument,
} from "./projectsVisibilityStore.js";

it("starts hidden, shows at once for every subscriber, and writes only the change", () => {
    const write = vi.fn<(document: ProjectsVisibilityCacheDocument) => void>();
    const store = projectsVisibilityStoreCreate({ persistence: { read: () => undefined, write } });
    const listener = vi.fn();
    store.subscribe(listener);
    expect(projectsVisibilityConnection(store.get(), "local").projectsHidden).toBe(true);

    store.projectsHiddenUpdate("local", false);
    expect(projectsVisibilityConnection(store.get(), "local").projectsHidden).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({
        connections: { local: expect.objectContaining({ device: { projectsHidden: false } }) },
    });

    // Saying the same thing again changes nothing.
    store.projectsHiddenUpdate("local", false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
});

it("reads the stored choice back, and treats a malformed or refused record as none", () => {
    expect(
        projectsVisibilityConnection(
            projectsVisibilityStoreCreate({
                persistence: {
                    read: () => ({ connections: { local: { device: { projectsHidden: false } } } }),
                    write: () => undefined,
                },
            }).get(),
            "local",
        ).projectsHidden,
    ).toBe(false);
    expect(
        projectsVisibilityConnection(
            projectsVisibilityStoreCreate({
                persistence: {
                    read: () => ({ connections: { local: { device: { projectsHidden: "yes" } } } }),
                    write: () => undefined,
                },
            }).get(),
            "local",
        ).projectsHidden,
    ).toBe(true);
    const refused = projectsVisibilityStoreCreate({
        persistence: {
            read: () => {
                throw new Error("denied");
            },
            write: () => {
                throw new Error("denied");
            },
        },
    });
    expect(projectsVisibilityConnection(refused.get(), "local").projectsHidden).toBe(true);
    refused.projectsHiddenUpdate("local", false);
    expect(projectsVisibilityConnection(refused.get(), "local").projectsHidden).toBe(false);
});
