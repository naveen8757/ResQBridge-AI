
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { supabase } from "./supabase";

export default function CommunityAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAlerts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    const { data, error: fetchError } = await supabase
      .from("community_alerts")
      .select("*")
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setAlerts([]);
    } else {
      setAlerts(data || []);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  
async function verifyAlertSource(alertId) {
  const confirmed = window.confirm("Confirm that you independently checked this alert against a trustworthy source. This does not send a notification.");
  if (!confirmed) return;
  setBusyId(alertId);
  setError("");
  setNotice("");
  const { error: verifyError } = await supabase.rpc("verify_community_alert", {
    p_alert_id: alertId,
    p_verified: true,
  });
  if (verifyError) {
    setError(verifyError.message);
  } else {
    setNotice("Source marked as verified by the signed-in reviewer. Review the draft separately before approval.");
    await loadAlerts(true);
  }
  setBusyId(null);
}

async function reviewAlert(alertId, decision) {
  const alert = alerts.find((item) => item.id === alertId);
  if (decision === "Approved" && !alert?.source_verified) {
    setError("Verify this alert against a trustworthy source before approval.");
    return;
  }
  const action = decision === "Approved" ? "approve" : "reject";

  const confirmed = window.confirm(
    `Are you sure you want to ${action} this alert draft?`
  );

  if (!confirmed) return;

  setBusyId(alertId);
  setError("");
  setNotice("");

  const { error: reviewError } = await supabase.rpc(
    "review_community_alert",
    {
      p_alert_id: alertId,
      p_decision: decision,
    }
  );

  if (reviewError) {
    setError(reviewError.message);
  } else {
    setNotice(
      decision === "Approved"
        ? "Draft approved. Verified drafts may create in-app notifications; email delivery is a separate configured operation and is not confirmed here."
        : "Alert draft rejected. No public alert was sent."
    );

    await loadAlerts(true);
  }

  setBusyId(null);
}


  const pendingCount = alerts.filter(
    (alert) => alert.status === "Pending Approval"
  ).length;

  return (
    <div style={{ padding: "24px", maxWidth: "1100px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <div>
          <p
            style={{
              color: "#0d9b8a",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "1.5px",
              marginBottom: "8px",
            }}
          >
            RESQBRIDGE AI · COMMUNITY SAFETY
          </p>
          <h1 style={{ margin: 0, color: "#10283b" }}>
            Community Alerts
          </h1>
          <p style={{ color: "#64748b", marginTop: "8px" }}>
            Review automatically prepared disaster alert drafts.
          </p>
        </div>

        <button
          onClick={() => loadAlerts(true)}
          disabled={refreshing || loading}
          style={buttonStyle("#10283b")}
        >
          <RefreshCw size={16} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div
        style={{
          background: "#fff7ed",
          border: "1px solid #fed7aa",
          borderRadius: "12px",
          padding: "14px 16px",
          marginBottom: "20px",
          display: "flex",
          gap: "10px",
          alignItems: "flex-start",
          color: "#9a3412",
        }}
      >
        <ShieldCheck size={21} />
        <div>
          <strong>Human verification required</strong>
          <p style={{ margin: "5px 0 0", fontSize: "14px" }}>
            Approval changes the draft status only. It does not send
            notifications or independently verify an incident.
          </p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            background: "#fef2f2",
            color: "#b91c1c",
            padding: "12px",
            borderRadius: "8px",
          }}
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          style={{
            background: "#ecfdf5",
            color: "#065f46",
            padding: "12px",
            borderRadius: "8px",
          }}
        >
          {notice}
        </p>
      )}

      <div
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <div style={summaryCardStyle}>
          <Clock size={20} color="#b45309" />
          <div>
            <div style={summaryNumberStyle}>{pendingCount}</div>
            <div style={summaryLabelStyle}>Pending review</div>
          </div>
        </div>

        <div style={summaryCardStyle}>
          <CheckCircle size={20} color="#0d9488" />
          <div>
            <div style={summaryNumberStyle}>
              {alerts.filter((a) => a.status === "Approved").length}
            </div>
            <div style={summaryLabelStyle}>Approved drafts</div>
          </div>
        </div>

        <div style={summaryCardStyle}>
          <AlertTriangle size={20} color="#64748b" />
          <div>
            <div style={summaryNumberStyle}>{alerts.length}</div>
            <div style={summaryLabelStyle}>Total drafts</div>
          </div>
        </div>
      </div>

      {loading ? (
        <p>Loading community alerts...</p>
      ) : alerts.length === 0 ? (
        <div style={emptyStyle}>
          <ShieldCheck size={36} color="#94a3b8" />
          <h3>No alert drafts yet</h3>
          <p>
            Eligible high-severity reports will appear here after the
            evaluator creates their drafts.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {alerts.map((alert) => {
            const pending = alert.status === "Pending Approval";

            return (
              <article key={alert.id} style={alertCardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div>
                    <span style={typeLabelStyle}>
                      {alert.disaster_type || "Disaster"}
                    </span>
                    <h3 style={{ margin: "10px 0", color: "#10283b" }}>
                      {alert.title}
                    </h3>
                  </div>

                  <span style={statusStyle(alert.status)}>
                    {alert.status}
                  </span>
                </div>

                <p style={{ color: "#475569", lineHeight: 1.6 }}>
                  {alert.message}
                </p>

                <div style={detailsGridStyle}>
                  <div>
                    <small style={smallLabelStyle}>Location</small>
                    <div>{alert.location_text || "Not provided"}</div>
                  </div>
                  <div>
                    <small style={smallLabelStyle}>Reported severity</small>
                    <div>{alert.severity || "Not specified"}</div>
                  </div>
                  <div>
                    <small style={smallLabelStyle}>Source verified</small>
                    <div>{alert.source_verified ? "Yes" : "No"}</div>
                  </div>
                  <div>
                    <small style={smallLabelStyle}>Created</small>
                    <div>
                      {new Date(alert.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "#f8fafc",
                    padding: "12px",
                    borderRadius: "8px",
                    marginTop: "14px",
                    fontSize: "13px",
                    color: "#475569",
                  }}
                >
                  <strong>Evaluation reason:</strong>{" "}
                  {alert.evaluation_reason || "No reason recorded"}
                </div>

                {pending && (
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      flexWrap: "wrap",
                      marginTop: "18px",
                    }}
                  >
                    {!alert.source_verified && (
                      <button
                        type="button"
                        disabled={busyId === alert.id}
                        onClick={() => verifyAlertSource(alert.id)}
                        style={buttonStyle("#1d4ed8")}
                      >
                        <ShieldCheck size={16} />
                        Mark source verified
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === alert.id || !alert.source_verified}
                      onClick={() => reviewAlert(alert.id, "Approved")}
                      style={buttonStyle("#0d9488")}
                      title={!alert.source_verified ? "Verify the source before approval" : "Approve this verified draft"}
                    >
                      <CheckCircle size={16} />
                      Approve draft
                    </button>

                    <button
                      type="button"
                      disabled={busyId === alert.id}
                      onClick={() => reviewAlert(alert.id, "Rejected")}
                      style={buttonStyle("#b91c1c")}
                    >
                      <XCircle size={16} />
                      Reject draft
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function buttonStyle(background) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    background,
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "10px 14px",
    fontWeight: 600,
    cursor: "pointer",
    opacity: 1,
  };
}

const summaryCardStyle = {
  flex: "1 1 180px",
  display: "flex",
  alignItems: "center",
  gap: "14px",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "18px",
};

const summaryNumberStyle = {
  fontSize: "24px",
  fontWeight: 700,
  color: "#10283b",
};

const summaryLabelStyle = {
  fontSize: "13px",
  color: "#64748b",
  marginTop: "3px",
};

const emptyStyle = {
  textAlign: "center",
  padding: "48px 20px",
  background: "#fff",
  border: "1px dashed #cbd5e1",
  borderRadius: "12px",
  color: "#64748b",
};

const alertCardStyle = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "20px",
  boxShadow: "0 2px 8px rgba(16, 40, 59, 0.04)",
};

const typeLabelStyle = {
  display: "inline-block",
  background: "#e0f2fe",
  color: "#075985",
  padding: "4px 8px",
  borderRadius: "6px",
  fontSize: "12px",
  fontWeight: 700,
};

const smallLabelStyle = {
  display: "block",
  color: "#64748b",
  fontSize: "12px",
  marginBottom: "5px",
};

const detailsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "16px",
  color: "#334155",
  fontSize: "14px",
};

function statusStyle(status) {
  const colors = {
    "Pending Approval": { background: "#fef3c7", color: "#92400e" },
    Approved: { background: "#d1fae5", color: "#065f46" },
    Rejected: { background: "#fee2e2", color: "#991b1b" },
    Sent: { background: "#dbeafe", color: "#1e40af" },
    Cancelled: { background: "#e2e8f0", color: "#334155" },
  };

  return {
    ...colors[status],
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
  };
}
