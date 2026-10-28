export const SEVERITY_POINTS = Object.freeze({
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
});

export const CONDITION_POINTS = Object.freeze({
  Stable: 0,
  Concerning: 1,
  Severe: 2,
});

export const WEATHER_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Explainable prototype score only. These illustrative thresholds are not
 * validated disaster thresholds, a trained model, or an official warning.
 */
export function calculateRiskAssessment({ severity, conditions, weatherData = null }) {
  if (!(severity in SEVERITY_POINTS)) {
    throw new Error(`Unsupported severity: ${severity}`);
  }
  if (!(conditions in CONDITION_POINTS)) {
    throw new Error(`Unsupported conditions: ${conditions}`);
  }

  const severityScore = SEVERITY_POINTS[severity];
  const conditionScore = CONDITION_POINTS[conditions];
  let weatherScore = 0;
  const reasons = [
    `Selected disaster severity: ${severity} (+${severityScore}).`,
    `Observed conditions: ${conditions} (+${conditionScore}).`,
  ];

  if (weatherData) {
    const precipitation = Number(weatherData.precipitation);
    const windSpeed = Number(weatherData.wind_speed_10m);
    if (Number.isFinite(precipitation) && precipitation >= 20) {
      weatherScore += 1;
      reasons.push(`Precipitation is ${precipitation} mm; the illustrative rule adds 1 point at 20 mm or above.`);
    } else {
      reasons.push(`Precipitation is ${Number.isFinite(precipitation) ? `${precipitation} mm` : "unavailable"}; no precipitation point was added by the illustrative rule.`);
    }
    if (Number.isFinite(windSpeed) && windSpeed >= 40) {
      weatherScore += 1;
      reasons.push(`Wind speed is ${windSpeed} km/h; the illustrative rule adds 1 point at 40 km/h or above.`);
    } else {
      reasons.push(`Wind speed is ${Number.isFinite(windSpeed) ? `${windSpeed} km/h` : "unavailable"}; no wind point was added by the illustrative rule.`);
    }
  } else {
    reasons.push("Weather data was unavailable, stale, or not matched to the selected incident; only selected inputs were used.");
  }

  const score = severityScore + conditionScore + weatherScore;
  const level = score >= 6 ? "Critical" : score >= 5 ? "High" : score >= 3 ? "Medium" : "Low";

  return {
    score,
    maxScore: 8,
    level,
    severityScore,
    conditionScore,
    weatherScore,
    reasons,
    weatherLocation: weatherData?.location ?? null,
    weatherTimestamp: weatherData?.time ?? null,
    weatherRetrievedAt: weatherData?.retrievedAt ?? null,
    weatherPrecipitation: weatherData && Number.isFinite(Number(weatherData.precipitation)) ? Number(weatherData.precipitation) : null,
    weatherWindSpeed: weatherData && Number.isFinite(Number(weatherData.wind_speed_10m)) ? Number(weatherData.wind_speed_10m) : null,
    weatherSource: weatherData?.source ?? null,
  };
}

export function isWeatherFresh(weatherData, now = Date.now()) {
  if (!weatherData) return false;
  const reference = weatherData.retrievedAt || weatherData.time;
  const timestamp = typeof reference === "number" ? reference : Date.parse(reference || "");
  return Number.isFinite(timestamp) && now - timestamp >= 0 && now - timestamp <= WEATHER_MAX_AGE_MS;
}

export function weatherMatchesLocation(weatherData, locationText) {
  if (!weatherData?.location || !locationText) return false;
  const city = String(weatherData.location).trim().toLowerCase();
  const incident = String(locationText).trim().toLowerCase();
  return Boolean(city && incident && (incident.includes(city) || city.includes(incident)));
}
