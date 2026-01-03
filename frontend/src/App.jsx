// frontend/src/App.jsx
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { PaymentProvider } from './context/PaymentContext';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Layout Components
import MainLayout from './layouts/MainLayout';
import DashboardLayout from './layouts/DashboardLayout';

// Pages
import LandingPage from './pages/LandingPage';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import VerifyEmail from './pages/auth/VerifyEmail';
import Dashboard from './pages/dashboard/Dashboard';
import ChatInterface from './pages/chat/ChatInterface';
import FindEarners from './pages/discover/FindEarners';
import EarnerProfile from './pages/profile/EarnerProfile';
import UserProfile from './pages/profile/UserProfile';
import Wallet from './pages/wallet/Wallet';
import Settings from './pages/settings/Settings';
import AdminDashboard from './pages/admin/AdminDashboard';
import PrivacyPolicy from './pages/legal/PrivacyPolicy';
import TermsOfService from './pages/legal/TermsOfService';
import EarningsDashboard from './pages/earner/EarningsDashboard';
import CallScreen from './pages/call/CallScreen';

// Styles
import './styles/global.css';
import './styles/animations.css';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <PaymentProvider>
            <Router>
              <div className="App">
                <Toaster 
                  position="top-right"
                  toastOptions={{
                    duration: 4000,
                    style: {
                      background: '#363636',
                      color: '#fff',
                    },
                    success: {
                      duration: 3000,
                      iconTheme: {
                        primary: '#10B981',
                        secondary: '#fff',
                      },
                    },
                    error: {
                      duration: 4000,
                      iconTheme: {
                        primary: '#EF4444',
                        secondary: '#fff',
                      },
                    },
                  }}
                />
                <Routes>
                  {/* Public Routes */}
                  <Route path="/" element={<MainLayout />}>
                    <Route index element={<LandingPage />} />
                    <Route path="login" element={<Login />} />
                    <Route path="register" element={<Register />} />
                    <Route path="forgot-password" element={<ForgotPassword />} />
                    <Route path="verify-email" element={<VerifyEmail />} />
                    <Route path="privacy-policy" element={<PrivacyPolicy />} />
                    <Route path="terms-of-service" element={<TermsOfService />} />
                  </Route>
                  
                  {/* Protected User Routes */}
                  <Route path="/app" element={
                    <ProtectedRoute>
                      <DashboardLayout />
                    </ProtectedRoute>
                  }>
                    <Route index element={<Navigate to="dashboard" />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="chat/:chatId?" element={<ChatInterface />} />
                    <Route path="discover" element={<FindEarners />} />
                    <Route path="profile/:userId" element={<UserProfile />} />
                    <Route path="earner/:earnerId" element={<EarnerProfile />} />
                    <Route path="wallet" element={<Wallet />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="call/:callId" element={<CallScreen />} />
                  </Route>
                  
                  {/* Earner Routes */}
                  <Route path="/earner" element={
                    <ProtectedRoute allowedRoles={['female_earner']}>
                      <DashboardLayout />
                    </ProtectedRoute>
                  }>
                    <Route path="dashboard" element={<EarningsDashboard />} />
                    <Route path="schedule" element={<div>Schedule</div>} />
                    <Route path="analytics" element={<div>Analytics</div>} />
                  </Route>
                  
                  {/* Admin Routes */}
                  <Route path="/admin" element={
                    <ProtectedRoute allowedRoles={['admin', 'moderator']}>
                      <DashboardLayout />
                    </ProtectedRoute>
                  }>
                    <Route index element={<AdminDashboard />} />
                  </Route>
                  
                  {/* 404 */}
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </div>
            </Router>
          </PaymentProvider>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
