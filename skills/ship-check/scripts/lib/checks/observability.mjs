import { blankComments, locate } from "../files.mjs";
import { collector, withLocations } from "../items.mjs";

const ERROR_TRACKING = [
  [/^@sentry\//, "Sentry"],
  [/^@bugsnag\//, "Bugsnag"],
  [/^rollbar$/, "Rollbar"],
  [/^@honeybadger-io\//, "Honeybadger"],
  [/^@highlight-run\//, "Highlight"],
  [/^@datadog\/|^dd-trace$/, "Datadog"],
  [/^@appsignal\//, "AppSignal"],
  [/^newrelic$|^@newrelic\//, "New Relic"],
  [/^posthog-(js|node)$/, "PostHog"],
  [/^@vercel\/otel$|^@opentelemetry\//, "OpenTelemetry"],
];
const LOGGERS = [
  [/^pino$|^pino-/, "pino"],
  [/^winston$/, "winston"],
  [/^next-axiom$|^@axiomhq\//, "Axiom"],
  [/^@logtail\/|^@betterstack\//, "Better Stack"],
  [/^consola$/, "consola"],
];

/** Scripts, seeds and migrations are CLI tools: console output is expected there. */
const CLI_FILE =
  /(^|\/)(scripts|migrations|seed|seeds|drizzle|prisma|supabase)\/|(^|\/)seed\.[mc]?[jt]s$/;

/** @param {import("../project.mjs").Context} ctx */
export function checkObservability(ctx) {
  const { items, pass, warn } = collector("observability");
  const deps = Object.keys(ctx.deps);
  const detect = (list) => [
    ...new Set(list.filter(([re]) => deps.some((d) => re.test(d))).map(([, name]) => name)),
  ];

  // 1. Error tracking / structured logging.
  const trackers = detect(ERROR_TRACKING);
  const loggers = detect(LOGGERS);
  const instrumentation = ctx.paths.find((p) => /^(src\/)?instrumentation\.[jt]s$/.test(p.path));
  if (trackers.length > 0) pass("error-tracking", `Error tracking: ${trackers.join(", ")}`);
  else if (loggers.length > 0) {
    pass(
      "error-tracking",
      `Structured logging: ${loggers.join(", ")} (no error tracker; make sure errors are alerted on)`,
    );
  } else if (instrumentation) {
    pass(
      "error-tracking",
      `Instrumentation hook present (\`${instrumentation.path}\`); confirm it reports errors`,
    );
  } else {
    warn("error-tracking", "No error tracking or structured logging", {
      why: "When something breaks after launch you find out from the client, with no stack trace, no request and no idea how many users were affected.",
      fix: "Add an error tracker (Sentry's free tier is enough to start: `npx @sentry/wizard@latest -i nextjs`) or at least a structured logger whose output your host keeps and alerts on.",
    });
  }

  // 2. Leftover console.log.
  const logs = [];
  for (const file of ctx.sourceFiles) {
    if (CLI_FILE.test(file.path)) continue;
    const code = blankComments(file.content);
    for (const m of code.matchAll(/\bconsole\.(log|debug|trace|dir)\s*\(/g))
      logs.push(locate(file, m.index));
  }
  if (logs.length === 0) pass("console-log", "No `console.log` left in app code");
  else {
    const filesWithLogs = new Set(logs.map((l) => l.file)).size;
    warn(
      "console-log",
      `${logs.length} \`console.log\` call${logs.length === 1 ? "" : "s"} in ${filesWithLogs} file${filesWithLogs === 1 ? "" : "s"}`,
      {
        ...withLocations(logs),
        why: "Debug logging left in by the agent: noise in production logs, and on the server it often prints request bodies, tokens or personal data.",
        fix: "Remove debug logs; keep intentional ones as `console.error`/`console.warn` or a logger, and never log secrets or full request bodies.",
      },
    );
  }
  return items;
}
