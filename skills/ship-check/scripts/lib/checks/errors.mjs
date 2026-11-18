import { collector } from "../items.mjs";

const EXT = "\\.[jt]sx?$";
const CLIENT = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;

/** @param {import("../project.mjs").Context} ctx */
export function checkErrors(ctx) {
  const { items, pass, fail, warn } = collector("errors");
  if (!ctx.isNext) return items;
  const find = (re) => ctx.paths.find((p) => re.test(p.path));

  if (ctx.appDir) {
    const dir = ctx.appDir.replace("/", "\\/");
    const pages = [
      {
        check: "error-boundary",
        re: new RegExp(`^${dir}\\/error${EXT}`),
        name: "error.tsx",
        why: "Without it, any exception in a server or client component replaces the whole page with Next.js's bare 'Application error' screen, with no way back.",
        fix: `Add \`${ctx.appDir}/error.tsx\` (a client component with a friendly message and a \`reset()\` button). Add more in route segments that can fail on their own.`,
      },
      {
        check: "global-error",
        re: new RegExp(`^${dir}\\/global-error${EXT}`),
        name: "global-error.tsx",
        why: "`error.tsx` cannot catch errors thrown by the root layout itself; `global-error.tsx` is the last line of defense.",
        fix: `Add \`${ctx.appDir}/global-error.tsx\` (client component that renders its own \`<html>\` and \`<body>\`).`,
      },
      {
        check: "not-found",
        re: new RegExp(`^${dir}\\/not-found${EXT}`),
        name: "not-found.tsx",
        why: "Broken links and old URLs show the default unstyled 404 page, without your navigation or a way back.",
        fix: `Add \`${ctx.appDir}/not-found.tsx\` with your layout and a link home.`,
      },
    ];
    for (const page of pages) {
      const found = find(page.re);
      if (!found) {
        warn(page.check, `No \`${ctx.appDir}/${page.name}\``, { why: page.why, fix: page.fix });
        continue;
      }
      const file = ctx.files.find((f) => f.path === found.path);
      if (page.check !== "not-found" && file && !CLIENT.test(file.content)) {
        fail(page.check, `\`${found.path}\` is missing \`"use client"\``, {
          file: found.path,
          line: 1,
          why: "Error boundaries must be client components; without the directive the build fails or the boundary never renders.",
          fix: 'Add `"use client";` as the first line.',
        });
        continue;
      }
      pass(page.check, `\`${found.path}\` present`);
    }

    const loading = find(new RegExp(`^${dir}\\/(.+\\/)?loading${EXT}`));
    if (loading) pass("loading-states", `Loading UI present (\`${loading.path}\`)`);
    else {
      warn("loading-states", "No `loading.tsx` in any route", {
        why: "Pages that fetch data show nothing while they load; on a slow connection users think the app is broken and click again.",
        fix: "Add `loading.tsx` (a skeleton or spinner) to the route segments that fetch data. Ignore this if every page is static.",
      });
    }
  } else if (ctx.pagesDir) {
    const dir = ctx.pagesDir.replace("/", "\\/");
    const error = find(new RegExp(`^${dir}\\/(_error|500)${EXT}`));
    const notFound = find(new RegExp(`^${dir}\\/404${EXT}`));
    if (error) pass("error-boundary", `\`${error.path}\` present`);
    else {
      warn("error-boundary", `No \`${ctx.pagesDir}/_error\` or \`${ctx.pagesDir}/500\` page`, {
        why: "Server errors show the default unstyled error page.",
        fix: `Add \`${ctx.pagesDir}/500.tsx\` with your layout and a way back.`,
      });
    }
    if (notFound) pass("not-found", `\`${notFound.path}\` present`);
    else {
      warn("not-found", `No \`${ctx.pagesDir}/404\` page`, {
        why: "Broken links show the default unstyled 404 page.",
        fix: `Add \`${ctx.pagesDir}/404.tsx\` with your layout and a link home.`,
      });
    }
  }
  return items;
}
