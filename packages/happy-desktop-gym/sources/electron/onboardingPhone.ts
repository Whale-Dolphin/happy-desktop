/*
 * FIXTURE — the onboarding scenario's phone. It does what Happy on a phone does
 * once the person scans the pairing code in Happy's chat: the key exchange with
 * the daemon's mobile connector, then its own "the emoji match". It is written
 * from the "Mobile connector" section of Happy Agent's API.md, not from the
 * daemon's code. It never computes the emoji: the person at the window compares
 * them, and this phone always agrees.
 *
 * Only Tailcat is a stand-in, as in Happy Agent's own gym: a script that runs
 * the daemon's command for each loopback connection and publishes a made-up
 * address. Nothing leaves this computer; the phone dials the stand-in where a
 * real phone would dial `server.tailcat` through Tailcat.
 */
import {
    createHash,
    createHmac,
    createPublicKey,
    diffieHellman,
    generateKeyPairSync,
    hkdfSync,
    randomBytes,
    timingSafeEqual,
} from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { HappyAgentClient } from "@slopus/happy-agent-client";

/** The connector's configured port, which its code carries and the daemon never binds. */
const PHONE_PORT = 24_893;
const HANDSHAKE = "/v0/mobile-connector/handshake";
const LABEL = "happy-mobile-pair-v1";
const QR_PREFIX = "happy://direct?";

/** The phone as it describes itself; the chat says "iPhone is paired". */
const PHONE_DEVICE = { name: "iPhone", platform: "ios" } as const;

/**
 * STAND-IN — Tailcat, as `serve exec -- <command>` runs: it makes its key,
 * then runs the command for each connection with the connection as its stdin
 * and stdout, and publishes an address once it accepts them. The command and
 * everything behind it are the daemon's own. Run by this Node, by absolute
 * path, since the daemon's PATH has no Node on it.
 */
const tailcatScript = (node: string, portFile: string) => `#!${node}
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:net";
const args = process.argv.slice(2);
if (args[0] === "genkey") {
    writeFileSync(args.find((value) => value.startsWith("--key=")).slice(6), "key\\n", { mode: 0o600 });
    process.exit(0);
}
if (args.slice(1, 4).join(" ") !== "serve exec --") process.exit(2);
const [command, ...commandArguments] = args.slice(4);
const server = createServer((connection) => {
    const child = spawn(command, commandArguments, { stdio: ["pipe", "pipe", "inherit"] });
    connection.pipe(child.stdin);
    child.stdout.pipe(connection);
    connection.on("error", () => child.kill());
    child.stdin.on("error", () => connection.destroy());
});
// Where it accepts the phone, standing in for \`server.tailcat:<port>\`: a
// port of its own per run, so runs side by side never answer each other's phone.
server.listen(0, "127.0.0.1", () => {
    writeFileSync(${JSON.stringify(portFile)}, String(server.address().port));
    writeFileSync(process.env.TAILCAT_ADDR_FILE, "tcGymOnboardingPhone\\n", { mode: 0o600 });
});
process.on("SIGTERM", () => process.exit(0));
`;

/**
 * The stand-in Tailcat in the run's throwaway root, and what the daemon needs
 * to use it: its environment and the machine configuration for the connector.
 */
export async function onboardingPhoneStandIn(root: string): Promise<{
    readonly environment: Record<string, string>;
    readonly configuration: string;
    /** Where the stand-in writes the loopback port it accepts the phone on. */
    readonly portFile: string;
}> {
    const executable = join(root, "tailcat");
    const portFile = join(root, "tailcat-port");
    await writeFile(executable, tailcatScript(process.execPath, portFile));
    await chmod(executable, 0o755);
    return {
        portFile,
        environment: { HAPPY_AGENT_TAILCAT_PATH: executable },
        configuration: `[feature.mobile_connector]\nport = ${String(PHONE_PORT)}\n`,
    };
}

type QrCode = { readonly v: number; readonly a: string; readonly p: number; readonly t: string };

type HandshakeStatus =
    | { readonly status: "verifying" }
    | { readonly status: "completed"; readonly deviceId: string; readonly mac: string }
    | { readonly status: "rejected" | "expired" };

/**
 * Scans the code Happy's chat shows, once it shows one, and says the emoji
 * match on the phone. Resolves `paired` once the person at the window has
 * confirmed too and the daemon proved it derived the same keys; `undefined`
 * when no code showed within `timeoutMs`.
 */
export async function onboardingPhoneScan(
    daemon: HappyAgentClient,
    portFile: string,
    timeoutMs: number,
): Promise<{ readonly paired: Promise<string> } | undefined> {
    const deadline = Date.now() + timeoutMs;
    let code: string | null = null;
    while (code === null) {
        if (Date.now() > deadline) return undefined;
        // The camera's view of the screen: the code the chat draws from this pairing.
        const { mobileConnector } = await daemon.getMobileConnector();
        code = mobileConnector.pairing?.status === "waiting" ? mobileConnector.pairing.qr : null;
        if (code === null) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!code.startsWith(QR_PREFIX)) throw new Error("Not a direct pairing code.");
    const qr = JSON.parse(
        Buffer.from(code.slice(QR_PREFIX.length), "base64url").toString("utf8"),
    ) as QrCode;
    if (qr.v !== 1) throw new Error(`Unknown pairing code version ${String(qr.v)}.`);
    // Dialled through the stand-in Tailcat, as a phone dials `server.tailcat:<qr.p>`.
    const base = `http://127.0.0.1:${(await readFile(portFile, "utf8")).trim()}`;

    const own = generateKeyPairSync("x25519");
    const ownPublic = Buffer.from(String(own.publicKey.export({ format: "jwk" }).x), "base64url");
    const phoneNonce = randomBytes(32);
    const commitment = sha256(Buffer.from(`${LABEL}/commit`), ownPublic, phoneNonce);
    const started = await phoneRequest<{ handshakeId: string; publicKey: string; nonce: string }>(
        base,
        "POST",
        HANDSHAKE,
        qr.t,
        { commitment: commitment.toString("base64url"), device: PHONE_DEVICE },
    );
    const daemonPublic = Buffer.from(started.publicKey, "base64url");
    const shared = diffieHellman({
        privateKey: own.privateKey,
        publicKey: createPublicKey({
            key: { kty: "OKP", crv: "X25519", x: started.publicKey },
            format: "jwk",
        }),
    });
    if (shared.every((byte) => byte === 0)) throw new Error("Low-order daemon key.");
    const port = Buffer.alloc(2);
    port.writeUInt16BE(qr.p);
    const transcript = sha256(
        Buffer.from(LABEL),
        lp(Buffer.from(qr.t, "base64url")),
        lp(commitment),
        lp(ownPublic),
        lp(daemonPublic),
        lp(phoneNonce),
        lp(Buffer.from(started.nonce, "base64url")),
        lp(Buffer.from(qr.a, "utf8")),
        lp(port),
    );
    const confirmKey = Buffer.from(hkdfSync("sha256", shared, transcript, `${LABEL} confirm`, 32));
    const mac = (role: "mobile" | "daemon") =>
        createHmac("sha256", confirmKey)
            .update(Buffer.concat([Buffer.from(role), transcript]))
            .digest();

    const credential = started.handshakeId;
    const revealed = await phoneRequest<HandshakeStatus>(
        base,
        "POST",
        `${HANDSHAKE}/reveal`,
        credential,
        { publicKey: ownPublic.toString("base64url"), nonce: phoneNonce.toString("base64url") },
    );
    if (revealed.status !== "verifying") throw new Error(`Reveal answered ${revealed.status}.`);
    // The person on the phone says the emoji match.
    const confirmed = await phoneRequest<HandshakeStatus>(
        base,
        "POST",
        `${HANDSHAKE}/confirm`,
        credential,
        { mac: mac("mobile").toString("base64url") },
    );
    const paired = (async () => {
        let status = confirmed;
        while (status.status === "verifying")
            status = await phoneRequest<HandshakeStatus>(
                base,
                "GET",
                `${HANDSHAKE}?wait=25`,
                credential,
            );
        if (status.status !== "completed") throw new Error(`Pairing ended ${status.status}.`);
        const proof = Buffer.from(status.mac, "base64url");
        if (proof.length !== 32 || !timingSafeEqual(proof, mac("daemon")))
            throw new Error("The daemon's confirmation does not match.");
        return status.deviceId;
    })();
    // Read by the scenario; a failure here is noted there, never unhandled.
    paired.catch(() => undefined);
    return { paired };
}

function sha256(...parts: readonly Buffer[]): Buffer {
    return createHash("sha256").update(Buffer.concat(parts)).digest();
}

function lp(value: Buffer): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(value.length);
    return Buffer.concat([length, value]);
}

/** One request on the connector's socket; anything but `200` throws its error code. */
async function phoneRequest<Body>(
    base: string,
    method: "GET" | "POST",
    path: string,
    credential: string,
    body?: unknown,
): Promise<Body> {
    const response = await fetch(`${base}${path}`, {
        method,
        headers: {
            authorization: `Bearer ${credential}`,
            ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (response.status !== 200) {
        const code =
            payload !== null && typeof payload === "object" && "code" in payload
                ? String(payload.code)
                : "unknown";
        throw new Error(`${method} ${path} answered ${String(response.status)} ${code}.`);
    }
    return payload as Body;
}
