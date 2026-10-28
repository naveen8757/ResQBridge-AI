import LocationPicker from "./LocationPicker";
import { AlertTriangle, MapPin, Send, Navigation } from "lucide-react";
import "./DisasterReports.css";
import { useEffect,useState } from "react";
import { supabase } from "./supabase";
import { syncQueuedReports } from "./services/offlineReportQueue";

const OFFLINE_REPORTS_KEY = "resqbridge_pending_reports";

function getPendingReports() {
  try {
    return JSON.parse(
      localStorage.getItem(OFFLINE_REPORTS_KEY) || "[]"
    );
  } catch {
    return [];
  }
}

function savePendingReports(reports) {
  localStorage.setItem(
    OFFLINE_REPORTS_KEY,
    JSON.stringify(reports)
  );
}


export default function DisasterReports() {
  const [form, setForm] = useState({
    title: "",
    disaster_type: "Flood",
    description: "",
    location_text: "",
    severity: "Medium",
    latitude: null,
    longitude: null,
  });

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);

const [pendingCount, setPendingCount] = useState(
  () => getPendingReports().length
);

  
async function loadReports() {
  if (!navigator.onLine) {
    setLoadingReports(false);
    return;
  }
  
  if (!supabase) {
    setLoadingReports(false);
    return;
  }

  try {
    const { data, error } = await supabase
      .from("disaster_reports")
      .select(
        "id, title, disaster_type, location_text, severity, status, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    setReports(data || []);
  } catch (error) {
    setMessage(error.message || "Unable to load reports.");
  } finally {
    setLoadingReports(false);
  }
}

useEffect(() => {
  loadReports();
}, []);

async function updateReportStatus(reportId, newStatus) {
  if (!supabase) return;

  const { error } = await supabase
    .from("disaster_reports")
    .update({ status: newStatus })
    .eq("id", reportId);

  if (error) {
    setMessage(`Status update failed: ${error.message}`);
    return;
  }

  setReports((currentReports) =>
    currentReports.map((report) =>
      report.id === reportId
        ? { ...report, status: newStatus }
        : report
    )
  );

  setMessage("Recovery status updated.");
}


  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

 

async function updateLocationName(latitude, longitude) {
  // Save coordinates immediately, even if the name lookup fails.
  setForm((current) => ({
    ...current,
    latitude,
    longitude,
  }));

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
    );

    if (!response.ok) {
      throw new Error("Location lookup failed");
    }

    const data = await response.json();
    const address = data.address || {};

    const readableLocation =
      [
        address.suburb ||
          address.neighbourhood ||
          address.village ||
          address.town ||
          address.city ||
          address.county,
        address.city_district,
        address.state,
      ]
        .filter(Boolean)
        .filter(
          (value, index, values) =>
            values.indexOf(value) === index
        )
        .join(", ") || data.display_name || "";

    if (readableLocation) {
      setForm((current) => ({
        ...current,
        latitude,
        longitude,
        location_text: readableLocation,
      }));
    } else {
      setMessage(
        "Coordinates captured, but no place name was found. Please enter the location manually."
      );
    }
  } catch (error) {
    console.error("Location lookup failed:", error);

    setMessage(
      "Coordinates captured, but the place name could not be loaded. Check your internet connection or enter the location manually."
    );
  }
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    alert("Location services are not supported by this browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      await updateLocationName(latitude, longitude);
    },
    (error) => {
      const messages = {
        1: "Location permission was denied. Allow location access in browser settings.",
        2: "Your location is unavailable. Check device location services.",
        3: "Location request timed out. Please try again.",
      };

      alert(messages[error.code] || error.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    }
  );
}

async function handleSubmit(event) {
  event.preventDefault();
  setMessage("");

  let report = {
    ...form,
    client_id: crypto.randomUUID(),
  };

  if (
    !report.title.trim() ||
    !report.location_text.trim() ||
    !report.description.trim()
  ) {
    setMessage("Please complete all required fields.");
    return;
  }

  setSaving(true);

  try {
    // Read the locally cached session so offline reports remain associated
    // with the account that created them, rather than whichever account logs in later.
    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user?.id) report.user_id = sessionData.session.user.id;
    }

    // STEP 1: Save locally if the device is offline.
    if (!navigator.onLine) {
      if (!report.user_id) {
        setMessage("Sign in while online once before using offline reporting. No report was queued.");
        return;
      }
      const pending = getPendingReports();

      pending.push({
        ...report,
        local_id: crypto.randomUUID(),
        queued_at: new Date().toISOString(),
      });

      savePendingReports(pending);
      setPendingCount(pending.length);
      setMessage(
        "Offline: report saved on this device and waiting to sync."
      );

      setForm({
        title: "",
        disaster_type: "Flood",
        description: "",
        location_text: "",
        severity: "Medium",
        latitude: null,
        longitude: null,
      });

      return;
    }

    // STEP 2: Check the database connection.
    if (!supabase) {
      throw new Error("Database connection is not configured.");
    }

    // STEP 3: Confirm that the user is signed in.
    const { data, error: authError } = await supabase.auth.getUser();

    if (authError) throw authError;

    if (!data.user) {
      setMessage("Please sign in before submitting a report.");
      return;
    }
    report = { ...report, user_id: data.user.id };

    // STEP 4: Submit the report to Supabase.
    const { error: insertError } = await supabase
      .from("disaster_reports")
      .upsert([report], {
        onConflict: "client_id",
        ignoreDuplicates: true,
      });

    if (insertError) {
      // Preserve the report if connectivity was lost during submission.
      if (!navigator.onLine) {
        const pending = getPendingReports();

        pending.push({
          ...report,
          local_id: crypto.randomUUID(),
          queued_at: new Date().toISOString(),
        });

        savePendingReports(pending);
        setPendingCount(pending.length);
        setMessage(
          "Connection lost: report saved locally and waiting to sync."
        );

        setForm({
          title: "",
          disaster_type: "Flood",
          description: "",
          location_text: "",
          severity: "Medium",
          latitude: null,
          longitude: null,
        });

        return;
      }

      throw insertError;
    }

    // STEP 5: Confirm successful submission.
    setMessage("Report submitted successfully!");
    await loadReports();

    setForm({
      title: "",
      disaster_type: "Flood",
      description: "",
      location_text: "",
      severity: "Medium",
      latitude: null,
      longitude: null,
    });
  } catch (error) {
    console.error("Report submission failed:", error);

    setMessage(
      error.message || "Unable to submit the report."
    );
  } finally {
    setSaving(false);
  }
}


async function syncPendingReports() {
  if (!supabase || !navigator.onLine) return;
  try {
    const result = await syncQueuedReports(supabase);
    setPendingCount(result.remaining);
    if (result.message && (result.synced > 0 || result.remaining > 0)) setMessage(result.message);
    if (result.synced > 0) await loadReports();
  } catch (error) {
    console.error("Offline report synchronization failed:", error);
    setPendingCount(getPendingReports().length);
  }
}

useEffect(() => {
  function handleOnline() {
    syncPendingReports();
  }

  window.addEventListener("online", handleOnline);

  if (navigator.onLine) {
    syncPendingReports();
  }

  return () => {
    window.removeEventListener("online", handleOnline);
  };
}, []);


  return (
    <section className="reports-page">
      <div className="reports-heading">
        <div>
          <p className="eyebrow">COMMUNITY INCIDENT INTAKE</p>
          <h2>Submit a disaster report</h2>
          <p>Record an incident so it can be reviewed and prioritised.</p>
          <p role="status">
          {navigator.onLine ? "Online" : "Offline"} · {pendingCount} report(s) waiting to sync
          </p>
        </div>
        <AlertTriangle size={30} />
      </div>

      <form className="report-form" onSubmit={handleSubmit}>
        <label htmlFor="title">Report title</label>
        <input
          id="title"
          name="title"
          value={form.title}
          onChange={handleChange}
          placeholder="Example: Flooding near the bus stand"
          required
        />

        <label htmlFor="disaster_type">Disaster type</label>
        <select
          id="disaster_type"
          name="disaster_type"
          value={form.disaster_type}
          onChange={handleChange}
        >
          {["Flood", "Cyclone", "Earthquake", "Fire", "Landslide","Road Accident", "Other"].map(
            (type) => <option key={type} value={type}>
              {type}
            </option>
          )}
        </select>

        <label htmlFor="location_text">
          <MapPin size={15} /> Location
        </label>
        
        <input
          id="location_text"
          name="location_text"
          value={form.location_text}
          onChange={handleChange}
          placeholder="Area, town or landmark"
          required
        />
        
<button
  type="button"
  onClick={useCurrentLocation}
>
  <Navigation size={16} />
  Use My Current Location
</button>

<LocationPicker
  latitude={form.latitude}
  longitude={form.longitude}
  onLocationSelect={({ latitude, longitude }) => {
    updateLocationName(latitude, longitude);
  }}
/>


        <label htmlFor="severity">Reported severity</label>
        <select
          id="severity"
          name="severity"
          value={form.severity}
          onChange={handleChange}
        >
          {["Low", "Medium", "High", "Critical"].map(
            (level) => <option key={level}>{level}</option>
          )}
        </select>

        <label htmlFor="description">What happened?</label>
        <textarea
          id="description"
          name="description"
          value={form.description}
          onChange={handleChange}
          placeholder="Describe the incident and the help needed."
          rows={4}
          required
        />

        {message && <p role="status" className="report-message">{message}</p>}

        <button className="primary-button" type="submit" disabled={saving}>
          <Send size={17} />
          {saving ? "Submitting..." : "Submit report"}
        </button>
      
      </form>

      <div className="saved-reports">
        <h3>Recent disaster reports</h3>
        <p>Reports saved to the ResQBridge AI database.</p>

        {loadingReports ? (
          <p>Loading reports...</p>
        ) : reports.length === 0 ? (
          <p>No reports found yet.</p>
        ) : (
          <div className="saved-reports-list">
            {reports.map((report) => (
              <article className="saved-report-card" key={report.id}>
                <div className="saved-report-header">
                    <p className="report-priority">
  {report.severity === "Critical"
    ? "Priority 1 · Immediate review"
    : report.severity === "High"
    ? "Priority 2 · Urgent review"
    : report.severity === "Medium"
    ? "Priority 3 · Standard review"
    : "Priority 4 · Lower urgency"}
</p>
                  <h4>{report.title}</h4>
                  <span className={`severity-${report.severity.toLowerCase()}`}>
                    {report.severity}
                  </span>
                </div>

                <p>{report.disaster_type} · {report.location_text}</p>

                
<div className="saved-report-footer">
  <label>
    Recovery status
    <select
      value={report.status}
      onChange={(event) =>
        updateReportStatus(report.id, event.target.value)
      }
    >
      {[
        "Submitted",
        "Under Review",
        "Assigned",
        "In Progress",
        "Resolved",
      ].map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  </label>

  <span>
    {new Date(report.created_at).toLocaleString()}
  </span>
</div>

              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

