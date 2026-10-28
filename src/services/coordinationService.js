const OPEN_REPORT_STATUSES = new Set(["Submitted", "Under Review", "Assigned", "In Progress"]);

/** Deterministic coordination suggestions; never dispatches or changes records. */
export function buildCoordinationSuggestions({ reports = [], resources = [], assignments = [], tasks = [], risks = [], now = new Date() }) {
  const suggestions = [];
  const assignedReportIds = new Set(assignments.filter((a) => !["Cancelled", "Completed", "Resolved"].includes(a.status)).map((a) => String(a.report_id ?? a.disaster_report_id ?? "")));
  const reportTitleById = new Map(reports.map((r) => [String(r.id), r.title]));

  for (const report of reports) {
    if (!OPEN_REPORT_STATUSES.has(report.status)) continue;
    if (["Critical", "High"].includes(report.severity)) {
      suggestions.push({
        id: `priority-${report.id}`,
        priority: report.severity === "Critical" ? "Critical" : "High",
        title: `Review ${report.severity.toLowerCase()}-severity report`,
        detail: `${report.title} · ${report.location_text || "Location not supplied"}`,
        reason: `The incident is ${report.severity.toLowerCase()} severity and remains ${report.status || "open"}. A coordinator should verify the report and decide the next action.`,
        reportId: report.id,
        action: "Review report",
      });
    }
    if (["Critical", "High"].includes(report.severity) && !assignedReportIds.has(String(report.id))) {
      suggestions.push({
        id: `resource-${report.id}`,
        priority: report.severity === "Critical" ? "Critical" : "High",
        title: "Check whether response resources are assigned",
        detail: report.title,
        reason: "No active resource assignment was found for this incident in the records available to the assistant. This is a suggestion, not a dispatch action.",
        reportId: report.id,
        action: "Review assignments",
      });
    }
  }

  for (const resource of resources) {
    const quantity = Number(resource.quantity);
    if (Number.isFinite(quantity) && quantity <= 2) {
      suggestions.push({
        id: `stock-${resource.id}`,
        priority: quantity <= 0 ? "High" : "Medium",
        title: quantity <= 0 ? "Resource appears depleted" : "Check low resource stock",
        detail: `${resource.resource_name || resource.resource_type || "Resource"} · ${resource.location_text || "Location not supplied"} · quantity ${quantity}`,
        reason: "The inventory quantity is low. Confirm the physical inventory before making allocation decisions.",
        action: "Review inventory",
      });
    }
  }

  for (const task of tasks) {
  if (["Resolved", "Completed"].includes(task.status)) continue;

  // Use created_at because recovery_tasks has no due_at column.
  if (!task.created_at) continue;

  const created = Date.parse(task.created_at);

  if (!Number.isFinite(created)) continue;

  const ageDays = Math.floor(
    (now.getTime() - created) / (1000 * 60 * 60 * 24)
  );

  // Flag older, unfinished tasks for human review.
  if (ageDays >= 7) {
    suggestions.push({
      id: `follow-up-${task.id}`,
      priority: ageDays >= 14 ? "High" : "Medium",
      title: "Review an outstanding recovery task",
      detail: `${task.title} · ${task.location || "Location not supplied"}`,
      reason: `This task was created ${ageDays} days ago and is not marked complete. No deadline is recorded in the current database schema. Ask the responsible team to verify its status and urgency.`,
      action: "Review recovery",
    });
  }
}

  for (const risk of risks) {
    if (!["Critical", "High"].includes(risk.risk_level)) continue;
    const reportTitle = reportTitleById.get(String(risk.disaster_report_id));
    suggestions.push({
      id: `risk-${risk.id}`,
      priority: risk.risk_level,
      title: `Review ${risk.risk_level.toLowerCase()} rule-based assessment`,
      detail: reportTitle || `${risk.disaster_type || "Disaster"} · score ${risk.risk_score ?? "unknown"}`,
      reason: "A saved prototype assessment was marked high or critical. Verify the inputs and compare them with official information before action.",
      reportId: risk.disaster_report_id,
      action: "Review assessment",
    });
  }

  const rank = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  suggestions.sort((a, b) => (rank[b.priority] || 0) - (rank[a.priority] || 0) || a.title.localeCompare(b.title));

  if (!suggestions.length) {
    suggestions.push({
      id: "all-clear-review",
      priority: "Info",
      title: "No immediate rule-based follow-up found",
      detail: "The available database records did not trigger the assistant's current rules.",
      reason: "This does not mean the area is safe. Continue monitoring official sources and review new reports as they arrive.",
      action: "Refresh workspace",
    });
  }

  return suggestions;
}
