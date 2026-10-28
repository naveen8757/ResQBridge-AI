
import { useEffect, useState } from "react";
import { PackagePlus, Users, MapPin } from "lucide-react";
import { supabase } from "./supabase";

const resourceTypes = [
  "Food",
  "Drinking Water",
  "Medical Supplies",
  "Rescue Team",
  "Volunteer",
  "Shelter",
  "Transport",
  "Other",
];

export default function ResourceCoordination() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    resource_name: "",
    resource_type: "Food",
    quantity: 1,
    location_text: "",
  });

  async function loadResources() {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("response_resources")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
    } else {
      setResources(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadResources();
  }, []);
  
async function updateResourceAvailability(resourceId, availability) {
  if (!supabase) return;

  const { error } = await supabase
    .from("response_resources")
    .update({ availability })
    .eq("id", resourceId);

  if (error) {
    setMessage(`Availability update failed: ${error.message}`);
    return;
  }

  setResources((current) =>
    current.map((resource) =>
      resource.id === resourceId
        ? { ...resource, availability }
        : resource
    )
  );

  setMessage("Resource availability updated.");
}

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) throw new Error("Please sign in first.");

      const { error } = await supabase
        .from("response_resources")
        .insert([{
          ...form,
          quantity: Number(form.quantity),
        }]);

      if (error) throw error;

      setForm({
        resource_name: "",
        resource_type: "Food",
        quantity: 1,
        location_text: "",
      });

      setMessage("Resource registered successfully.");
      await loadResources();
    } catch (error) {
      setMessage(error.message || "Unable to register resource.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="reports-page">
      <div className="reports-heading">
        <div>
          <p className="eyebrow">RESPONSE NETWORK</p>
          <h2>Resource Coordination</h2>
          <p>Register available resources for response planning.</p>
        </div>
        <Users size={30} />
      </div>

      <form className="report-form" onSubmit={handleSubmit}>
        <label htmlFor="resource_name">Resource name</label>
        <input
          id="resource_name"
          name="resource_name"
          value={form.resource_name}
          onChange={handleChange}
          placeholder="e.g. Drinking water supplies"
          required
        />

        <label htmlFor="resource_type">Resource type</label>
        <select
          id="resource_type"
          name="resource_type"
          value={form.resource_type}
          onChange={handleChange}
        >
          {resourceTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        <label htmlFor="quantity">Quantity available</label>
        <input
          id="quantity"
          name="quantity"
          type="number"
          min="1"
          step="1"
          value={form.quantity}
          onChange={handleChange}
          required
        />

        <label htmlFor="location_text">
          <MapPin size={15} /> Resource location
        </label>
        <input
          id="location_text"
          name="location_text"
          value={form.location_text}
          onChange={handleChange}
          placeholder="Area or landmark"
          required
        />

        {message && <p className="report-message" role="status">{message}</p>}

        <button className="primary-button" type="submit" disabled={saving}>
          <PackagePlus size={17} />
          {saving ? "Registering..." : "Register resource"}
        </button>
      </form>

      <div className="saved-reports">
        
<div className="stats-grid resource-stats">
  <div className="stat-card">
    <p>Total Resources</p>
    <h3>{resources.length}</h3>
  </div>

  <div className="stat-card">
    <p>Available</p>
    <h3>
      {resources.filter((r) => r.availability === "Available").length}
    </h3>
  </div>

  <div className="stat-card">
    <p>Reserved</p>
    <h3>
      {resources.filter((r) => r.availability === "Reserved").length}
    </h3>
  </div>

  <div className="stat-card">
    <p>Deployed</p>
    <h3>
      {resources.filter((r) => r.availability === "Deployed").length}
    </h3>
  </div>
</div>

        <h3>Registered resources</h3>
        <p>Resources available in your account.</p>

        {loading ? (
          <p>Loading resources...</p>
        ) : resources.length === 0 ? (
          <p>No resources registered yet.</p>
        ) : (
          <div className="saved-reports-list">
            {resources.map((resource) => (
              <article className="saved-report-card" key={resource.id}>
                
<div className="saved-report-header">
  <h4>{resource.resource_name}</h4>

  <select
    value={resource.availability}
    onChange={(event) =>
      updateResourceAvailability(
        resource.id,
        event.target.value
      )
    }
    aria-label={`Availability for ${resource.resource_name}`}
  >
    <option value="Available">Available</option>
    <option value="Reserved">Reserved</option>
    <option value="Deployed">Deployed</option>
  </select>
</div>

                <p>
                  {resource.resource_type} · Quantity: {resource.quantity}
                </p>
                <div className="saved-report-footer">
                  <span>{resource.location_text}</span>
                  <span>
                    {new Date(resource.created_at).toLocaleString()}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
