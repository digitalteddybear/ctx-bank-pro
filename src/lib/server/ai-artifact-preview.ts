import { Worker } from "node:worker_threads";
import type { AIWorkspaceArtifact } from "@/lib/ai-workspace-contract";

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;
const BUILD_TIMEOUT_MS = 5_000;
const previewWorker = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const path = require("node:path");
const esbuild = require("esbuild");
(async () => {
  const files = new Map(workerData.files.map(file => ["/artifact/" + file.path, file.content]));
  const entry = workerData.entry;
  const extLoader = file => ({".tsx":"tsx",".ts":"ts",".jsx":"jsx",".js":"js",".css":"css"}[path.extname(file)] || "text");
  const plugin = {name:"ctx-artifact-input",setup(build) {
    build.onResolve({filter:/.*/}, args => {
      if (args.kind === "entry-point") return {path:"/artifact/ctx-preview-entry.tsx"};
      if (args.importer.startsWith("/artifact/") && args.path.startsWith(".")) {
        const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(args.importer), args.path));
        const options = [candidate, candidate+".tsx", candidate+".ts", candidate+".jsx", candidate+".js", candidate+".css", path.posix.join(candidate,"index.tsx"), path.posix.join(candidate,"index.ts")];
        const match = options.find(option => files.has(option));
        return match ? {path:match} : {errors:[{text:"Artifact import is not present in this version: " + args.path}]};
      }
      if (args.importer.startsWith("/artifact/")) {
        if (["react","react-dom","react-dom/client","react/jsx-runtime","react/jsx-dev-runtime"].includes(args.path)) return {path:require.resolve(args.path)};
        return {errors:[{text:"External imports are blocked in artifact previews: " + args.path}]};
      }
      return undefined;
    });
    build.onLoad({filter:/^\/artifact\//}, args => {
      if (args.path === "/artifact/ctx-preview-entry.tsx") return {contents:"import React from 'react'; import {createRoot} from 'react-dom/client'; import Component from './" + entry + "'; const mount = document.getElementById('root'); if (!mount) throw new Error('Preview mount was not found.'); createRoot(mount).render(React.createElement(Component));",loader:"tsx",resolveDir:"/artifact"};
      const contents = files.get(args.path);
      if (contents === undefined) return {errors:[{text:"Artifact source file is unavailable."}]};
      return {contents, loader:extLoader(args.path), resolveDir:path.posix.dirname(args.path)};
    });
  }};
  const result = await esbuild.build({entryPoints:["virtual:entry"],outfile:"preview.js",bundle:true,write:false,platform:"browser",format:"iife",target:["es2020"],jsx:"automatic",minify:false,sourcemap:false,legalComments:"none",define:{"process.env.NODE_ENV":JSON.stringify("production")},plugins:[plugin],logLevel:"silent"});
  const js = result.outputFiles.find(file => file.path.endsWith(".js"))?.text || "";
  const css = result.outputFiles.find(file => file.path.endsWith(".css"))?.text || "";
  parentPort.postMessage({ok:true,js,css,warnings:result.warnings.map(warning => warning.text)});
})().catch(error => parentPort.postMessage({ok:false,error:error instanceof Error ? error.message : "Preview compilation failed."}));
`;
export class ArtifactPreviewError extends Error { constructor(message: string, public readonly status = 400) { super(message); } }
export type ArtifactPreview = { javascript: string; css: string; diagnostics: string[]; sourceVersion: number };
export async function compileArtifactPreview(artifact: AIWorkspaceArtifact): Promise<ArtifactPreview> {
  if (!artifact.version || artifact.status === "archived") throw new ArtifactPreviewError("This artifact version cannot be previewed.", 404);
  if (artifact.type !== "react-ui" && artifact.type !== "code") throw new ArtifactPreviewError("Only React and code artifacts can be compiled.", 400);
  const totalBytes = artifact.version.files.reduce((total, file) => total + Buffer.byteLength(file.content), 0);
  if (totalBytes > MAX_SOURCE_BYTES) throw new ArtifactPreviewError("Preview source exceeds the 2 MB limit.", 413);
  const entry = artifact.version.files.find(file => /(^|\/)(index|main|App)\.(tsx|jsx|ts|js)$/.test(file.path))?.path ?? artifact.version.files.find(file => /\.(tsx|jsx|ts|js)$/.test(file.path))?.path;
  if (!entry) throw new ArtifactPreviewError("No React or JavaScript entry file was found.", 422);
  return new Promise((resolve, reject) => {
    const worker = new Worker(previewWorker, {eval:true,workerData:{files:artifact.version!.files,entry},resourceLimits:{maxOldGenerationSizeMb:128,stackSizeMb:4}});
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; void worker.terminate(); reject(new ArtifactPreviewError("Preview compilation exceeded 5 seconds.", 408)); } }, BUILD_TIMEOUT_MS);
    worker.once("message", (raw: unknown) => {
      if (settled) return; settled = true; clearTimeout(timer); void worker.terminate();
      if (typeof raw !== "object" || raw === null || !("ok" in raw) || typeof raw.ok !== "boolean") { reject(new ArtifactPreviewError("Preview compiler returned an invalid result.", 500)); return; }
      if (!raw.ok) { reject(new ArtifactPreviewError("error" in raw && typeof raw.error === "string" ? raw.error.slice(0,1000) : "Preview compilation failed.", 422)); return; }
      if (!("js" in raw) || typeof raw.js !== "string" || !("css" in raw) || typeof raw.css !== "string" || Buffer.byteLength(raw.js) + Buffer.byteLength(raw.css) > MAX_BUNDLE_BYTES) { reject(new ArtifactPreviewError("Compiled preview exceeds the 4 MB limit.", 413)); return; }
      const diagnostics = "warnings" in raw && Array.isArray(raw.warnings) ? raw.warnings.filter((item): item is string => typeof item === "string").slice(0,20) : [];
      resolve({javascript:raw.js,css:raw.css,diagnostics,sourceVersion:artifact.version!.version});
    });
    worker.once("error", error => { if (settled) return; settled = true; clearTimeout(timer); reject(new ArtifactPreviewError(error.message.slice(0,1000), 422)); });
    worker.once("exit", code => { if (!settled && code !== 0) { settled = true; clearTimeout(timer); reject(new ArtifactPreviewError("Preview compiler exited unexpectedly.", 422)); } });
  });
}
