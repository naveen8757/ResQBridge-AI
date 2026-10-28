
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "./supabase";

const CHENNAI_CENTER = [13.0827, 80.2707];

const severityColors = {
  Critical: "#dc2626",
  High: "#ea580c",
  Medium: "#eab308",
  Low: "#16a34a",
};

function createSeverityIcon(severity, disasterType) {
  const color = severityColors[severity] || "#2563eb";
  const symbol = disasterType === "Road Accident" ? "🚗" : "⚠";

  return L.divIcon({
    className: "disaster-map-marker",
    html: `<div style="
      width:34px;height:34px;border-radius:50%;
      background:${color};border:3px solid white;
      box-shadow:0 2px 7px #0005;
      display:flex;align-items:center;justify-content:center;
      color:white;font-size:17px;
    ">${symbol}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
}

function FitReports({ reports }) {
  const map = useMap();

  useEffect(() => {
    if (reports.length === 1) {
      map.setView(
        [Number(reports[0].latitude), Number(reports[0].longitude)],
        13
      );
    } else if (reports.length > 1) {
      const bounds = reports.map((report) => [
        Number(report.latitude),
        Number(report.longitude),
      ]);
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 13 });
    }
  }, [reports, map]);

  return null;
}

export default function DisasterMap() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [unmappedCount, setUnmappedCount] = useState(0);

  
useEffect(() => {
  let active = true;

  async function loadReports(isManual = false) {
    if (isManual) setRefreshing(true);

    try {
      const [mappedResult, unmappedResult] = await Promise.all([
        supabase
          .from("disaster_reports")
          .select(
            "id, title, disaster_type, location_text, latitude, longitude, severity, status, created_at"
          )
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .order("created_at", { ascending: false }),

        supabase
          .from("disaster_reports")
          .select("id", { count: "exact", head: true })
          .or("latitude.is.null,longitude.is.null"),
      ]);

      if (!active) return;

      if (mappedResult.error) {
        setError(mappedResult.error.message);
      } else {
        setError("");
        setReports(mappedResult.data || []);
      }

      if (!unmappedResult.error) {
        setUnmappedCount(unmappedResult.count ?? 0);
      }
    } catch (err) {
      if (active) {
        setError(err.message || "Unable to load disaster reports.");
      }
    } finally {
      if (active) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  loadReports();
  const interval = window.setInterval(() => loadReports(), 30000);

  return () => {
    active = false;
    window.clearInterval(interval);
  };
}, [refreshKey]);


  const disasterTypes = [
    "All",
    "Flood",
    "Cyclone",
    "Earthquake",
    "Fire",
    "Landslide",
    "Road Accident",
    "Other",
  ];

  const filteredReports =
    typeFilter === "All"
      ? reports
      : reports.filter((report) => report.disaster_type === typeFilter);

  return (
    <section style={{ padding: "20px", color: "#10283b" }}>
      <h2>Disaster Incident Map</h2>
      <p>View reported incidents with GPS coordinates.</p>
      <button
  type="button"
  onClick={() => {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }}
  disabled={refreshing}
  style={{
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 14px",
    marginBottom: "16px",
    border: "none",
    borderRadius: "8px",
    background: "#0d9b8a",
    color: "#ffffff",
    cursor: refreshing ? "wait" : "pointer",
  }}
>
  <RefreshCw size={16} />
  {refreshing ? "Refreshing..." : "Refresh Map"}
</button>

      <label
        htmlFor="disaster-type-filter"
        style={{ display: "block", marginBottom: "8px" }}
      >
        Filter incidents by type
      </label>

      <select
        id="disaster-type-filter"
        value={typeFilter}
        onChange={(event) => setTypeFilter(event.target.value)}
        style={{
          padding: "10px",
          marginBottom: "12px",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          maxWidth: "100%",
        }}
      >
        {disasterTypes.map((type) => (
          <option key={type} value={type}>
            {type === "All" ? "All incident types" : type}
          </option>
        ))}
      </select>

      {loading && <p>Loading incident locations...</p>}

      {error && (
        <p style={{ color: "#dc2626" }}>
          Could not load reports: {error}
        </p>
      )}

      
{!loading && !error && (
  <>
    <p>
      Showing <strong>{filteredReports.length}</strong> mapped incident(s).
    </p>

    {unmappedCount > 0 && (
      <p style={{ color: "#92400e", marginTop: "8px" }}>
        {unmappedCount} report(s) do not have GPS coordinates and cannot
        appear on the map. Add a location using the GPS button or map
        picker in Disaster Reports.
      </p>
    )}
  </>
)}


      <div
        style={{
          height: "480px",
          width: "100%",
          borderRadius: "12px",
          overflow: "hidden",
          border: "1px solid #dbe3eb",
        }}
      >
        <MapContainer
          center={CHENNAI_CENTER}
          zoom={10}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitReports reports={filteredReports} />

          {filteredReports.map((report) => (
            <Marker
              key={report.id}
              position={[
                Number(report.latitude),
                Number(report.longitude),
              ]}
              icon={createSeverityIcon(
                report.severity,
                report.disaster_type
              )}
            >
              <Popup>
                <strong>{report.title || report.disaster_type}</strong>
                <br />
                Type: {report.disaster_type}
                <br />
                Location: {report.location_text || "Unknown"}
                <br />
                Severity: {report.severity || "Not specified"}
                <br />
                Status: {report.status || "Submitted"}
                <br />
                Reported:{" "}
                {report.created_at
                  ? new Date(report.created_at).toLocaleString()
                  : "Unknown"}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "14px",
          marginTop: "14px",
        }}
      >
        {Object.entries(severityColors).map(([severity, color]) => (
          <span
            key={severity}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <span
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: color,
                display: "inline-block",
              }}
            />
            {severity}
          </span>
        ))}
        <span>🚗 Road Accident</span>
      </div>
    </section>
  );
}
