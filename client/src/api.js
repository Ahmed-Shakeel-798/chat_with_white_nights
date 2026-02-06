import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

console.log('[API] Base URL:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[API] Error:', error.response?.data || error.message);
    throw error;
  }
);

export const signup = (username, password) => {
  return api.post('/signup', { username, password });
};

export const login = (username, password) => {
  return api.post('/login', { username, password });
};

export const createConversation = (userId, title) => {
  return api.post('/conversations', { userId, title });
};

export const initConversation = (conversationId) => {
  return api.post('/conversations/init', { conversationId });
};

export const getConversationMessages = (conversationId, start, end) => {
  let url = `/conversations/${conversationId}/messages`;

  if (start !== undefined && end !== undefined) {
    url += `?start=${start}&end=${end}`;
  }

  return api.get(url);
};

export default api;
