
import { useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const markerIcon = L.icon({
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function LocationSelector({ position, onSelect }) {
  useMapEvents({
    click(event) {
      onSelect({
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });

  return position ? (
    <Marker
      position={[position.lat, position.lng]}
      icon={markerIcon}
    />
  ) : null;
}

export default function AgriculturalMap({ onLocationSelect }) {
  const [position, setPosition] = useState(null);
  const [mapType, setMapType] = useState("satellite");
  const [lookupStatus, setLookupStatus] = useState("");

  async function selectLocation(point) {
    setPosition(point);
    setLookupStatus("Finding the nearest place...");

    // Immediately send the coordinates to the parent component.
    onLocationSelect?.({ ...point, address: "" });

    try {
      const params = new URLSearchParams({
        format: "jsonv2",
        lat: String(point.lat),
        lon: String(point.lng),
        zoom: "10",
        addressdetails: "1",
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Location lookup is temporarily unavailable.");
      }

      const result = await response.json();
      const address = result.display_name || "";

      if (address) {
        onLocationSelect?.({ ...point, address });
        setLookupStatus("Nearby place found. Check the location field.");
      } else {
        setLookupStatus(
          "Place name unavailable. You can enter the village or district manually."
        );
      }
    } catch {
      setLookupStatus(
        "Could not look up the place name. You can still use the map coordinates and enter the location manually."
      );
    }
  }

  function clearLocation() {
    setPosition(null);
    setLookupStatus("");
    onLocationSelect?.(null);
  }

  const tileUrl =
    mapType === "satellite"
      ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  return (
    <section className="agricultural-map-panel">
      <h3>📍 Select Affected Farmland</h3>

      <p>
        Click the map to select the affected farmland. The app will
        attempt to find a nearby place name and its coordinates.
      </p>

      <div className="agricultural-map-controls">
        <label htmlFor="agri-map-type">Map view</label>

        <select
          id="agri-map-type"
          value={mapType}
          onChange={(event) => setMapType(event.target.value)}
        >
          <option value="satellite">Satellite imagery</option>
          <option value="street">Street map</option>
        </select>
      </div>

      <MapContainer
        center={[11.1271, 78.6569]}
        zoom={7}
        scrollWheelZoom
        className="agricultural-leaflet-map"
      >
        <TileLayer
          key={mapType}
          attribution={
            mapType === "satellite"
              ? "&copy; Esri and its imagery providers"
              : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
          url={tileUrl}
        />

        <LocationSelector
          position={position}
          onSelect={selectLocation}
        />
      </MapContainer>

      {position ? (
        <div className="agricultural-selected-location">
          <strong>Selected location</strong>

          <p>
            Latitude: {position.lat}
            <br />
            Longitude: {position.lng}
          </p>

          <p role="status">{lookupStatus}</p>

          <button type="button" onClick={clearLocation}>
            Clear location pin
          </button>
        </div>
      ) : (
        <p>Select a point on the map to get its coordinates.</p>
      )}
    </section>
  );
}