
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401, headers: corsHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json(
        { error: "Invalid session" },
        { status: 401, headers: corsHeaders },
      );
    }

    const { data: reviewer, error: reviewerError } = await supabase
      .from("community_alert_reviewers")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (reviewerError || !reviewer) {
      return Response.json(
        { error: "Authorized reviewer access required" },
        { status: 403, headers: corsHeaders },
      );
    }

    const body = await req.json();
    const alertId = body.alert_id;

    if (
      typeof alertId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(alertId)
    ) {
      return Response.json(
        { error: "A valid alert_id is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const { data: alert, error: alertError } = await supabase
      .from("community_alerts")
      .select("id, title, message, status, source_verified, location_text")
      .eq("id", alertId)
      .maybeSingle();

    if (alertError || !alert) {
      return Response.json(
        { error: "Alert not found or inaccessible" },
        { status: 404, headers: corsHeaders },
      );
    }

    if (alert.status !== "Approved" || alert.source_verified !== true) {
      return Response.json(
        { error: "Alert must be approved and independently verified" },
        { status: 409, headers: corsHeaders },
      );
    }

    

    // Authenticated users cannot read other users' auth records.
    // Use a server-only service-role client to look up email addresses
    // only after authorization and alert-verification checks.
    const serviceRoleKey = Deno.env.get("RESQBRIDGE_SERVICE_ROLE_KEY");

    if (!serviceRoleKey) {
      throw new Error("RESQBRIDGE_SERVICE_ROLE_KEY is not configured");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
const { data: queuedNotifications, error: recipientsError } = await admin
  .from("user_notifications")
  .select("id, user_id")
  .eq("alert_id", alertId)
  .eq("email_status", "queued")
  .is("email_claimed_at", null);

if (recipientsError) {
  throw recipientsError;
}

const recipientIds = [
  ...new Set((queuedNotifications ?? []).map((notification) => notification.user_id)),
];

let optedInUserIds = new Set<string>();

if (recipientIds.length > 0) {
  const { data: preferences, error: preferencesError } = await admin
    .from("user_notification_preferences")
    .select("user_id")
    .in("user_id", recipientIds)
    .eq("email_enabled", true);

  if (preferencesError) {
    // Fail closed: do not send emails if preferences cannot be checked.
    throw preferencesError;
  }

  optedInUserIds = new Set(
    (preferences ?? []).map((preference) => preference.user_id)
  );
}

const optedOutNotificationIds = (queuedNotifications ?? [])
  .filter((notification) => !optedInUserIds.has(notification.user_id))
  .map((notification) => notification.id);

if (optedOutNotificationIds.length > 0) {
  const { error: skipError } = await admin
    .from("user_notifications")
    .update({ email_status: "skipped" })
    .in("id", optedOutNotificationIds)
    .eq("alert_id", alertId)
    .eq("email_status", "queued")
    .is("email_claimed_at", null);

  if (skipError) {
    // Fail safely if consent-related notification updates fail.
    throw skipError;
  }
}

const recipients = (queuedNotifications ?? [])
  .filter((notification) => optedInUserIds.has(notification.user_id))
  .map((notification) => ({
    id: notification.user_id,
    notificationId: notification.id,
  }));

if (!recipients?.length) {
  return Response.json(
    { error: "No queued email recipients. Queue notifications first." },
    { status: 409, headers: corsHeaders },
  );
}

const uniqueRecipients = [
  ...new Map(recipients.map((r) => [r.id, r])).values(),
];

// TEST MODE: allow only one explicitly configured recipient.
const testRecipientEmail = Deno.env.get("RESQBRIDGE_TEST_EMAIL");

if (!testRecipientEmail) {
  throw new Error("RESQBRIDGE_TEST_EMAIL is not configured");
}

const emailRecipients: {
  id: string;
  notificationId: string;
  email: string;
}[] = [];

for (const notification of uniqueRecipients) {
  const userId = notification.id;

  const { data: authUser, error: authUserError } =
    await admin.auth.admin.getUserById(userId);

  if (authUserError || !authUser.user?.email) continue;

  if (
    authUser.user.email.toLowerCase() ===
    testRecipientEmail.trim().toLowerCase()
  ) {
    emailRecipients.push({
      id: userId,
      notificationId: notification.notificationId,
      email: authUser.user.email,
    });
  }
}

    if (!emailRecipients.length) {
      return Response.json(
        { error: "No recipients with available email addresses" },
        { status: 409, headers: corsHeaders },
      );
    }

    const from = Deno.env.get("RESEND_FROM_EMAIL");

    if (!from) {
      throw new Error("RESEND_FROM_EMAIL is not configured");
    }

    const results = [];

    for (const recipient of emailRecipients) {
      const { data: claimed, error: claimError } = await supabase.rpc(
  "claim_alert_email",
  { p_notification_id: recipient.notificationId },
);

if (claimError || claimed !== true) {
  results.push({
    user_id: recipient.id,
    status: "skipped",
  });
  continue;
}

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [recipient.email],
          subject: `ResQBridge AI: ${alert.title}`,
          text: [
            alert.title,
            "",
            alert.message,
            "",
            `Location: ${alert.location_text ?? "See the app for details"}`,
            "",
            "Please check official local authorities for confirmed safety instructions.",
          ].join("\n"),
        }),
      });

      const result = await response.json();

      
if (!response.ok) {
  console.error("Resend rejected email:", response.status, result);
  results.push({
    user_id: recipient.id,
    status: "failed",
  });
  continue;
}
        

const { data: updatedNotification, error: updateError } = await admin
  .from("user_notifications")
  .update({
    email_status: "sent",
    email_sent_at: new Date().toISOString(),
  })
  .eq("id", recipient.notificationId)
  .eq("email_status", "queued")
  .select("id")
  .maybeSingle();

if (updateError || !updatedNotification) {
  console.error(
    "Email may have been sent, but notification status update failed:",
    updateError,
  );

  results.push({
    user_id: recipient.id,
    status: "sent_status_update_failed",
  });
  continue;
}

      results.push({ user_id: recipient.id, status: "sent" });
    }

    return Response.json(
      {
        success: true,
        processed: results.length,
        results,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("send-alert-email error:", error);

    return Response.json(
      { error: "Email delivery failed. Check Edge Function logs." },
      { status: 500, headers: corsHeaders },
    );
  }
});
