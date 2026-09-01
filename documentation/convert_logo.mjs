import sharp from "file:///C:/Users/lhz_d/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs";
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Input and output paths are required");
await sharp(input, { density: 220 }).resize({ width: 1500, withoutEnlargement: false }).png().toFile(output);
