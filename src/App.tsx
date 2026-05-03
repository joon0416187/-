/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CoachingProvider } from './contexts/CoachingContext';
import { TimerProvider } from './contexts/TimerContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import Coaching from './pages/Coaching';
import MyPage from './pages/MyPage';
import Layout from './components/Layout';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <>{children}</> : <Navigate to="/login" />;
};

export default function App() {
  return (
    <AuthProvider>
      <CoachingProvider>
        <TimerProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/coaching" element={<PrivateRoute><Layout><Coaching /></Layout></PrivateRoute>} />
              <Route path="/mypage" element={<PrivateRoute><Layout><MyPage /></Layout></PrivateRoute>} />
              <Route path="/" element={<PrivateRoute><Layout><Home /></Layout></PrivateRoute>} />
            </Routes>
          </Router>
        </TimerProvider>
      </CoachingProvider>
    </AuthProvider>
  );
}
