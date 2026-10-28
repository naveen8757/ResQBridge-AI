import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import {
  CloudRain,
  ShieldAlert,
  CheckCircle2,
  Info,
  Activity,
} from "lucide-react";
import "./RiskPrediction.css";
import { calculateRiskAssessment, isWeatherFresh, weatherMatchesLocation } from "./services/riskService";

const riskGuidance = {
  Flood: [
    "Monitor official weather and flood warnings.",
    "Identify a safe route to higher ground.",
    "Protect important documents and emergency supplies.",
  ],
  Cyclone: [
    "Follow official cyclone alerts and evacuation instructions.",
    "Prepare drinking water, essential supplies, and a torch.",
    "Stay away from damaged power lines and coastal floodwater.",
  ],
  Earthquake: [
    "Secure heavy furniture where practical.",
    "Practise Drop, Cover, and Hold On.",
    "After shaking stops, follow official guidance about evacuation.",
  ],
  Fire: [
    "Keep exits and evacuation routes clear.",
    "Follow local fire service instructions.",
    "Do not re-enter a building until authorities declare it safe.",
  ],
  Landslide: [
    "Watch for official landslide warnings after heavy rainfall.",
    "Avoid slopes and roads identified as dangerous.",
    "Follow evacuation instructions from local authorities.",
  ],
  "Road Accident": [
    "Contact the appropriate local emergency services when immediate help is required.",
    "Keep yourself and others away from traffic and secondary hazards.",
    "Follow instructions from authorized responders and do not obstruct access routes.",
  ],
  Other: [
    "Verify the incident details with a responsible local contact.",
    "Follow relevant official public-safety guidance.",
    "Record outstanding needs and review them with the response coordinator.",
  ],
};

export default function RiskPrediction() {
  const [disasterType, setDisasterType] = useState("Flood");
  const [severity, setSeverity] = useState("Medium");
  const [conditions, setConditions] = useState("Concerning");
  const [assessment, setAssessment] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [weatherNotice, setWeatherNotice] = useState("");
  const [assessmentError, setAssessmentError] = useState("");
  const [assessmentSaving, setAssessmentSaving] = useState(false);

  // New state variables for disaster reports
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [reportsLoading, setReportsLoading] = useState(true);

  // STEP 2: Load disaster reports from Supabase
  // Load the latest weather data saved by Environmental Monitoring
useEffect(() => {
  function loadSavedWeather() {
    const savedWeather = localStorage.getItem(
      "resqbridge_latest_weather"
    );

    if (!savedWeather) {
      setWeatherData(null);
      setWeatherNotice(
        "No weather data available. Open Environmental Monitoring and fetch weather data first."
      );
      return;
    }

    try {
      const parsedWeather = JSON.parse(savedWeather);

      if (
        !parsedWeather.location ||
        typeof parsedWeather.precipitation !== "number" ||
        typeof parsedWeather.wind_speed_10m !== "number"
      ) {
        setWeatherData(null);
        setWeatherNotice("Saved weather data is incomplete. Fetch it again.");
        return;
      }

      setWeatherData(parsedWeather);
      setWeatherNotice(
        isWeatherFresh(parsedWeather)
          ? `Weather data for ${parsedWeather.location} is available.`
          : `Cached weather data for ${parsedWeather.location} is older than six hours. Fetch fresh data before using it in an assessment.`
      );
    } catch {
      setWeatherData(null);
      setWeatherNotice("Unable to read saved weather data. Fetch it again.");
    }
  }

  loadSavedWeather();
}, []);
useEffect(() => {
  async function loadReports() {
    setReportsLoading(true);

    const { data, error } = await supabase
      .from("disaster_reports")
      .select("id, title, disaster_type, severity, location_text")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load disaster reports:", error.message);
      setReports([]);
    } else {
      setReports(data || []);
    }

    setReportsLoading(false);
  }

  loadReports();
}, []);

function updateInput(setter, value) {
  setter(value);
  setAssessment(null);
}
  
  
async function handleAssess(event) {
  event.preventDefault();
  setAssessmentError("");
  setAssessmentSaving(true);

  try {
    if (!supabase) throw new Error("Supabase is not configured. Add your project URL and publishable key in .env.local.");

    const selectedReport = reports.find((report) => String(report.id) === String(selectedReportId));
    let usableWeather = weatherData;
    let weatherExclusionReason = "";

    if (usableWeather && !isWeatherFresh(usableWeather)) {
      weatherExclusionReason = `Cached weather for ${usableWeather.location} was older than six hours and was not used.`;
      usableWeather = null;
    }

    if (usableWeather && selectedReport?.location_text && !weatherMatchesLocation(usableWeather, selectedReport.location_text)) {
      weatherExclusionReason = `Weather for ${usableWeather.location} was not applied because the selected report location is “${selectedReport.location_text}”. Fetch weather for a matching location before reassessing.`;
      usableWeather = null;
    }

    const result = calculateRiskAssessment({ severity, conditions, weatherData: usableWeather });
    if (weatherExclusionReason) result.reasons.push(weatherExclusionReason);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData?.user) throw new Error("Please sign in before saving a risk assessment.");

    const assessmentData = {
      disaster_report_id: selectedReportId || null,
      disaster_type: disasterType,
      severity,
      conditions,
      risk_level: result.level,
      risk_score: result.score,
      weather_score: result.weatherScore,
      weather_location: result.weatherLocation,
      weather_timestamp: result.weatherTimestamp,
      weather_retrieved_at: result.weatherRetrievedAt,
      weather_precipitation: result.weatherPrecipitation,
      weather_wind_speed: result.weatherWindSpeed,
      weather_source: result.weatherSource,
      assessment_reasons: result.reasons,
      created_by: userData.user.id,
    };

    const { error } = await supabase.from("risk_assessments").insert([assessmentData]);
    if (error) throw error;

    setAssessment({
      ...result,
      disasterType,
      severity,
      conditions,
      assessedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
    setWeatherNotice(weatherExclusionReason || (usableWeather ? `Using ${usableWeather.source || "saved weather-model data"} for ${usableWeather.location}.` : "No current matching weather data was used."));
  } catch (error) {
    console.error("Risk assessment failed:", error);
    setAssessmentError(error?.message || "Unable to calculate and save the assessment.");
  } finally {
    setAssessmentSaving(false);
  }
}

  const actions = assessment
    ? riskGuidance[assessment.disasterType]
    : [];

  return (
    <section className="risk-page">
      <div className="reports-heading">
        <div>
          <p className="eyebrow">HAZARD ASSESSMENT</p>
          <h2>Risk Prediction</h2>
          <p>
            Assess reported conditions, understand risk factors,
            and review recommended preparedness actions.
          </p>
        </div>

        <CloudRain size={30} />
      </div>

      <div className="risk-notice">
        <ShieldAlert size={21} />
        <div>
          <strong>Prototype assessment — not a live forecast</strong>
          <p>
Results use selected severity and conditions plus fresh weather-model data only when available and location-matched. This is a rule-based prototype, not a trained AI prediction, verified forecast, or official emergency warning.
          </p>
        </div>
      </div>

      {weatherNotice && (
        <p className="risk-threshold-note" role="status">{weatherNotice}</p>
      )}
      {assessmentError && (
        <p className="risk-notice" role="alert">{assessmentError}</p>
      )}

      <article className="risk-input-card">
        <div className="risk-section-heading">
          <div className="risk-heading-icon">
            <Activity size={21} />
          </div>
          <div>
            <h3>Assessment inputs</h3>
            <p>Select the conditions you want to assess.</p>
          </div>
        </div>

        <form className="report-form risk-form" onSubmit={handleAssess}>
          
<label htmlFor="risk-report">Select an existing disaster report</label>

<select
  id="risk-report"
  value={selectedReportId}
  disabled={reportsLoading}
  onChange={(event) => {
    const reportId = event.target.value;
    setSelectedReportId(reportId);

    const selectedReport = reports.find(
      (report) => String(report.id) === reportId
    );

    if (selectedReport) {
      const typeMap = {
        flood: "Flood",
        cyclone: "Cyclone",
        earthquake: "Earthquake",
        fire: "Fire",
        landslide: "Landslide",
      };

      const mappedType =
        typeMap[(selectedReport.disaster_type || "").toLowerCase()];

      if (mappedType) {
        setDisasterType(mappedType);
      }

      const severityMap = {
        low: "Low",
        medium: "Medium",
        moderate: "Medium",
        high: "High",
        critical: "Critical",
      };

      const mappedSeverity =
        severityMap[(selectedReport.severity || "").toLowerCase()];

      if (mappedSeverity) {
        setSeverity(mappedSeverity);
      }

      setAssessment(null);
    }
  }}
>
  <option value="">
    {reportsLoading ? "Loading reports..." : "Choose a disaster report"}
  </option>

  {reports.map((report) => (
    <option key={report.id} value={String(report.id)}>
      {report.title} — {report.disaster_type} ({report.location_text || "Location unavailable"})
    </option>
  ))}
</select>

{!reportsLoading && reports.length === 0 && (
  <p>No disaster reports found. Submit a report first.</p>
)}

          <label htmlFor="risk-type">Disaster type</label>
          <select
            id="risk-type"
            value={disasterType}
            onChange={(event) =>
              updateInput(setDisasterType, event.target.value)
            }
          >
            {Object.keys(riskGuidance).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <label htmlFor="risk-severity">Reported severity</label>
          <select
            id="risk-severity"
            value={severity}
            onChange={(event) =>
              updateInput(setSeverity, event.target.value)
            }
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>

          <label htmlFor="risk-conditions">Observed conditions</label>
          <select
            id="risk-conditions"
            value={conditions}
            onChange={(event) =>
              updateInput(setConditions, event.target.value)
            }
          >
            <option value="Stable">Stable</option>
            <option value="Concerning">Concerning</option>
            <option value="Severe">Severe</option>
          </select>

          <div className="risk-scoring-note">
            <Info size={17} />
            <p>
The assessment combines severity (1–4 points), conditions (0–2), and up to 2 illustrative weather points. Maximum: 8. Rules are unvalidated examples, not official warning thresholds.
            </p>
          </div>

          <button className="risk-assess-button" type="submit" disabled={assessmentSaving}>
            <ShieldAlert size={18} />
            {assessmentSaving ? "Saving assessment..." : "Assess Risk"}
          </button>
        </form>
      </article>

      {!assessment ? (
        <div className="risk-empty-state">
          <div className="risk-empty-icon">
            <Activity size={25} />
          </div>
          <h3>Ready for assessment</h3>
          <p>
            Review your selected inputs and click Assess Risk
            to view the result and its contributing factors.
          </p>
        </div>
      ) : (
        <>
          <article
            className={`risk-result risk-${assessment.level.toLowerCase()}`}
            aria-live="polite"
          >
            <div className="risk-result-top">
              <div>
                <p className="eyebrow">RULE-BASED ASSESSMENT</p>
                <h3>{assessment.level} Risk</h3>
                <p className="risk-result-description">
                  {assessment.disasterType} · {assessment.severity} reported
                  severity · {assessment.conditions.toLowerCase()} conditions
                </p>
              </div>

              <div className="risk-score-circle">
                <strong>{assessment.score}</strong>
                <span>of 8 points</span>
              </div>
            </div>

            <div className="risk-score-track">
              <div
                className="risk-score-fill"
                style={{
                  width: `${Math.min(100, (assessment.score / 8) * 100)}%`,
                }}
              />
            </div>

            <p className="risk-result-explanation">
              {assessment.level === "Critical"
                ? "The selected inputs produce the highest assessment category. Review official emergency alerts and follow instructions from local authorities."
                : assessment.level === "High"
                  ? "The selected inputs produce an elevated assessment category. Review local warnings and preparedness needs."
                  : assessment.level === "Medium"
                    ? "The selected inputs produce a moderate assessment category. Monitor changing conditions and review preparedness measures."
                    : "The selected inputs produce a lower assessment category under this scoring rule. Continue monitoring conditions and official guidance."}
            </p>

            <div className="risk-assessed-time">
              <CheckCircle2 size={16} />
              Assessment completed at {assessment.assessedAt}
            </div>
          </article>

          
<article className="risk-breakdown">
  <h3>Why was this result assigned?</h3>
  <p className="risk-breakdown-subtitle">
    Review each input and its contribution to the assessment.
  </p>

  <div className="risk-factor-row">
    <div>
      <strong>Reported severity</strong>
      <p>{assessment.severity}</p>
    </div>
    <span>
      +{assessment.severityScore}{" "}
      {assessment.severityScore === 1 ? "point" : "points"}
    </span>
  </div>

  <div className="risk-factor-row">
    <div>
      <strong>Observed conditions</strong>
      <p>{assessment.conditions}</p>
    </div>
    <span>
      +{assessment.conditionScore}{" "}
      {assessment.conditionScore === 1 ? "point" : "points"}
    </span>
  </div>

  <div className="risk-factor-row">
    <div>
      <strong>Weather data contribution</strong>
      <p>
        {assessment.weatherLocation
          ? `Weather data for ${assessment.weatherLocation}`
          : "No weather data used"}
      </p>
      {assessment.weatherLocation && (
        <p>
          Precipitation: {assessment.weatherPrecipitation} mm ·
          Wind: {assessment.weatherWindSpeed} km/h
        </p>
      )}
    </div>
    <span>
      +{assessment.weatherScore}{" "}
      {assessment.weatherScore === 1 ? "point" : "points"}
    </span>
  </div>

  {assessment.reasons?.length > 0 && (
    <div className="risk-reasons">
      <strong>Assessment explanations</strong>
      <ul>
        {assessment.reasons.map((reason, index) => (
          <li key={index}>{reason}</li>
        ))}
      </ul>
    </div>
  )}

  <div className="risk-factor-total">
    <strong>Total assessment score</strong>
    <strong>{assessment.score} / {assessment.maxScore || 8}</strong>
  </div>

  <p className="risk-threshold-note">
    Illustrative prototype thresholds: Low 1–2, Medium 3–4, High 5, Critical 6–8. These rules are not validated disaster-warning thresholds.
  </p>

  {assessment.weatherLocation && (
    <p className="risk-threshold-note">
      Weather source: Open-Meteo weather model.
      {assessment.weatherTimestamp &&
        ` Weather timestamp: ${assessment.weatherTimestamp}.`}
    </p>
  )}
</article>


          <article className="risk-guidance">
            <div className="risk-section-heading">
              <div className="risk-heading-icon">
                <ShieldAlert size={21} />
              </div>
              <div>
                <h3>Recommended preparedness actions</h3>
                <p>
                  General guidance for {assessment.disasterType.toLowerCase()}.
                </p>
              </div>
            </div>

            <ul>
              {actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>

            <p className="risk-guidance-footer">
              Follow official local emergency instructions.
              These recommendations do not replace professional
              emergency advice.
            </p>
          </article>
        </>
      )}
    </section>
  );
}
