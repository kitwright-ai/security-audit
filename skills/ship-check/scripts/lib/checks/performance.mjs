import { blankComments, isTestFile, locate } from "../files.mjs";
import { collector, withLocations } from "../items.mjs";

const LARGE_BYTES = 1024 * 1024;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** @param {import("../project.mjs").Context} ctx */
export function checkPerformance(ctx) {
  const { items, pass, warn } = collector("performance");
  const jsx = ctx.sourceFiles.filter((f) => /\.[jt]sx$/.test(f.path) || /\.js$/.test(f.path));

  // 1. Raw <img> instead of next/image.
  if (ctx.isNext) {
    const imgs = [];
    for (const file of jsx) {
      // OG/icon generation (next/og) renders plain <img> by design.
      if (/from\s+["']next\/og["']/.test(file.content)) continue;
      if (/(^|\/)(opengraph-image|twitter-image|icon|apple-icon)\.[jt]sx?$/.test(file.path))
        continue;
      const code = blankComments(file.content);
      for (const m of code.matchAll(/<img\b/g)) {
        const loc = locate(file, m.index);
        const above = file.lines[loc.line - 2] ?? "";
        if (/no-img-element/.test(above) || /no-img-element/.test(file.lines[loc.line - 1] ?? "")) {
          continue; // reviewed and silenced on purpose
        }
        imgs.push(loc);
      }
    }
    if (imgs.length === 0) pass("raw-img", "No raw `<img>` tags (images go through `next/image`)");
    else {
      warn(
        "raw-img",
        `${imgs.length} raw \`<img>\` tag${imgs.length === 1 ? "" : "s"} instead of \`next/image\``,
        {
          ...withLocations(imgs),
          why: "Raw images ship at full size to phones, load without lazy-loading and shift the layout as they appear: the usual cause of a poor Lighthouse/Core Web Vitals score.",
          fix: "Use `<Image>` from `next/image` with `width`/`height` (or `fill` + `sizes`). Add remote hosts to `images.remotePatterns`.",
        },
      );
    }
  }

  // 2. Fonts.
  const fontLinks = [];
  const styles = ctx.files.filter((f) => /\.(css|scss|html)$/.test(f.path) && !isTestFile(f.path));
  for (const file of [...ctx.sourceFiles, ...styles]) {
    for (const m of file.content.matchAll(/fonts\.googleapis\.com/g))
      fontLinks.push(locate(file, m.index));
  }
  const usesNextFont = ctx.sourceFiles.some((f) => /from\s+["']next\/font\//.test(f.content));
  if (fontLinks.length > 0) {
    warn("external-fonts", "Google Fonts loaded from fonts.googleapis.com", {
      ...withLocations(fontLinks),
      why: "An extra blocking request to a third-party domain on every page: slower first paint, layout shift when the font swaps, and visitor IPs sent to Google (a GDPR complaint in the EU).",
      fix: ctx.isNext
        ? "Use `next/font/google`: it self-hosts the font at build time with no layout shift."
        : "Self-host the font files.",
    });
  } else if (usesNextFont) pass("external-fonts", "Fonts are self-hosted with `next/font`");
  else pass("external-fonts", "No external font stylesheets");

  // 3. Large files in public/.
  const large = ctx.paths.filter((p) => /^public\//.test(p.path) && p.size > LARGE_BYTES);
  if (large.length === 0) pass("large-assets", "No files over 1 MB in `public/`");
  else {
    warn(
      "large-assets",
      `${large.length} file${large.length === 1 ? "" : "s"} over 1 MB in \`public/\``,
      {
        ...withLocations(
          large.map((p) => ({ file: p.path, snippet: mb(p.size) })),
          20,
        ),
        why: "Files in `public/` are served as-is, without resizing or compression; one hero image or video can be most of the page weight on mobile.",
        fix: "Compress images (WebP/AVIF) and serve them with `next/image`; host videos on a video CDN or compress them heavily; remove unused files.",
      },
    );
  }
  return items;
}
