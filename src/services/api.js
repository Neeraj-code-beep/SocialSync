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
      if (
        window.location.pathname !== '/login' &&
        window.location.pathname !== '/signup' &&
        window.location.pathname !== '/'
      ) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authService = {
  register: async (userData, emailArg, passwordArg) => {
    const payload =
      typeof userData === 'object' && userData !== null
        ? userData
        : { username: userData, email: emailArg, password: passwordArg };
    const response = await api.post('/auth/register', payload);
    return response.data;
  },
  login: async (credentials, passwordArg) => {
    const payload =
      typeof credentials === 'object' && credentials !== null
        ? {
            identifier: credentials.identifier || credentials.username,
            username: credentials.username || credentials.identifier,
            password: credentials.password,
          }
        : { identifier: credentials, username: credentials, password: passwordArg };
    const response = await api.post('/auth/login', payload);
    return response.data;
  },
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem('captionai_token');
      localStorage.removeItem('captionai_user');
    }
  },
  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

export const captionService = {
  generateCaption: async (file) => {
    const formData = new FormData();
    formData.append('image', file);

    const response = await api.post('/posts/post', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    const data = response.data;
    const captionText =
      data.caption || data.post?.caption || data.message || 'No caption generated';
    const imageUrl = data.image || data.post?.image || null;

    return {
      success: true,
      caption: captionText,
      image: imageUrl,
      post: data.post || null,
      raw: data,
    };
  },
  getPosts: async (page = 1, limit = 10) => {
    const response = await api.get('/posts', {
      params: { page, limit },
    });
    return response.data;
  },
};

export const postService = {
  getPosts: captionService.getPosts,
  createPost: captionService.generateCaption,
};

export default api;
