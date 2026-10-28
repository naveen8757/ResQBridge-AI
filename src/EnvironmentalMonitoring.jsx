
import { useEffect,useState } from "react";
import {
  CloudRain,
  MapPin,
  Activity,
  RefreshCw,
  ShieldAlert,
  Info,
} from "lucide-react";
import "./EnvironmentalMonitoring.css";
import { supabase } from "./supabase";

export default function EnvironmentalMonitoring() {
  const [scenario, setScenario] = useState("moderate");
  const [location, setLocation] = useState("Chennai");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [scenarioUpdatedAt, setScenarioUpdatedAt] = useState(null);
  const [weather, setWeather] = useState(null);
  const [hourlyForecast, setHourlyForecast] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [weatherSaveNotice, setWeatherSaveNotice] = useState("");

  const scenarios = {
    low: {
      label: "Low rainfall",
      rainfall: 10,
      risk: "Low",
      description: "Low rainfall scenario. Continue routine monitoring.",
    },
    moderate: {
      label: "Moderate rainfall",
      rainfall: 45,
      risk: "Moderate",
      description:
        "Moderate rainfall scenario. Monitor local conditions and drainage.",
    },
    heavy: {
      label: "Heavy rainfall",
      rainfall: 100,
      risk: "High",
      description:
        "High rainfall scenario. Review local alerts and preparedness measures.",
    },
  };

  const selectedScenario = scenarios[scenario];
  const locationCoordinates = {
  Chennai: { latitude: 13.0827, longitude: 80.2707 },
  Coimbatore: { latitude: 11.0168, longitude: 76.9558 },
  Madurai: { latitude: 9.9252, longitude: 78.1198 },
  Tirunelveli: { latitude: 8.7139, longitude: 77.7567 },
};
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("resqbridge_latest_weather") || "null");
      if (saved && saved.location === location && typeof saved.precipitation === "number" && typeof saved.wind_speed_10m === "number") {
        setWeather(saved);
        setHourlyForecast(saved.hourlyForecast || null);
        if (saved.retrievedAt) setUpdatedAt(new Date(saved.retrievedAt).toLocaleTimeString("en-IN"));
      }
    } catch {
      // A malformed cached response should not prevent monitoring from opening.
    }
  }, []);

  useEffect(() => {
  const monitoringData = {
    location,
    scenario,
    rainfall: selectedScenario.rainfall,
    risk: selectedScenario.risk,
    updatedAt: new Date().toISOString(),
    source: "SIMULATION",
  };

  localStorage.setItem(
    "resqbridge_environmental_monitoring",
    JSON.stringify(monitoringData)
  );
}, [location, scenario, selectedScenario.rainfall, selectedScenario.risk]);

async function refreshScenario() {
  const coordinates = locationCoordinates[location];

  if (!coordinates) {
    setWeatherError("Weather data is unavailable for this location.");
    return;
  }

  setWeatherLoading(true);
  setWeatherError("");
  setWeatherSaveNotice("");

  try {
    const params = new URLSearchParams({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      current: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
      hourly: "precipitation,precipitation_probability,wind_speed_10m",
      forecast_days: "1",
      timezone: "Asia/Kolkata",
    });

    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error("Weather service request failed.");
    }

    const data = await response.json();

    if (!data.current) {
      throw new Error("No current weather data was returned.");
    }

    const hourlyTimes = data.hourly?.time || [];
    const currentHour = String(data.current.time || "").slice(0, 13);
    const foundIndex = hourlyTimes.findIndex((time) => time >= currentHour);
    const forecastStartIndex = foundIndex >= 0 ? foundIndex : 0;
    const forecastEndIndex = forecastStartIndex + 6;
    const savedForecast = hourlyTimes.length ? {
      time: hourlyTimes.slice(forecastStartIndex, forecastEndIndex),
      precipitation: (data.hourly.precipitation || []).slice(forecastStartIndex, forecastEndIndex),
      precipitation_probability: (data.hourly.precipitation_probability || []).slice(forecastStartIndex, forecastEndIndex),
      wind_speed_10m: (data.hourly.wind_speed_10m || []).slice(forecastStartIndex, forecastEndIndex),
    } : null;
    const savedWeather = {
      location,
      ...data.current,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      hourlyForecast: savedForecast,
      retrievedAt: new Date().toISOString(),
      source: "Open-Meteo weather model",
    };
    setWeather(savedWeather);
    setHourlyForecast(savedForecast);
    localStorage.setItem("resqbridge_latest_weather", JSON.stringify(savedWeather));
    setUpdatedAt(new Date().toLocaleTimeString("en-IN"));

    // Persist an observation for traceability when Supabase is configured.
    // A database write failure does not hide the successfully fetched weather.
    if (supabase) {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          const { error: saveError } = await supabase.from("environmental_observations").insert({
            user_id: userData.user.id,
            location,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            temperature: data.current.temperature_2m,
            relative_humidity: data.current.relative_humidity_2m,
            precipitation: data.current.precipitation,
            wind_speed: data.current.wind_speed_10m,
            weather_code: data.current.weather_code,
            observation_time: data.current.time,
            retrieved_at: savedWeather.retrievedAt,
            source: savedWeather.source,
          });
          if (saveError) {
            console.warn("Weather fetched but observation was not saved to Supabase:", saveError.message);
            setWeatherSaveNotice("Weather was fetched and cached locally, but the observation could not be saved to the database.");
          }
        }
      } catch (saveError) {
        console.warn("Weather observation persistence failed:", saveError);
        setWeatherSaveNotice("Weather was fetched and cached locally; database history is unavailable.");
      }
    }
  } catch (error) {
    setWeatherError(
      "Unable to fetch weather data. Check your internet connection and try again."
    );
  } finally {
    setWeatherLoading(false);
  }
}

  return (
    <div className="environment-page">
      <div className="environment-heading">
        <div>
          <p className="environment-eyebrow">
            DISASTER INTELLIGENCE
          </p>
          <h2>Environmental Monitoring</h2>
          <p>
            Explore rainfall scenarios and review environmental
            risk indicators.
          </p>
        </div>

        <span className="simulation-badge">
  {weather ? "WEATHER DATA CONNECTED" : "SIMULATION MODE"}
</span>
      </div>

      <div className="environment-notice">
        <Info size={19} />
        <p>
          The rainfall scenario below is simulated. The separate weather panel displays provider-returned weather-model data; neither is a local sensor reading or an official disaster warning.
        </p>
      </div>

      <div className="environment-grid">
        <section className="environment-card">
          <div className="environment-card-heading">
            <CloudRain size={22} />
            <span>Rainfall scenario</span>
          </div>

          <label htmlFor="environment-location">
            Monitored location
          </label>

          <select
            id="environment-location"
            value={location}
            onChange={(event) => {
              setLocation(event.target.value);
              setWeather(null);
              setHourlyForecast(null);
              setUpdatedAt(null);
              setWeatherError("");
            }}
          >
            <option value="Chennai">Chennai</option>
            <option value="Coimbatore">Coimbatore</option>
            <option value="Madurai">Madurai</option>
            <option value="Tirunelveli">Tirunelveli</option>
          </select>

          <label htmlFor="rainfall-scenario">
            Select a scenario
          </label>

          <select
            id="rainfall-scenario"
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value);
              setScenarioUpdatedAt(new Date().toLocaleTimeString("en-IN"));
            }}
          >
            <option value="low">Low rainfall</option>
            <option value="moderate">Moderate rainfall</option>
            <option value="heavy">Heavy rainfall</option>
          </select>

          <button
            type="button"
            className="environment-button"
            onClick={() => setScenarioUpdatedAt(new Date().toLocaleTimeString("en-IN"))}
          >
            <RefreshCw size={17} />
            Update scenario
          </button>

          {scenarioUpdatedAt && (
            <p className="environment-update-time">
              Scenario updated at {scenarioUpdatedAt}
            </p>
          )}
        </section>

        <section className="environment-card">
          <div className="environment-card-heading">
            <Activity size={22} />
            <span>Scenario overview</span>
          </div>

          <p className="environment-label">Selected location</p>
          <h3>
            <MapPin size={19} />
            {location}
          </h3>

          <p className="environment-label">
            Illustrative rainfall input
          </p>
          <div className="environment-value">
            {selectedScenario.rainfall}
            <span> mm (scenario input)</span>
          </div>

          <div className="rainfall-meter">
            <div
              className={`rainfall-meter-fill ${scenario}`}
              style={{
                width: `${selectedScenario.rainfall}%`,
              }}
            />
          </div>

          <p className="environment-label">
            Scenario indicator
          </p>
          <span className={`scenario-risk ${scenario}`}>
            {selectedScenario.risk}
          </span>

          <p className="environment-description">
            {selectedScenario.description}
          </p>
        </section>
      </div>
      <section className="environment-card environment-weather">
        <div className="environment-card-heading">
          <CloudRain size={22} />
          <span>Current Weather Data</span>
        </div>

        <p className="environment-description">
          Location: {location}. Weather-model data retrieved from Open-Meteo when you fetch it. Cached values may be older and should be checked before use. These values are not official disaster warnings.
        </p>

        <button
          className="environment-button"
          onClick={refreshScenario}
          disabled={weatherLoading}
        >
          <RefreshCw size={17} />
          {weatherLoading ? "Fetching weather..." : "Fetch current weather"}
        </button>

        {weatherError && (
          <p role="alert" className="environment-description">
            {weatherError}
          </p>
        )}
        {weatherSaveNotice && (
          <p role="status" className="environment-description">{weatherSaveNotice}</p>
        )}

        {weather && (
          <>
            <div className="environment-grid environment-weather-grid">
              <div className="environment-weather-metric">
                <span>Temperature</span>
                <strong>{weather.temperature_2m} °C</strong>
              </div>

              <div className="environment-weather-metric">
                <span>Precipitation</span>
                <strong>{weather.precipitation} mm</strong>
              </div>

              <div className="environment-weather-metric">
                <span>Relative humidity</span>
                <strong>{weather.relative_humidity_2m}%</strong>
              </div>

              <div className="environment-weather-metric">
                <span>Wind speed</span>
                <strong>{weather.wind_speed_10m} km/h</strong>
              </div>
            </div>

            <p className="environment-update-time">
              Weather timestamp: {weather.time}
            </p>

            <p className="environment-update-time">
              Retrieved at: {updatedAt}
            </p>
            {hourlyForecast?.time?.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h3 style={{ color: "#10283b", marginBottom: 6 }}>Next 6 hourly forecast points</h3>
                <p className="environment-description" style={{ marginTop: 0 }}>Forecast indicators only. They do not show floodwater movement or a cyclone track.</p>
                <div className="environment-forecast-grid">
                  {hourlyForecast.time.map((time, index) => (
                    <div className="environment-weather-metric" key={time}>
                      <span>{new Date(time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                      <strong>{hourlyForecast.precipitation?.[index] ?? "—"} mm</strong>
                      <small>Rain chance: {hourlyForecast.precipitation_probability?.[index] ?? "—"}%</small>
                      <small>Wind: {hourlyForecast.wind_speed_10m?.[index] ?? "—"} km/h</small>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
      <section className="environment-card environment-guidance">
        <div className="environment-card-heading">
          <ShieldAlert size={22} />
          <span>Preparedness guidance</span>
        </div>

        <ul>
          <li>Follow official weather and disaster-management updates.</li>
          <li>Keep emergency contacts and essential supplies accessible.</li>
          <li>Report hazards through the community reporting module.</li>
          <li>Do not use this simulation to make real-world safety decisions.</li>
        </ul>
      </section>
    </div>
  );
}