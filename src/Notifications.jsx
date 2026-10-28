
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "./supabase";

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("Please sign in to view notifications.");
      setNotifications([]);
      setLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("user_notifications")
      .select(
        "id, title, message, notification_type, created_at, read_at, email_status"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (queryError) {
      setError(queryError.message);
      setNotifications([]);
    } else {
      setNotifications(data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  async function markAsRead(id) {
    setBusyId(id);
    setError("");

    const { error: updateError } = await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null);

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadNotifications();
    }

    setBusyId(null);
  }

  const unreadCount = notifications.filter(
    (item) => !item.read_at
  ).length;

  return (
    <section className="notifications-page">
      <div className="notifications-header">
        <div>
          <h2>
            <Bell size={22} /> Notifications
          </h2>
          <p>
            {unreadCount} unread notification
            {unreadCount === 1 ? "" : "s"}
          </p>
        </div>

        <button
          type="button"
          onClick={loadNotifications}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="notification-error">
          {error}
        </p>
      )}

      {loading ? (
        <p>Loading notifications...</p>
      ) : notifications.length === 0 ? (
        <div className="notifications-empty">
          <Bell size={32} />
          <p>No notifications yet.</p>
          <small>
            Eligible, verified alerts will appear here when queued.
          </small>
        </div>
      ) : (
        <div className="notifications-list">
          {notifications.map((item) => (
            <article
              key={item.id}
              className={`notification-card ${
                item.read_at ? "is-read" : "is-unread"
              }`}
            >
              <div className="notification-icon">
                <ShieldAlert size={20} />
              </div>

              <div className="notification-content">
                <h3>{item.title}</h3>
                <p>{item.message}</p>

                <small>
                  {new Date(item.created_at).toLocaleString()}
                </small>

                <small>
                  Email status: {item.email_status}
                </small>
              </div>

              {!item.read_at && (
                <button
                  type="button"
                  onClick={() => markAsRead(item.id)}
                  disabled={busyId === item.id}
                  aria-label="Mark notification as read"
                  title="Mark as read"
                >
                  <CheckCheck size={18} />
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
