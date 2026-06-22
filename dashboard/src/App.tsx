import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import OverviewPage from "./pages/OverviewPage";
import SchedulePage from "./pages/SchedulePage";
import SendNowPage from "./pages/SendNowPage";
import SmsLogPage from "./pages/SmsLogPage";
import { getToken } from "./lib/api";

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={getToken() ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="send" element={<SendNowPage />} />
        <Route path="sms-log" element={<SmsLogPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
