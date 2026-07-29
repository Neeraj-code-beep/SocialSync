import axios from 'axios';

// Get base URL from environment variables or fall back to default localhost port 4000
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Send cookies automatically
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to automatically attach authorization header if token exists
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('captionai_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for automatic 401 handling (logout & redirect)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('captionai_token');
      localStorage.removeItem('captionai_user');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/signup' && window.location.pathname !== '/') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authService = {
  register: async (userData) => {
    // Supports object { username, email, password } or positional arguments
    const payload = typeof userData === 'object' && userData !== null
      ? userData
      : { username: arguments[0], email: arguments[1], password: arguments[2] };
    const response = await api.post('/auth/register', payload);
    return response.data;
  },
  login: async (credentials, passwordArg) => {
    const payload = typeof credentials === 'object' && credentials !== null
      ? { identifier: credentials.identifier || credentials.username, username: credentials.username || credentials.identifier, password: credentials.password }
      : { identifier: credentials, username: credentials, password: passwordArg };
    const response = await api.post('/auth/login', payload);
    return response.data;
  },
  getMe: async () => {
    try {
      const response = await api.get('/auth/me');
      return response.data;
    } catch {
      // Fallback if backend does not explicitly expose /auth/me
      const token = localStorage.getItem('captionai_token');
      const storedUser = localStorage.getItem('captionai_user');
      if (token && storedUser) {
        return { success: true, user: JSON.parse(storedUser) };
      }
      throw new Error('Not authenticated');
    }
  },
};

export const captionService = {
  generateCaption: async (file) => {
    const formData = new FormData();
    formData.append('image', file);

    // Try posting to standard /posts/post or /caption/generate fallback
    let response;
    try {
      response = await api.post('/posts/post', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    } catch (err) {
      if (err.response?.status === 404) {
        response = await api.post('/caption/generate', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      } else {
        throw err;
      }
    }

    const data = response.data;
    // Normalize backend output standard: either data.caption or data.post.caption
    const captionText = data.caption || data.post?.caption || data.message || 'No caption generated';
    const imageUrl = data.image || data.post?.image || null;

    return {
      success: true,
      caption: captionText,
      image: imageUrl,
      raw: data,
    };
  },
};

export default api;
