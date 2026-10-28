import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

/*
 * Where the Happy Agent a macOS first-install download carries goes, and the
 * check that it went there and nowhere else.
 *
 * `scripts/stage-happy-agent-bundle.ts` stages `<staged>/happy-agent.json` and
 * `<staged>/payload/happy-agent`. The app carries only the manifest, so its
 * update zip is no larger for the agent; the disk image carries the payload in
 * a hidden `.happy-agent` folder beside the app, which the first launch from it
 * installs (`happyAgentDiskImageInstall`). Desktop and the agent update
 * separately.
 */
const exec = promisify(execFile);

/** The app's `Resources/happy-agent`: the manifest alone. */
export function macAgentManifestResource(staged) {
    return { from: staged, to: "happy-agent", filter: ["happy-agent.json"] };
}

/** electron-builder's default disk image layout, plus the hidden agent payload. */
export function macDiskImageContents(productName, staged) {
    return [
        { x: 130, y: 220, type: "file", name: `${productName}.app` },
        { x: 410, y: 220, type: "link", path: "/Applications" },
        // Finder hides the dot folder; it sits outside the window regardless.
        { x: 130, y: 600, type: "dir", path: join(staged, "payload"), name: ".happy-agent" },
    ];
}

/*
 * The app and its update zip carry the manifest and no agent; the disk image
 * carries exactly the agent that manifest names, still under the agent
 * release's own signature, for this architecture.
 */
export async function macFirstInstallVerify({ application, dmg, zip, architecture }) {
    const resources = join(application, "Contents", "Resources", "happy-agent");
    const entries = await readdir(resources);
    if (entries.length !== 1 || entries[0] !== "happy-agent.json")
        throw new Error(`${resources} must hold only the agent manifest: ${entries.join(", ")}.`);
    const manifestText = await readFile(join(resources, "happy-agent.json"), "utf8");
    const manifest = JSON.parse(manifestText);
    const { stdout: zipEntries } = await exec("/usr/bin/zipinfo", ["-1", zip], {
        maxBuffer: 64 * 1024 * 1024,
    });
    if (
        zipEntries
            .split("\n")
            .some((entry) => /\/Resources\/happy-agent\/happy-agent$/u.test(entry))
    )
        throw new Error(`${zip} carries the Happy Agent binary.`);

    const mountPoint = await mkdtemp(join(tmpdir(), "happy-dmg-"));
    await exec("/usr/bin/hdiutil", [
        "attach",
        "-nobrowse",
        "-noautoopen",
        "-readonly",
        "-mountpoint",
        mountPoint,
        dmg,
    ]);
    try {
        const imageApplication = (await readdir(mountPoint)).find((name) => name.endsWith(".app"));
        if (imageApplication === undefined) throw new Error(`${dmg} holds no app.`);
        const imageManifest = await readFile(
            join(
                mountPoint,
                imageApplication,
                "Contents",
                "Resources",
                "happy-agent",
                "happy-agent.json",
            ),
            "utf8",
        );
        if (imageManifest !== manifestText)
            throw new Error(`${dmg} holds an app naming another Happy Agent.`);
        const binary = join(mountPoint, ".happy-agent", "happy-agent");
        if ((await sha256(binary)) !== manifest.sha256)
            throw new Error(`${dmg}'s Happy Agent does not match its manifest.`);
        await exec("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", binary]);
        const { stdout: architectures } = await exec("/usr/bin/lipo", ["-archs", binary]);
        const expected = architecture === "arm64" ? "arm64" : "x86_64";
        if (architectures.trim() !== expected)
            throw new Error(`${dmg}'s Happy Agent is not ${expected}.`);
        console.log(
            `${dmg} carries Happy Agent ${manifest.version} (${expected}); the app does not.`,
        );
    } finally {
        await exec("/usr/bin/hdiutil", ["detach", mountPoint]).catch(() =>
            exec("/usr/bin/hdiutil", ["detach", "-force", mountPoint]),
        );
        await rm(mountPoint, { force: true, recursive: true });
    }
}

async function sha256(path) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
}
