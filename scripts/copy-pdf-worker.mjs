import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = resolve(projectRoot, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const publicDirectory = resolve(projectRoot, "public");

mkdirSync(publicDirectory, { recursive: true });
copyFileSync(workerPath, resolve(publicDirectory, "pdf.worker.min.mjs"));
