import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearToken, getToken } from "../lib/api";

export default function Layout() {
  const navigate = useNavigate();
  const token = getToken();

  if (!token) {
    navigate("/login", { replace: true });
    return null;
  }

  function logout() {
    clearToken();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <nav className="nav">
        <NavLink to="/" end>
          Overview
        </NavLink>
        <NavLink to="/schedule">Reminder schedule</NavLink>
        <NavLink to="/send">Send now</NavLink>
        <NavLink to="/sms-log">SMS log</NavLink>
        <div className="nav-right">
          <span className="muted">Auto-refreshes hourly</span>
          <button type="button" className="btn btn-secondary" onClick={logout}>
            Log out
          </button>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
