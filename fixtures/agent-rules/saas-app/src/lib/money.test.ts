import { expect, it } from "vitest";
import { formatCents } from "./money";

it("formats cents", () => {
  expect(formatCents(1250)).toBe("$12.50");
});
