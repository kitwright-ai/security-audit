/** Order matters: it is the sort order and the `--fail-on` scale (fail is worst). */
export const STATUSES = ["fail", "warn", "manual", "pass"];

export const AREAS = {
  build: "Build hygiene",
  config: "Configuration",
  errors: "Error handling and UX",
  seo: "SEO and sharing",
  performance: "Performance",
  security: "Security basics",
  observability: "Observability",
  data: "Data",
  legal: "Legal and trust",
  email: "Email",
  launch: "Launch day (manual)",
};

/**
 * @typedef {{ file: string; line?: number; snippet?: string }} Location
 * @typedef {{
 *   check: string; area: keyof typeof AREAS; status: "fail" | "warn" | "manual" | "pass";
 *   title: string; file?: string; line?: number; snippet?: string; locations?: Location[];
 *   why?: string; fix?: string;
 * }} Item
 */

/** Collects items for one area; `pass`/`fail`/... return nothing so checks read linearly. */
export function collector(area) {
  /** @type {Item[]} */
  const items = [];
  const push =
    (status) =>
    (check, title, details = {}) => {
      items.push({ check, area, status, title, ...details });
    };
  return {
    items,
    pass: push("pass"),
    fail: push("fail"),
    warn: push("warn"),
    manual: push("manual"),
  };
}

/** Keeps the first location as `file`/`line`/`snippet` and up to `max` in `locations`. */
export function withLocations(locations, max = 8) {
  if (locations.length === 0) return {};
  const [first] = locations;
  return {
    file: first.file,
    ...(first.line ? { line: first.line } : {}),
    ...(first.snippet ? { snippet: first.snippet } : {}),
    ...(locations.length > 1 ? { locations: locations.slice(0, max) } : {}),
  };
}
