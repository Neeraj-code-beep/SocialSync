import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/api';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('captionai_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('captionai_token') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const res = await authService.getMe();
          if (res.user) {
            setUser(res.user);
            localStorage.setItem('captionai_user', JSON.stringify(res.user));
          }
        } catch (err) {
          console.error('Session restore failed:', err);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const login = async (identifier, password) => {
    try {
      const credentials = typeof identifier === 'object' && identifier !== null
        ? identifier
        : { identifier, username: identifier, password };
      const data = await authService.login(credentials);
      const authToken = data.token;
      const userData = data.user || { username: credentials.identifier || credentials.username, id: data.id };

      setToken(authToken);
      setUser(userData);
      localStorage.setItem('captionai_token', authToken);
      localStorage.setItem('captionai_user', JSON.stringify(userData));

      toast.success(data.message || 'Logged in successfully!');
      return { success: true };
    } catch (error) {
      const msg = error.response?.data?.message || 'Login failed. Please check your credentials.';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const register = async (userData, emailArg, passwordArg) => {
    try {
      const payload = typeof userData === 'object' && userData !== null
        ? userData
        : { username: userData, email: emailArg, password: passwordArg };
      const data = await authService.register(payload);
      if (data.token) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('captionai_token', data.token);
        localStorage.setItem('captionai_user', JSON.stringify(data.user));
      }
      toast.success(data.message || 'Account registered successfully!');
      return { success: true };
    } catch (error) {
      const msg = error.response?.data?.message || 'Registration failed. Try again.';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('captionai_token');
    localStorage.removeItem('captionai_user');
    toast.success('Logged out successfully');
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user || !!token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
