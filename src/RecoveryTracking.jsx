
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import {
  ClipboardList,
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import "./RecoveryTracking.css";

const STATUSES = [
  "Submitted",
  "Under Review",
  "Assigned",
  "In Progress",
  "Resolved",
];

const emptyTask = {
  title: "",
  location: "",
  description: "",
  status: "Submitted",
  disaster_report_id: "",
};

export default function RecoveryTracking() {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(emptyTask);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reports, setReports] = useState([]);

  // Load existing disaster reports for the dropdown
  async function loadReports() {
    const { data, error: reportError } = await supabase
      .from("disaster_reports")
      .select("id, title, disaster_type, location_text")
      .order("created_at", { ascending: false });

    if (reportError) {
      setError(
        `Could not load disaster reports: ${reportError.message}`
      );
      return;
    }

    setReports(data || []);
  }

  // Load saved recovery tasks
  async function loadTasks() {
    setLoading(true);
    setError("");

    const { data, error: fetchError } = await supabase
      .from("recovery_tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setTasks([]);
    } else {
      setTasks(data || []);
    }

    setLoading(false);
  }

  // Load data when the page opens
  useEffect(() => {
    loadTasks();
    loadReports();
  }, []);

  // Create a new recovery task
  
async function addTask(event) {
  event.preventDefault();

  const title = form.title.trim();
  const location = form.location.trim();
  const description = form.description.trim();
  const linkedReportId = form.disaster_report_id || null;

  if (!title || !location) {
    setError("Task title and location are required.");
    return;
  }

  setSaving(true);
  setError("");
  setMessage("");

  // Check whether a matching task already exists.
  let duplicateQuery = supabase
    .from("recovery_tasks")
    .select("id")
    .ilike("title", title)
    .ilike("location", location);

  if (linkedReportId) {
    duplicateQuery = duplicateQuery.eq(
      "disaster_report_id",
      linkedReportId
    );
  } else {
    duplicateQuery = duplicateQuery.is(
      "disaster_report_id",
      null
    );
  }

  const { data: existingTasks, error: duplicateError } =
    await duplicateQuery.limit(1);

  if (duplicateError) {
    setSaving(false);
    setError(duplicateError.message);
    return;
  }

  if (existingTasks && existingTasks.length > 0) {
    setSaving(false);
    setError(
      "This recovery task already exists for the selected location and disaster report."
    );
    return;
  }

  // Save the task if no matching task exists.
  const { error: insertError } = await supabase
    .from("recovery_tasks")
    .insert({
      title,
      location,
      description,
      status: form.status,
      disaster_report_id: linkedReportId,
    });

  setSaving(false);

  if (insertError) {
    setError(insertError.message);
    return;
  }

  setForm({ ...emptyTask });
  setShowForm(false);
  setMessage("Recovery task added successfully.");

  await loadTasks();
}


  // Update a task's recovery status
  async function updateStatus(taskId, status) {
    setError("");
    setMessage("");

    const { error: updateError } = await supabase
      .from("recovery_tasks")
      .update({ status })
      .eq("id", taskId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Recovery status updated.");
    await loadTasks();
  }

  const resolvedCount = tasks.filter(
    (task) => task.status === "Resolved"
  ).length;

  const activeCount = tasks.filter(
    (task) => task.status === "In Progress"
  ).length;

  const pendingCount = tasks.filter(
    (task) =>
      task.status !== "Resolved" &&
      task.status !== "In Progress"
  ).length;

  return (
    <main className="recovery-page">
      <header className="recovery-header">
        <div>
          <span className="recovery-eyebrow">
            DISASTER INTELLIGENCE & RESPONSE
          </span>

          <h1>Recovery Tracking</h1>

          <p>
            Monitor recovery activities, update progress, and
            keep community restoration organised.
          </p>
        </div>

        <button
          type="button"
          className="recovery-primary-btn"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={18} />
          {showForm ? "Close Form" : "New Recovery Task"}
        </button>
      </header>

      {message && (
        <div className="recovery-message success-message">
          <CheckCircle2 size={18} />
          {message}
        </div>
      )}

      {error && (
        <div className="recovery-message error-message">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Recovery statistics */}
      <section className="recovery-stats">
        <article className="recovery-stat-card">
          <ClipboardList size={22} />
          <span>Total tasks</span>
          <strong>{tasks.length}</strong>
        </article>

        <article className="recovery-stat-card">
          <Clock size={22} />
          <span>Pending review</span>
          <strong>{pendingCount}</strong>
        </article>

        <article className="recovery-stat-card">
          <RefreshCw size={22} />
          <span>In progress</span>
          <strong>{activeCount}</strong>
        </article>

        <article className="recovery-stat-card">
          <CheckCircle2 size={22} />
          <span>Resolved</span>
          <strong>{resolvedCount}</strong>
        </article>
      </section>

      {/* Create recovery task form */}
      {showForm && (
        <form
          className="recovery-form"
          onSubmit={addTask}
        >
          <h2>Create recovery task</h2>

          <label>
            Task title
            <input
              required
              maxLength={150}
              value={form.title}
              onChange={(event) =>
                setForm({
                  ...form,
                  title: event.target.value,
                })
              }
              placeholder="e.g. Restore drinking water supply"
            />
          </label>

          <label>
            Location
            <input
              required
              maxLength={150}
              value={form.location}
              onChange={(event) =>
                setForm({
                  ...form,
                  location: event.target.value,
                })
              }
              placeholder="Enter affected area"
            />
          </label>

          <label>
            Link to disaster report (optional)
            <select
              value={form.disaster_report_id}
              onChange={(event) => {
                const selectedReport = reports.find(
                  (report) =>
                    report.id === event.target.value
                );

                setForm({
                  ...form,
                  disaster_report_id: event.target.value,
                  location: selectedReport
                    ? selectedReport.location_text || ""
                    : form.location,
                });
              }}
            >
              <option value="">No linked report</option>

              {reports.map((report) => (
                <option
                  key={report.id}
                  value={report.id}
                >
                  {report.title} — {report.disaster_type} —{" "}
                  {report.location_text}
                </option>
              ))}
            </select>
          </label>

          <label>
            Description
            <textarea
              value={form.description}
              maxLength={1000}
              onChange={(event) =>
                setForm({
                  ...form,
                  description: event.target.value,
                })
              }
              placeholder="Describe the recovery work needed"
              rows={3}
            />
          </label>

          <label>
            Initial status
            <select
              value={form.status}
              onChange={(event) =>
                setForm({
                  ...form,
                  status: event.target.value,
                })
              }
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="recovery-primary-btn"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Recovery Task"}
          </button>
        </form>
      )}

      {/* Recovery task list */}
      <section className="recovery-task-section">
        <div className="recovery-section-heading">
          <div>
            <h2>Recovery activities</h2>
            <p>
              Track each task from submission to resolution.
            </p>
          </div>

          <button
            type="button"
            className="recovery-refresh-btn"
            onClick={loadTasks}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="recovery-empty">
            Loading recovery tasks...
          </p>
        ) : tasks.length === 0 ? (
          <div className="recovery-empty">
            <ClipboardList size={34} />
            <h3>No recovery tasks yet</h3>
            <p>
              Create a task to begin tracking recovery progress.
            </p>
          </div>
        ) : (
          <div className="recovery-task-list">
            {tasks.map((task) => (
              <article
                className="recovery-task-card"
                key={task.id}
              >
                <div className="recovery-task-top">
                  <div>
                    <h3>{task.title}</h3>
                    <p className="recovery-location">
                      {task.location}
                    </p>
                  </div>

                  <span
                    className={`recovery-status status-${task.status
                      .toLowerCase()
                      .replaceAll(" ", "-")}`}
                  >
                    {task.status}
                  </span>
                </div>

                {task.description && (
                  <p className="recovery-description">
                    {task.description}
                  </p>
                )}

                <label className="recovery-status-control">
                  Update status
                  <select
                    value={task.status}
                    onChange={(event) =>
                      updateStatus(
                        task.id,
                        event.target.value
                      )
                    }
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
