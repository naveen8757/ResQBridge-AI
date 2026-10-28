
import { useState } from "react";
import { ShieldCheck, Mail, Lock, ArrowRight } from "lucide-react";
import { supabase } from "./supabase";
import "./Auth.css";

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Supabase configuration is missing. Check .env.local.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onAuthenticated();
  
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        if (data.user) {
          // Save the user's profile in the database.
          // The email may be unconfirmed, so the profile insert
          // will happen after authentication if no session exists.
          if (data.session) {
            const { error: profileError } = await supabase
              .from("profiles")
              .upsert(
                {
                  id: data.user.id,
                  email: data.user.email,
                },
                { onConflict: "id" }
              );

            if (profileError) {
              console.error(
                "Profile save failed:",
                profileError.message
              );
              throw new Error(
                "Account created, but profile saving failed: " +
                  profileError.message
              );
            }

            onAuthenticated();
          } else {
            setMessage(
              "Registration received. Check your email to confirm your account, then sign in."
            );
            setMode("login");
          }
        }
      }
      
    } catch (error) {
      setMessage(error.message || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-brand">
          <div className="auth-logo"><ShieldCheck size={28} /></div>
          <span>ResQBridge <b>AI</b></span>
        </div>
        <div className="auth-message">
          <p className="auth-eyebrow">DISASTER INTELLIGENCE & RESPONSE</p>
          <h1>When every moment matters, every connection counts.</h1>
          <p>One platform for community reports, coordinated response, preparedness and recovery.</p>
        </div>
        <p className="auth-panel-footer">Predict early. Prepare smarter. Rebuild together.</p>
      </section>

      <section className="auth-form-panel">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-mobile-logo">
            <ShieldCheck size={28} /> ResQBridge AI
          </div>
          <p className="auth-eyebrow">{mode === "login" ? "WELCOME BACK" : "JOIN THE NETWORK"}</p>
          <h2>{mode === "login" ? "Sign in to your workspace" : "Create your account"}</h2>
          <p className="auth-description">
            {mode === "login"
              ? "Enter your details to continue to ResQBridge AI."
              : "Register to access the disaster response workspace."}
          </p>

          <label htmlFor="email">Email address</label>
          <div className="auth-input-wrap">
            <Mail size={18} />
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <label htmlFor="password">Password</label>
          <div className="auth-input-wrap">
            <Lock size={18} />
            <input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              required
            />
          </div>

          {message && <div className="auth-message-box" role="status">{message}</div>}

          <button className="auth-submit" disabled={loading} type="submit">
            {loading
              ? "Please wait..."
              : mode === "login" ? "Sign in" : "Create account"}
            {!loading && <ArrowRight size={18} />}
          </button>

          <p className="auth-switch">
            {mode === "login" ? "New to ResQBridge AI?" : "Already have an account?"}
            {" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setMessage("");
              }}
            >
              {mode === "login" ? "Create account" : "Sign in"}
            </button>
          </p>
          <p className="auth-security">Your account is protected by Supabase authentication.</p>
        </form>
      </section>
    </main>
  );
}
