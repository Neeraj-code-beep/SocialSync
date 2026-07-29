import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';
import AnimatedBackground from './components/AnimatedBackground';
import ToastProvider from './components/ToastProvider';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AnimatedBackground />
        <ToastProvider />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
