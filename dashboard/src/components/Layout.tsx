import { NavLink, Outlet } from "react-router-dom";

export default function Layout({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="app-shell">
      <nav className="nav">
        <NavLink to="/" end>
          Overview
        </NavLink>
        <NavLink to="/schedule">Reminder schedule</NavLink>
        <NavLink to="/enrollments">Clients</NavLink>
        <NavLink to="/sms-subscribers">SMS subscribers</NavLink>
        <NavLink to="/send">Send now</NavLink>
        <NavLink to="/bulk-sms">Bulk SMS</NavLink>
        <NavLink to="/sms-log">SMS log</NavLink>
        <span className="nav-right">
          <button type="button" className="btn btn-secondary btn-small" onClick={onLogout}>
            Sign out
          </button>
        </span>
      </nav>
      <Outlet />
    </div>
  );
}
