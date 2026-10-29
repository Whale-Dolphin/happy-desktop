import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import snapshot from "./dev/sidebar-variants/snapshot.json" with { type: "json" };

/** Clay icons the snapshot names; the library's other icons are left out of the file. */
const used = new Set(
    snapshot.rows.flatMap((row) =>
        "icon" in row && row.icon?.type === "library" ? [row.icon.slug] : [],
    ),
);

/** Keeps the clay library's glob intact while bundling only the icons on screen. */
function unusedClayIconsDrop(): Plugin {
    return {
        name: "sidebar-variants-unused-clay-icons",
        enforce: "pre",
        load(id) {
            const match = /\/clay-icons\/([a-z0-9-]+)@\d+\.png/u.exec(id);
            if (match && !used.has(match[1]!)) return 'export default "";';
            return undefined;
        },
    };
}

/** Folds the built script and stylesheet into the page, for one self-contained file. */
function singleFile(): Plugin {
    return {
        name: "sidebar-variants-single-file",
        enforce: "post",
        generateBundle(_options, bundle) {
            const html = Object.values(bundle).find(
                (output) => output.type === "asset" && output.fileName.endsWith(".html"),
            );
            if (html?.type !== "asset") return;
            let page = String(html.source);
            for (const [name, output] of Object.entries(bundle)) {
                if (output.type === "chunk" && output.isEntry) {
                    page = page.replace(
                        new RegExp(`<script[^>]*src="[^"]*${output.fileName}"[^>]*></script>`, "u"),
                        () =>
                            `<script type="module">${output.code.replaceAll("</script", "<\\/script")}</script>`,
                    );
                    delete bundle[name];
                } else if (output.type === "asset" && output.fileName.endsWith(".css")) {
                    page = page.replace(
                        new RegExp(`<link[^>]*href="[^"]*${output.fileName}"[^>]*>`, "u"),
                        () => `<style>${String(output.source)}</style>`,
                    );
                    delete bundle[name];
                }
            }
            // Nothing in the sidebar draws math or a photo backdrop: drop their
            // fonts and pictures so the file carries what is on screen.
            html.source = page
                .replace(/@font-face\{[^}]*KaTeX[^}]*\}/gu, "")
                .replace(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/gu, "data:,");
        },
    };
}

export default defineConfig({
    root: fileURLToPath(new URL("./dev/sidebar-variants", import.meta.url)),
    base: "./",
    publicDir: false,
    plugins: [
        unusedClayIconsDrop(),
        tailwindcss(),
        react(),
        babel({ presets: [reactCompilerPreset()] }),
        singleFile(),
    ],
    build: {
        outDir: fileURLToPath(new URL("./dist/sidebar-variants", import.meta.url)),
        emptyOutDir: true,
        assetsInlineLimit: () => true,
        cssCodeSplit: false,
        modulePreload: false,
        rolldownOptions: {
            output: { codeSplitting: false },
        },
    },
});
