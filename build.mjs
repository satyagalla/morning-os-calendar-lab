import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: ["obsidian"],
  metafile: true,
  minify: true,
});
for (const output of Object.values(result.metafile.outputs)) {
  for (const dependency of output.imports) {
    if (dependency.external && dependency.path !== "obsidian") {
      throw new Error(`Unexpected runtime dependency: ${dependency.path}`);
    }
  }
}
console.log("Browser build passed; Obsidian is the only external runtime dependency.");
