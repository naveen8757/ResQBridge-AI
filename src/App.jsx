import DisasterMap from "./DisasterMap";
import RecoveryTracking from "./RecoveryTracking";
import CoordinationAssistant from "./CoordinationAssistant";
import AgriculturalImpact from "./AgriculturalImpact";
import RiskPrediction from "./RiskPrediction";
import EnvironmentalMonitoring from "./EnvironmentalMonitoring";
import CommunityAlerts from "./CommunityAlerts";
import Notifications from "./Notifications";
import DisasterAssistant from "./DisasterAssistant";
import ResourceAssignments from "./ResourceAssignments";
import ResourceCoordination from "./ResourceCoordination";
import DisasterReports from "./DisasterReports";  
import { useEffect, useState } from "react";  
import {
  Activity,
  AlertTriangle,
  Bot,
  ClipboardList,
  CloudRain,
  LayoutDashboard,
  MapPin,
  Menu,
  Home,
  Plus,
  ShieldCheck,
  Users,
  Wifi,
  LogOut,
  Bell,
  Workflow,
  Sprout,
} from "lucide-react";
import { supabase } from "./supabase";
import { syncQueuedReports } from "./services/offlineReportQueue";
import Auth from "./Auth";
import "./App.css";


const navigation = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Disaster Reports", icon: AlertTriangle },
  { label: "Disaster Map", icon: MapPin },
  { label: "Environmental Monitoring", icon: CloudRain },
  { label: "Agricultural Impact", icon: Sprout },
  { label: "Community Alerts", icon: ShieldCheck },
  { label: "Risk Prediction", icon: CloudRain },
  { label: "Resource Coordination", icon: Users },
  {label: "Disaster Assistant",icon: Bot,id: "disaster-assistant",},
  { label: "Resource Assignments", icon: ClipboardList },
  { label: "Recovery Tracking", icon: Activity },
  { label: "Notifications", icon: Bell },
  { label: "Coordination Assistant", icon: Workflow },
];


function Dashboard({ onSignOut, email }) {
  const [activePage, setActivePage] = useState("Dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingReports, setPendingReports] = useState(0);
  
useEffect(() => {
  const QUEUE_KEY = "resqbridge_pending_reports";

  function updatePendingReports() {
    setIsOnline(navigator.onLine);
    try {
      const reports = JSON.parse(
        localStorage.getItem(QUEUE_KEY) || "[]"
      );
      setPendingReports(
        Array.isArray(reports) ? reports.length : 0
      );
    } catch {
      setPendingReports(0);
    }
  }

  updatePendingReports();
  if (navigator.onLine) {
    syncQueuedReports(supabase).finally(updatePendingReports);
  }

  function handleOnline() {
    setIsOnline(true);
    syncQueuedReports(supabase).finally(updatePendingReports);
  }
  function handleOffline() {
    setIsOnline(false);
    updatePendingReports();
  }
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  window.addEventListener("focus", updatePendingReports);

  const interval = window.setInterval(updatePendingReports, 2000);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    window.removeEventListener("focus", updatePendingReports);
    window.clearInterval(interval);
  };
}, []);

  const [stats, setStats] = useState({
  reports: null,
  resources: null,
  areas: null,
  tasks: null,
  recoveryTasks: null,
  riskAssessments: null,
});

const [statsLoading, setStatsLoading] = useState(true);
const [statsError, setStatsError] = useState("");


useEffect(() => {
  let cancelled = false;

  async function loadDashboardStats() {
    setStatsLoading(true);
    setStatsError("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const [
        reportsResult,
        resourcesResult,
        reportLocationsResult,
        resourceLocationsResult,
        tasksResult,
        recoveryTasksResult,
        riskAssessmentsResult,
      ] = await Promise.all([
        supabase
          .from("disaster_reports")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("response_resources")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("disaster_reports")
          .select("location_text"),

        supabase
          .from("response_resources")
          .select("location_text"),

        supabase
          .from("disaster_reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "In Progress"),

        supabase
          .from("recovery_tasks")
          .select("id", { count: "exact", head: true })
          .neq("status", "Completed")
          .neq("status", "Resolved"),

        supabase
          .from("risk_assessments")
          .select("id", { count: "exact", head: true }),
      ]);

      if (cancelled) return;

      const results = [
        reportsResult,
        resourcesResult,
        reportLocationsResult,
        resourceLocationsResult,
        tasksResult,
        recoveryTasksResult,
        riskAssessmentsResult,
      ];

      const failed = results.filter((result) => result.error);

      if (failed.length > 0) {
        console.error(
          "Dashboard database errors:",
          failed.map((result) => result.error)
        );

        setStatsError(
          "Some dashboard data could not load. Check the browser Console for the database error."
        );
      }

      const locations = [
        ...(reportLocationsResult.data || []),
        ...(resourceLocationsResult.data || []),
      ]
        .map((item) => item.location_text?.trim())
        .filter(Boolean);

      setStats({
        reports: reportsResult.count ?? 0,
        resources: resourcesResult.count ?? 0,
        areas: new Set(
          locations.map((location) => location.toLowerCase())
        ).size,
        tasks: tasksResult.count ?? 0,
        recoveryTasks: recoveryTasksResult.count ?? 0,
        riskAssessments: riskAssessmentsResult.count ?? 0,
      });
    } catch (error) {
      if (cancelled) return;

      console.error("Dashboard loading failed:", error);
      setStatsError(
        error.message || "Unable to load dashboard statistics."
      );
    } finally {
      if (!cancelled) {
        setStatsLoading(false);
      }
    }
  }

  loadDashboardStats();

  return () => {
    cancelled = true;
  };
}, []);


  return (
    <div className="app-shell">
      {menuOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon"><ShieldCheck size={25} /></div>
          <div>
            <h2>ResQBridge<span> AI</span></h2>
            <p>DISASTER RESPONSE PLATFORM</p>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${activePage === label ? "active" : ""}`}
              onClick={() => {
                setActivePage(label);
                setMenuOpen(false);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="offline-indicator">
            <span className="status-dot" />
            <div>
              <strong>Account connected</strong>
              <p>{email || "Signed-in user"}</p>
            </div>
          </div>
          <button className="nav-item" onClick={onSignOut}>
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
          <p className="sidebar-footer">RESQBRIDGE AI · PROTOTYPE</p>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            className="menu-button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span> {activePage}
          </div>
          
<div className="connection-status">
  <span
    className="connection-dot"
    style={{
      backgroundColor: isOnline ? "#16a34a" : "#dc2626",
    }}
  />
  <Wifi size={16} />
  <span>{isOnline ? "Online" : "Offline"}</span>
</div>

        </header>

        <section className="page-content">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">DISASTER INTELLIGENCE & RESPONSE</p>
              <h1>{activePage === "Dashboard" ? "Response overview" : activePage}</h1>
              <p className="subtitle">
                One connected workspace for preparedness, coordination and recovery.
              </p>
            </div>
            <div className="date-chip"><Activity size={16} /> Live workspace</div>
          </div>
          {activePage === "Disaster Reports" ? (
            <DisasterReports />
          ) : activePage === "Disaster Map" ? (
            <DisasterMap />
          ) : activePage === "Environmental Monitoring" ? (
            <EnvironmentalMonitoring />
          ) : activePage === "Agricultural Impact" ? (
            <AgriculturalImpact />
          ) : activePage === "Community Alerts" ? (
            <CommunityAlerts />
          ) : activePage === "Notifications" ? (
            <Notifications />
          ) : activePage === "Resource Coordination" ? (
            <ResourceCoordination />
          ) : activePage === "Resource Assignments" ? (
            <ResourceAssignments />
          ) : activePage === "Risk Prediction" ? (
            <RiskPrediction />
          ) : activePage === "Recovery Tracking" ? (
            <RecoveryTracking />
          ) : activePage === "Coordination Assistant" ? (
            <CoordinationAssistant onNavigate={setActivePage} />
          ) : activePage === "Disaster Assistant" ? (
            <DisasterAssistant />
          ) : activePage === "Dashboard" ? (
          <>
          {/* Keep your existing dashboard content here */}
 

          <div className="hero-panel">
            <div className="hero-content">
              <span className="hero-tag"><ShieldCheck size={15} /> RESILIENCE COMMAND CENTRE</span>
              <h2>Every report matters.<br />Every response counts.</h2>
              <p>
                Bring community reports, response resources and recovery tasks
                together in one organised workspace.
              </p>
              <button
                className="primary-button"
                onClick={() => setActivePage("Disaster Reports")}
              >
                Explore disaster reports <span>→</span>
              </button>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="hero-shield">
                <ShieldCheck size={76} strokeWidth={1.25} />
              </div>
              <div className="floating-card">
                <Activity size={17} /><span>Response network</span>
              </div>
              <div className="map-pin"><MapPin size={22} /></div>
            </div>
          </div>

<div className="section-heading">
  <div>
    <h2>Operational snapshot</h2>
    <p>
      {statsLoading
        ? "Loading workspace statistics..."
        : statsError
          ? "Database statistics unavailable"
          : "Counts from your connected workspace"}
    </p>
  </div>

  <span className="sample-label">
    {statsLoading
      ? "LOADING"
      : statsError
        ? "ERROR"
        : "DATABASE DATA"}
  </span>
</div>

{statsError && (
  <div className="risk-notice" role="alert">
    <AlertTriangle size={20} />
    <p>{statsError}</p>
  </div>
)}

<div className="stats-grid">
  {[
    [
      "Community reports",
      stats.reports,
      "Total accessible reports",
      AlertTriangle,
      "blue",
    ],
    [
      "Registered resources",
      stats.resources,
      "Resources registered",
      Users,
      "teal",
    ],
    [
      "Areas monitored",
      stats.areas,
      "Distinct reported locations",
      MapPin,
      "amber",
    ],
    [
      "Reports in progress",
      stats.tasks,
      "Reports marked In Progress",
      Activity,
      "violet",
    ],
    [
  "Open recovery tasks",
  stats.recoveryTasks,
  "Tasks not yet resolved",
  ClipboardList,
  "amber",
  ],
  [
  "Risk assessments",
  stats.riskAssessments,
  "Saved assessments",
  Activity,
  "violet",
  ],
  ].map(([label, value, description, Icon, color]) => (
    <article className="stat-card" key={label}>
      <div className="stat-top">
        <span>{label}</span>
        <div className={`stat-icon ${color}`}>
          <Icon size={19} />
        </div>
      </div>

      <strong>
        {statsLoading ? "..." : statsError ? "—" : value}
      </strong>

      <p>{description}</p>
    </article>
  ))}
</div>


          <div className="bottom-grid">
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <h3>Response workflow</h3>
                  <p>From first report to recovery</p>
                </div>
                <Activity size={20} />
              </div>
              <div className="workflow-list">
                {[
                  ["01", "Report", "Collect a community incident report"],
                  ["02", "Assess", "Review urgency and available evidence"],
                  ["03", "Coordinate", "Match needs with available resources"],
                  ["04", "Recover", "Track progress until resolution"],
                ].map(([number, title, description]) => (
                  <div className="workflow-item" key={number}>
                    <span className="workflow-number">{number}</span>
                    <div><strong>{title}</strong><p>{description}</p></div>
                  </div>
                ))}
              </div>
            </section>

            <section className="content-card readiness-card">
              <div className="card-heading">
                <div>
                  <h3>Platform readiness</h3>
                  <p>Prototype implementation status</p>
                </div>
                <ShieldCheck size={20} />
              </div>
              {[
                ["Core modules", "Implemented"],
                ["Database source", "Supabase configured per environment"],
                ["Offline queue", pendingReports > 0 ? `${pendingReports} pending` : isOnline ? "Connected" : "Offline"],
                ["Coordination support", "Rule-based suggestions"],
              ].map(([label, status]) => (
                <div className="readiness-item" key={label}>
                  <span>{label}</span>
                  <span className="readiness-status">{status}</span>
                </div>
              ))}
              <p className="notice">
                Prototype status: external weather can be fetched when online. Official emergency feeds and validated disaster forecasting are not connected. Verify suggestions with authorized responders.
              </p>
            </section>
          </div>

          <footer className="page-footer">
            <span>ResQBridge AI</span>
            <span>Predict early · Prepare smarter · Rebuild together</span>
          </footer>
          
  </>
) : (
  <div className="content-card">
    <h2>{activePage}</h2>
    <p>This module is under development.</p>
  </div>
)}    
        </section>
      </main>
      <nav className="mobile-bottom-nav" aria-label="Quick navigation">
        <button
          className={activePage === "Dashboard" ? "quick-nav-item active" : "quick-nav-item"}
          onClick={() => { setActivePage("Dashboard"); setMenuOpen(false); }}
          aria-label="Home"
        >
          <Home size={20} /><span>Home</span>
        </button>
        <button
          className={activePage === "Disaster Map" ? "quick-nav-item active" : "quick-nav-item"}
          onClick={() => { setActivePage("Disaster Map"); setMenuOpen(false); }}
          aria-label="Disaster map"
        >
          <MapPin size={20} /><span>Map</span>
        </button>
        <button
          className={activePage === "Disaster Reports" ? "quick-nav-item quick-nav-report active" : "quick-nav-item quick-nav-report"}
          onClick={() => { setActivePage("Disaster Reports"); setMenuOpen(false); }}
          aria-label="Report a disaster"
        >
          <span className="quick-nav-report-icon"><Plus size={22} /></span><span>Report</span>
        </button>
        <button
          className={activePage === "Disaster Assistant" ? "quick-nav-item active" : "quick-nav-item"}
          onClick={() => { setActivePage("Disaster Assistant"); setMenuOpen(false); }}
          aria-label="Disaster assistant"
        >
          <Bot size={20} /><span>Assistant</span>
        </button>
      </nav>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error("Session check failed:", error.message);
      setSession(data?.session ?? null);
      setCheckingSession(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) console.error("Sign-out failed:", error.message);
    }
  }

  if (checkingSession) {
    return <div style={{ padding: 40, fontFamily: "sans-serif" }}>Loading ResQBridge AI...</div>;
  }

  if (!session) {
    return <Auth onAuthenticated={() => {
      if (supabase) {
        supabase.auth.getSession().then(({ data }) => setSession(data?.session ?? null));
      }
    }} />;
  }

    return (
  <Dashboard
    email={session.user?.email}
    onSignOut={handleSignOut}
  />
);  
}
