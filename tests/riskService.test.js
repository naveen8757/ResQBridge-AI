import test from "node:test";
import assert from "node:assert/strict";
import { calculateRiskAssessment, isWeatherFresh, weatherMatchesLocation } from "../src/services/riskService.js";

test("risk score combines severity, conditions and weather indicators", () => {
  const result = calculateRiskAssessment({
    severity: "Medium",
    conditions: "Concerning",
    weatherData: { location: "Chennai", precipitation: 30, wind_speed_10m: 45, time: "2026-10-26T13:45", retrievedAt: "2026-10-26T08:30:00.000Z", source: "Open-Meteo weather model" },
  });
  assert.equal(result.severityScore, 2);
  assert.equal(result.conditionScore, 1);
  assert.equal(result.weatherScore, 2);
  assert.equal(result.score, 5);
  assert.equal(result.level, "High");
  assert.equal(result.maxScore, 8);
  assert.equal(result.reasons.length, 4);
});

test("risk score works without weather and never describes a probability", () => {
  const result = calculateRiskAssessment({ severity: "Low", conditions: "Stable" });
  assert.equal(result.score, 1);
  assert.equal(result.level, "Low");
  assert.equal(result.weatherScore, 0);
  assert.match(result.reasons.join(" "), /Weather data was unavailable/);
});

test("invalid input values are rejected", () => {
  assert.throws(() => calculateRiskAssessment({ severity: "Extreme", conditions: "Stable" }));
  assert.throws(() => calculateRiskAssessment({ severity: "Low", conditions: "Dangerous" }));
});

test("weather freshness uses the retrieval timestamp", () => {
  const now = Date.parse("2026-10-26T10:00:00.000Z");
  assert.equal(isWeatherFresh({ retrievedAt: "2026-10-26T09:00:00.000Z" }, now), true);
  assert.equal(isWeatherFresh({ retrievedAt: "2026-10-25T09:00:00.000Z" }, now), false);
});

test("weather must match the incident location", () => {
  assert.equal(weatherMatchesLocation({ location: "Chennai" }, "Test area, Chennai, Tamil Nadu"), true);
  assert.equal(weatherMatchesLocation({ location: "Chennai" }, "Madurai, Tamil Nadu"), false);
});
