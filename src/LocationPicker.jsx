
import { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

const defaultCenter = [13.0827, 80.2707];

function MapClickHandler({ onLocationSelect }) {
  useMapEvents({
    click(event) {
      onLocationSelect([
        event.latlng.lat,
        event.latlng.lng,
      ]);
    },
  });

  return null;
}

function MapCenterUpdater({ position }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.setView(position, Math.max(map.getZoom(), 13));
    }
  }, [position, map]);

  return null;
}

export default function LocationPicker({
  latitude,
  longitude,
  onLocationSelect,
}) {
  const [position, setPosition] = useState(
    latitude != null && longitude != null
      ? [Number(latitude), Number(longitude)]
      : null
  );

  useEffect(() => {
    if (latitude != null && longitude != null) {
      setPosition([Number(latitude), Number(longitude)]);
    }
  }, [latitude, longitude]);

  function handleSelect(coords) {
    setPosition(coords);

    onLocationSelect({
      latitude: coords[0],
      longitude: coords[1],
    });
  }

  return (
    <div>
      <p>
        Use your GPS location or click the map
        to select the incident location.
      </p>

      <MapContainer
        center={position || defaultCenter}
        zoom={10}
        style={{
          height: "350px",
          width: "100%",
          borderRadius: "12px",
        }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapCenterUpdater position={position} />

        <MapClickHandler
          onLocationSelect={handleSelect}
        />

        {position && <Marker position={position} />}
      </MapContainer>

      <p role="status">
        {position
          ? `Selected: ${position[0].toFixed(5)}, ${position[1].toFixed(5)}`
          : "No location selected yet."}
      </p>
    </div>
  );
}
