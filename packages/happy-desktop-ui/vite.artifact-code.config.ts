import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/** One self-contained module: artifact guests never fetch grammars or themes from the web. */
export default defineConfig({
    publicDir: false,
    build: {
        outDir: "dist/artifact-code",
        lib: {
            entry: fileURLToPath(new URL("./src/artifactCodeRenderer.ts", import.meta.url)),
            formats: ["es"],
            fileName: () => "code.js",
        },
        rolldownOptions: {
            output: { codeSplitting: false },
        },
    },
});
