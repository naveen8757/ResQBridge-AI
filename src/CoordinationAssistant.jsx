import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Bot, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "./supabase";
import { buildCoordinationSuggestions } from "./services/coordinationService";

const priorityTone = {
  Critical: { background: "#fee2e2", color: "#991b1b" },
  High: { background: "#ffedd5", color: "#9a3412" },
  Medium: { background: "#fef3c7", color: "#92400e" },
  Low: { background: "#dbeafe", color: "#1d4ed8" },
  Info: { background: "#e2e8f0", color: "#334155" },
};

export default function CoordinationAssistant({ onNavigate }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured. Add your project URL and publishable key to .env.local.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [reports, resources, assignments, tasks, risks] = await Promise.all([
        supabase.from("disaster_reports").select("id,title,disaster_type,location_text,severity,status,created_at"),
        supabase.from("response_resources").select("id,resource_name,resource_type,quantity,location_text,availability"),
        supabase.from("resource_assignments").select("id,report_id,resource_id,quantity_assigned,status,created_at"),
        supabase
  .from("recovery_tasks")
  .select("id,title,location,description,status,created_at,disaster_report_id"),  
        supabase.from("risk_assessments").select("id,disaster_report_id,disaster_type,risk_level,risk_score,created_at").order("created_at", { ascending: false }).limit(50),
      ]);
      const failed = [reports, resources, assignments, tasks, risks].find((result) => result.error);
      if (failed?.error) throw failed.error;
      setSuggestions(buildCoordinationSuggestions({
        reports: reports.data || [],
        resources: resources.data || [],
        assignments: assignments.data || [],
        tasks: tasks.data || [],
        risks: risks.data || [],
      }));
      setRefreshedAt(new Date());
    } catch (err) {
      setError(err?.message || "The coordination suggestions could not be loaded.");
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <section className="coordination-page" style={{ maxWidth: 1120, margin: "0 auto", padding: 20, color: "#10283b" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
        <div>
          <p className="eyebrow">HUMAN-SUPERVISED RESPONSE SUPPORT</p>
          <h2 style={{ margin: "4px 0" }}>Coordination Assistant</h2>
          <p style={{ color: "#64748b", margin: 0 }}>Rule-based suggestions from available incidents, resources, assignments, assessments and recovery tasks.</p>
        </div>
        <button type="button" className="primary-button" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} /> {loading ? "Refreshing..." : "Refresh suggestions"}
        </button>
      </header>

      <div role="note" style={{ display: "flex", gap: 10, padding: 14, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1e40af", borderRadius: 12, marginBottom: 18 }}>
        <ShieldCheck size={20} />
        <div><strong>Human approval required</strong><div style={{ marginTop: 4, fontSize: 14 }}>Suggestions do not dispatch resources, send emergency alerts, or replace official information. Verify records before acting.</div></div>
      </div>

      {error && <p role="alert" style={{ padding: 12, color: "#991b1b", background: "#fee2e2", borderRadius: 8 }}>{error}</p>}
      {refreshedAt && <p style={{ color: "#64748b", fontSize: 13 }}>Last refreshed: {refreshedAt.toLocaleTimeString()}</p>}

      {loading ? <p>Reviewing current workspace records...</p> : suggestions.length === 0 ? <p>No suggestions available.</p> : (
        <div style={{ display: "grid", gap: 14 }}>
          {suggestions.map((item) => (
            <article key={item.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff", padding: 18, boxShadow: "0 2px 8px rgba(16,40,59,.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: "#e0f2fe", color: "#075985", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    {item.priority === "Critical" || item.priority === "High" ? <AlertTriangle size={21} /> : <Bot size={21} />}
                  </div>
                  <div>
                    <h3 style={{ margin: "1px 0 6px", fontSize: 17 }}>{item.title}</h3>
                    <p style={{ margin: 0, color: "#475569" }}>{item.detail}</p>
                  </div>
                </div>
                <span style={{ ...priorityTone[item.priority], padding: "5px 9px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{item.priority}</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14, color: "#475569", lineHeight: 1.6 }}>
                <Activity size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0 }}><strong>Why suggested:</strong> {item.reason}</p>
              </div>
              {item.reportId && onNavigate && <button type="button" className="primary-button" style={{ marginTop: 14 }} onClick={() => onNavigate("Disaster Reports")}>Review related report</button>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
