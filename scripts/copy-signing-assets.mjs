import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src", "signing", "assets");
const OUT_DIR = path.join(ROOT, "dist", "signing", "assets");

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

