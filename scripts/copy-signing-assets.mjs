import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src", "signing", "assets");
const OUT_DIR = path.join(ROOT, "dist", "signing", "assets");
const PDFJS_SRC_DIR = path.join(ROOT, "node_modules", "pdfjs-dist", "build");

function copyFile(fileName) {
  const src = path.join(SRC_DIR, fileName);
  const out = path.join(OUT_DIR, fileName);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-signing-assets] Missing source asset: ${src}`);
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.copyFileSync(src, out);
}

copyFile("logo_crystal.png");

function copyPdfJsFile(fileName) {
  const src = path.join(PDFJS_SRC_DIR, fileName);
  const outDir = path.join(OUT_DIR, "pdfjs");
  const out = path.join(outDir, fileName);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-signing-assets] Missing PDF.js file: ${src}`);
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(src, out);
}

copyPdfJsFile("pdf.mjs");
copyPdfJsFile("pdf.worker.mjs");

