import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Overview", end: true },
  { to: "/schedule", label: "Schedule" },
  { to: "/appointments", label: "Appointments" },
  { to: "/tips", label: "Tips" },
  { to: "/sms-queue", label: "Scheduled SMS" },
  { to: "/enrollments", label: "Clients" },
  { to: "/sms-subscribers", label: "Subscribers" },
  { to: "/send", label: "Send now" },
  { to: "/bulk-sms", label: "Bulk SMS" },
  { to: "/sms-log", label: "SMS log" },
] as const;

export default function Layout({ onLogout }: { onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-bar">
          <span className="app-brand">SNP Dashboard</span>
          <div className="app-header-actions">
            <button
              type="button"
              className="btn btn-secondary btn-small nav-signout-mobile"
              onClick={onLogout}
            >
              Sign out
            </button>
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={menuOpen}
              aria-controls="main-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="nav-toggle-icon" aria-hidden />
            </button>
          </div>
        </div>

        {menuOpen && (
          <button
            type="button"
            className="nav-backdrop"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
        )}

        <nav id="main-nav" className={`nav ${menuOpen ? "nav-open" : ""}`}>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
          <span className="nav-right nav-signout-desktop">
            <button type="button" className="btn btn-secondary btn-small" onClick={onLogout}>
              Sign out
            </button>
          </span>
        </nav>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
