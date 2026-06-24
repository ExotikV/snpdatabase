import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import BulkSmsPage from "./pages/BulkSmsPage";
import EnrollmentsPage from "./pages/EnrollmentsPage";
import LoginPage from "./pages/LoginPage";
import OverviewPage from "./pages/OverviewPage";
import SchedulePage from "./pages/SchedulePage";
import SmsQueuePage from "./pages/SmsQueuePage";
import RevenuePage from "./pages/RevenuePage";
import ExpensesPage from "./pages/ExpensesPage";
import TipsPage from "./pages/TipsPage";
import UpcomingAppointmentsPage from "./pages/UpcomingAppointmentsPage";
import SmsLogPage from "./pages/SmsLogPage";
import SmsSubscribersPage from "./pages/SmsSubscribersPage";
import { clearToken, getToken } from "./lib/api";

export default function App() {
  const [authed, setAuthed] = useState(() => Boolean(getToken()));

  function handleLogout() {
    clearToken();
    setAuthed(false);
  }

  if (!authed) {
    return <LoginPage onSuccess={() => setAuthed(true)} />;
  }

  return (
    <Routes>
      <Route element={<Layout onLogout={handleLogout} />}>
        <Route index element={<OverviewPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="appointments" element={<UpcomingAppointmentsPage />} />
        <Route path="tips" element={<TipsPage />} />
        <Route path="revenue" element={<RevenuePage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="sms-queue" element={<SmsQueuePage />} />
        <Route path="enrollments" element={<EnrollmentsPage />} />
        <Route path="sms-subscribers" element={<SmsSubscribersPage />} />
        <Route path="bulk-sms" element={<BulkSmsPage />} />
        <Route path="sms-log" element={<SmsLogPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
