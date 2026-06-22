import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import EnrollmentsPage from "./pages/EnrollmentsPage";
import OverviewPage from "./pages/OverviewPage";
import SchedulePage from "./pages/SchedulePage";
import SendNowPage from "./pages/SendNowPage";
import SmsLogPage from "./pages/SmsLogPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="enrollments" element={<EnrollmentsPage />} />
        <Route path="send" element={<SendNowPage />} />
        <Route path="sms-log" element={<SmsLogPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
