import { Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import EmailSender from "./pages/EmailSender";
import EmailDiagnostics from "./pages/EmailDiagnostics";
import DirectDiagnostics from "./pages/DirectDiagnostics";
import { useAuth } from './lib/auth.tsx'; // Make sure the correct file extension is used
import './index.css'; // Import admin-specific styles

function Admin() {
  const { isAuthenticated } = useAuth(); // Get isAuthenticated state

  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route
        path="dashboard"
        element={
          isAuthenticated ? (
            <DashboardPage />
          ) : (
            <Navigate to="login" replace /> // Redirect to /admin/login
          )
        }
      />
      <Route
        path="email"
        element={
          isAuthenticated ? (
            <EmailSender />
          ) : (
            <Navigate to="login" replace /> // Redirect to /admin/login
          )
        }
      />
      <Route
        path="diagnostics"
        element={
          isAuthenticated ? (
            <EmailDiagnostics />
          ) : (
            <Navigate to="login" replace /> // Redirect to /admin/login
          )
        }
      />
      <Route
        path="direct-diagnostics"
        element={
          isAuthenticated ? (
            <DirectDiagnostics />
          ) : (
            <Navigate to="login" replace /> // Redirect to /admin/login
          )
        }
      />
      {/* Catch-all for /admin/*, if authenticated go to dashboard, else login */}
      <Route
        path="*"
        element={
          isAuthenticated ? (
            <Navigate to="dashboard" replace /> // Redirect to /admin/dashboard
          ) : (
            <Navigate to="login" replace /> // Redirect to /admin/login
          )
        }
      />
    </Routes>
  );
}

export default Admin;