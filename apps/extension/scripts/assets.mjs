// Generates static extension assets into public/ (gitignored) from the brand sources in packages/config/assets:
//  - icons/icon-{16,32,48,128}.png  ← whichless-mark.png (trimmed, centered on a transparent square)
//  - brand/logo.png, brand/logo-white.png ← whichless-logo(-white).png (trimmed, 64 px high = 2× the popup header size)
//  - fonts/plus-jakarta-sans-latin-wght-normal.woff2 ← @fontsource-variable/plus-jakarta-sans (bundled, never fetched at runtime)
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const brandAssets = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/config/assets");

export const ICON_SIZES = [16, 32, 48, 128];
export const FONT_FILE = "plus-jakarta-sans-latin-wght-normal.woff2";
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function icon(size, out) {
  // Small icons get less padding so the mark stays legible at 16 px.
  const pad = size <= 16 ? 0 : Math.round(size * 0.06);
  const inner = size - pad * 2;
  const mark = await sharp(join(brandAssets, "whichless-mark.png"))
    .trim({ threshold: 10 })
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: TRANSPARENT } })
    .composite([{ input: mark, top: pad, left: pad }])
    .png({ compressionLevel: 9 })
    .toFile(out);
}

async function logo(src, out) {
  await sharp(join(brandAssets, src)).trim({ threshold: 10 }).resize({ height: 64 }).png({ compressionLevel: 9 }).toFile(out);
}

export async function generateAssets(publicDir) {
  mkdirSync(join(publicDir, "icons"), { recursive: true });
  mkdirSync(join(publicDir, "brand"), { recursive: true });
  mkdirSync(join(publicDir, "fonts"), { recursive: true });
  for (const size of ICON_SIZES) await icon(size, join(publicDir, "icons", `icon-${size}.png`));
  await logo("whichless-logo.png", join(publicDir, "brand", "logo.png"));
  await logo("whichless-logo-white.png", join(publicDir, "brand", "logo-white.png"));
  const fontPkg = dirname(require.resolve("@fontsource-variable/plus-jakarta-sans/package.json"));
  copyFileSync(join(fontPkg, "files", FONT_FILE), join(publicDir, "fonts", FONT_FILE));
  copyFileSync(join(fontPkg, "LICENSE"), join(publicDir, "fonts", "LICENSE-plus-jakarta-sans.txt"));
}
