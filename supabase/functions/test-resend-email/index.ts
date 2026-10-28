
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
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("RESQBRIDGE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL");
    const testEmail = Deno.env.get("RESQBRIDGE_TEST_EMAIL");

    if (!serviceRoleKey || !resendApiKey || !from || !testEmail) {
      return Response.json(
        { error: "Required server secrets are missing" },
        { status: 500, headers: corsHeaders },
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } =
      await userClient.auth.getUser();

    if (userError || !userData.user) {
      return Response.json(
        { error: "Invalid authentication" },
        { status: 401, headers: corsHeaders },
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: reviewer, error: reviewerError } = await admin
      .from("community_alert_reviewers")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (reviewerError || !reviewer) {
      return Response.json(
        { error: "Authorized reviewer required" },
        { status: 403, headers: corsHeaders },
      );
    }

    // Always send to the configured test recipient, never a request-supplied address.
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [testEmail],
        subject: "ResQBridge AI — Email delivery test",
        text: "This is a test message from ResQBridge AI. No disaster alert was sent or changed.",
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend test failed:", response.status, result);
      return Response.json(
        { error: "Email provider rejected the test message" },
        { status: 502, headers: corsHeaders },
      );
    }

    return Response.json(
      { success: true, message: "Test email accepted by Resend", id: result.id },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Test email function error:", error);
    return Response.json(
      { error: "Test email failed" },
      { status: 500, headers: corsHeaders },
    );
  }
});
