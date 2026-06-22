import { FormEvent, useState } from "react";
import { login, setToken } from "../lib/api";

export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(password);
      setToken(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="panel login-panel">
        <h1 style={{ marginTop: 0 }}>SNP Dashboard</h1>
        <p className="muted">Enter the dashboard password to continue.</p>

        <form onSubmit={handleSubmit}>
          <label className="muted" htmlFor="dashboard-password">
            Password
          </label>
          <input
            id="dashboard-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            style={{ display: "block", width: "100%", marginTop: "0.35rem", marginBottom: "1rem" }}
          />

          {error && <div className="error-banner">{error}</div>}

          <button type="submit" className="btn" disabled={loading || !password.trim()}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
