import { useCallback, useEffect, useState } from "react";
import { CloudRain, Leaf, MapPin, RefreshCw, Send } from "lucide-react";
import { supabase } from "./supabase";
import AgriculturalMap from "./AgriculturalMap";

const emptyForm = {
  location: "",
  crop_type: "",
  affected_hectares: "",
  impact_severity: "Moderate",
  rain_related: "Unknown",
  description: "",
};

export default function AgriculturalImpact() {
  const [form, setForm] = useState(emptyForm);
  const [records, setRecords] = useState([]);
  const [mapLocation, setMapLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadRecords = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured. Add the project URL and publishable key to .env.local.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("agricultural_impact_reports")
      .select("id,location,crop_type,affected_hectares,impact_severity,rain_related,description,review_status,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (queryError) {
      setError(queryError.message);
      setRecords([]);
    } else {
      setRecords(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  async function submitImpact(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    const hectares = Number(form.affected_hectares);
    if (!form.location.trim() || !form.crop_type.trim() || !form.description.trim()) {
      setError("Enter the location, crop type and impact description.");
      return;
    }
    if (!Number.isFinite(hectares) || hectares <= 0 || hectares > 10000000) {
      setError("Affected area must be a positive value in hectares.");
      return;
    }
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setSaving(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData?.user) throw new Error("Sign in before submitting agricultural impact details.");
      const { error: insertError } = await supabase.from("agricultural_impact_reports").insert({
        user_id: userData.user.id,
        location: form.location.trim(),
        crop_type: form.crop_type.trim(),
        affected_hectares: hectares,
        impact_severity: form.impact_severity,
        rain_related: form.rain_related,
        description: form.description.trim(),
        estimate_method: "Community-reported estimate",
        latitude: mapLocation?.lat ?? null,
        longitude: mapLocation?.lng ?? null,
      });
      if (insertError) throw insertError;
      setForm(emptyForm);
      setMessage("Agricultural impact report submitted for review.");
      await loadRecords();
    } catch (err) {
      setError(err?.message || "Unable to save this impact report.");
    } finally {
      setSaving(false);
    }
  }

  const reportedTotal = records.reduce((total, item) => total + (Number(item.affected_hectares) || 0), 0);

  return (
    <section className="reports-page" style={{ maxWidth: 1120, margin: "0 auto", padding: 20 }}>
      <header className="reports-heading">
        <div>
          <p className="eyebrow">COMMUNITY IMPACT REPORTING</p>
          <h2>Agricultural Impact</h2>
          <p>Record farmland impact after heavy rain or another disaster so response teams can review reported needs.</p>
        </div>
        <Leaf size={30} />
      </header>

      <div role="note" style={{ display: "flex", gap: 10, padding: 14, background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa", borderRadius: 12, marginBottom: 18 }}>
        <CloudRain size={20} />
        <p style={{ margin: 0 }}>Affected area is a community-reported estimate. This module does not currently derive damage measurements from satellite imagery or claim verified crop loss.</p>
      </div>

      <form
  className="report-form agricultural-impact-form"
  onSubmit={submitImpact}
>
        <AgriculturalMap
  onLocationSelect={(point) => {
    setMapLocation(point);

    if (point?.address) {
      setForm((previous) => ({
        ...previous,
        location: point.address,
      }));
    }
  }}
/>
        <label htmlFor="agri-location"><MapPin size={15} /> Farm / affected area location</label>
        <input id="agri-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Village, taluk, district" required />

        <label htmlFor="agri-crop">Crop type</label>
        <input id="agri-crop" value={form.crop_type} onChange={(e) => setForm({ ...form, crop_type: e.target.value })} placeholder="e.g. paddy, banana, groundnut" required />

        <label htmlFor="agri-hectares">Estimated affected area (hectares)</label>
        <input id="agri-hectares" type="number" min="0.01" max="10000000" step="0.01" value={form.affected_hectares} onChange={(e) => setForm({ ...form, affected_hectares: e.target.value })} required />

        <label htmlFor="agri-severity">Reported impact severity</label>
        <select id="agri-severity" value={form.impact_severity} onChange={(e) => setForm({ ...form, impact_severity: e.target.value })}>
          <option>Low</option><option>Moderate</option><option>High</option><option>Severe</option>
        </select>

        <label htmlFor="agri-rain">Possibly related to heavy rain?</label>
        <select id="agri-rain" value={form.rain_related} onChange={(e) => setForm({ ...form, rain_related: e.target.value })}>
          <option>Unknown</option><option>Yes</option><option>No</option>
        </select>

        <label htmlFor="agri-description">Impact details and immediate needs</label>
        <textarea id="agri-description" rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe visible impacts and any needs. Avoid including private information." required />

        {error && <p role="alert" className="report-message">{error}</p>}
        {message && <p role="status" className="report-message">{message}</p>}
        <button type="submit" className="primary-button" disabled={saving}><Send size={16} /> {saving ? "Submitting..." : "Submit impact report"}</button>
      </form>

      <section className="saved-reports" style={{ marginTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div><h3>Reported agricultural impacts</h3><p>{records.length} reports · {reportedTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} hectares reported (not independently verified)</p></div>
          <button type="button" className="primary-button" onClick={loadRecords} disabled={loading}><RefreshCw size={16} /> Refresh</button>
        </div>
        {loading ? <p>Loading impact reports...</p> : error && records.length === 0 ? null : records.length === 0 ? <p>No agricultural impact reports yet.</p> : (
          <div className="saved-reports-list">
            {records.map((record) => (
              <article className="saved-report-card" key={record.id}>
                <div className="saved-report-header"><h4>{record.crop_type} · {record.location}</h4><span>{record.review_status || "Pending Review"}</span></div>
                <p><strong>{Number(record.affected_hectares).toLocaleString()} hectares</strong> · Impact: {record.impact_severity} · Rain-related: {record.rain_related}</p>
                <p>{record.description}</p>
                <small>Reported {new Date(record.created_at).toLocaleString()} · Community estimate</small>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
