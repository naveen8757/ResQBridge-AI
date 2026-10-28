
import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { supabase } from "./supabase";

export default function ResourceAssignments() {
  const [reports, setReports] = useState([]);
  const [resources, setResources] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    report_id: "",
    resource_id: "",
    quantity_assigned: 1,
    notes: "",
  });

  
async function loadData() {
  if (!supabase) {
    setMessage("Supabase is not configured.");
    setLoading(false);
    return;
  }

  setLoading(true);

  try {
    const [reportResult, resourceResult, assignmentResult] =
      await Promise.all([
        supabase
          .from("disaster_reports")
          .select("id, title, disaster_type, location_text, severity")
          .order("created_at", { ascending: false }),

        supabase
          .from("response_resources")
          .select(
            "id, resource_name, resource_type, quantity, location_text, availability"
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("resource_assignments")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

    const error =
      reportResult.error ||
      resourceResult.error ||
      assignmentResult.error;

    if (error) throw error;

    setReports(reportResult.data || []);
    setResources(resourceResult.data || []);
    setAssignments(assignmentResult.data || []);
  } catch (error) {
    console.error("Failed to load assignment data:", error);
    setMessage(error.message || "Unable to load assignment data.");
  } finally {
    setLoading(false);
  }
}


  useEffect(() => {
    loadData();
  }, []);

  
async function handleSubmit(event) {
  event.preventDefault();
  setMessage("");

  if (!form.report_id || !form.resource_id) {
    setMessage("Please select a disaster report and a resource.");
    return;
  }

  const selectedResource = resources.find(
    (resource) => String(resource.id) === String(form.resource_id)
  );

  const quantity = Number(form.quantity_assigned);

  if (!selectedResource) {
    setMessage("Please select a valid resource.");
    return;
  }

  if (
    String(selectedResource.availability).trim().toLowerCase() !==
    "available"
  ) {
    setMessage("Please choose a resource marked Available.");
    return;
  }

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > Number(selectedResource.quantity)
  ) {
    setMessage(
      `Enter a whole number from 1 to ${selectedResource.quantity}.`
    );
    return;
  }

  setSaving(true);

  try {
    const { data: userData, error: userError } =
      await supabase.auth.getUser();

    if (userError) throw userError;
    if (!userData.user) {
      throw new Error("Please sign in first.");
    }

    const { error } = await supabase.rpc("assign_resource", {
      p_report_id: form.report_id,
      p_resource_id:(form.resource_id),
      p_quantity: quantity,
      p_notes: form.notes.trim(),
    });

    if (error) throw error;

    setMessage("Resource assigned successfully!");

    setForm({
      report_id: "",
      resource_id: "",
      quantity_assigned: 1,
      notes: "",
    });

    await loadData();
  } catch (error) {
    console.error("Resource assignment failed:", error);
    setMessage(error.message || "Unable to create assignment.");
  } finally {
    setSaving(false);
  }
}

  return (
    <section className="reports-page">
      <div className="reports-heading">
        <div>
          <p className="eyebrow">RESPONSE PLANNING</p>
          <h2>Resource Assignments</h2>
          <p>Connect registered resources with reported disasters.</p>
        </div>
        <ClipboardList size={30} />
      </div>

      <form className="report-form" onSubmit={handleSubmit}>
        <label htmlFor="report_id">Disaster report</label>
        <select
          id="report_id"
          value={form.report_id}
          onChange={(event) =>
            setForm({ ...form, report_id: event.target.value })
          }
          required
        >
          <option value="">Select a disaster report</option>
          {reports.map((report) => (
            <option key={report.id} value={report.id}>
              {report.title} — {report.disaster_type} ({report.severity})
            </option>
          ))}
        </select>

        <label htmlFor="resource_id">Available resource</label>

<p>
  Resources loaded: {resources.length} | Available: {
    resources.filter(
      (resource) =>
        resource.availability?.trim().toLowerCase() === "available"
    ).length
  }
</p>

        <select
          id="resource_id"
          value={form.resource_id}
          onChange={(event) =>
            setForm({
              ...form,
              resource_id: event.target.value,
              quantity_assigned: 1,
            })
          }
          required
        >
          <option value="">Select a resource</option>
          {resources
            .filter(
                (resource) => 
                    resource.availability?.trim().toLowerCase() === "available")
            .map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.resource_name} — {resource.resource_type}
                {" · Qty: "}{resource.quantity}
                {" · "}{resource.location_text}
              </option>
            ))}
        </select>

        <label htmlFor="quantity_assigned">Quantity to assign</label>
        <input
          id="quantity_assigned"
          type="number"
          min="1"
          max={
            resources.find((resource) => String(resource.id) === String(form.resource_id))
              ?.quantity || 1
          }
          step="1"
          value={form.quantity_assigned}
          onChange={(event) =>
            setForm({ ...form, quantity_assigned: event.target.value })
          }
          required
        />

        <label htmlFor="assignment_notes">Assignment notes</label>
        <textarea
          id="assignment_notes"
          value={form.notes}
          onChange={(event) =>
            setForm({ ...form, notes: event.target.value })
          }
          placeholder="Describe the intended response action"
          rows="3"
        />

        {message && (
          <p className="report-message" role="status">
            {message}
          </p>
        )}

        <button
          className="primary-button"
          type="submit"
          disabled={saving || loading}
        >
          {saving ? "Assigning..." : "Assign Resource"}
        </button>
      </form>

      <div className="saved-reports">
        <h3>Assignment History</h3>

        {loading ? (
          <p>Loading assignments...</p>
        ) : assignments.length === 0 ? (
          <p>No resource assignments yet.</p>
        ) : (
          <div className="saved-reports-list">
            {assignments.map((assignment) => {
              const report = reports.find(
                (item) => item.id === assignment.report_id
              );

              const resource = resources.find(
                (item) => item.id === assignment.resource_id
              );

              return (
                <article
                  className="saved-report-card"
                  key={assignment.id}
                >
                  <div className="saved-report-header">
                    <h4>{resource?.resource_name || "Resource"}</h4>
                    <span>{assignment.status}</span>
                  </div>

                  <p>
                    Report: {report?.title || "Report unavailable"}
                  </p>
                  <p>
                    Quantity assigned: {assignment.quantity_assigned}
                  </p>
                  {assignment.notes && <p>{assignment.notes}</p>}

                  <div className="saved-report-footer">
                    <span>
                      {new Date(assignment.created_at).toLocaleString()}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
