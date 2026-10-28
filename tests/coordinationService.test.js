import test from "node:test";
import assert from "node:assert/strict";
import { buildCoordinationSuggestions } from "../src/services/coordinationService.js";

test("assistant prioritizes high-severity unassigned reports", () => {
  const suggestions = buildCoordinationSuggestions({
    reports: [{ id: "r1", title: "Flood near road", location_text: "Chennai", severity: "Critical", status: "Submitted" }],
    resources: [], assignments: [], tasks: [], risks: [],
  });
  assert.ok(suggestions.some((s) => s.id === "priority-r1"));
  assert.ok(suggestions.some((s) => s.id === "resource-r1"));
  assert.equal(suggestions[0].priority, "Critical");
});

test("assistant suggests follow-up for overdue recovery tasks", () => {
  const now = new Date("2026-10-26T10:00:00Z");
  const suggestions = buildCoordinationSuggestions({
    reports: [], resources: [], assignments: [], risks: [],
    tasks: [{ id: "t1", title: "Restore water supply", location: "Chennai", status: "In Progress", due_at: "2026-10-25T10:00:00Z" }],
    now,
  });
  assert.ok(suggestions.some((s) => s.id === "overdue-t1"));
});

test("assistant returns a safe informational fallback for empty data", () => {
  const suggestions = buildCoordinationSuggestions({ reports: [], resources: [], assignments: [], tasks: [], risks: [] });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].priority, "Info");
});
