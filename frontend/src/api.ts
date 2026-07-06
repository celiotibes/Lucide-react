import axios from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle unauthorized responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("auth_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  signup: (email: string, password: string, fullName: string) =>
    api.post("/auth/signup", { email, password, fullName }),
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  me: () => api.get("/auth/me"),
};

// Properties API
export const propertiesApi = {
  list: () => api.get("/api/properties"),
  get: (id: string) => api.get(`/api/properties/${id}`),
  create: (data: any) => api.post("/api/properties", data),
  update: (id: string, data: any) => api.put(`/api/properties/${id}`, data),
};

// Bookings API
export const bookingsApi = {
  create: (propertyId: string, data: any) =>
    api.post(`/api/properties/${propertyId}/bookings`, data),
  list: (propertyId: string) =>
    api.get(`/api/properties/${propertyId}/bookings`),
};

// Calendar API
export const calendarApi = {
  getAvailability: (propertyId: string, startDate: string, endDate: string) =>
    api.get(`/api/properties/${propertyId}/calendar`, {
      params: { startDate, endDate },
    }),
};

// AI API
export const aiApi = {
  analyzeInquiry: (propertyId: string, inquiry: any) =>
    api.post("/api/ai/inquiries/analyze", { propertyId, ...inquiry }),
  getInquiry: (inquiryId: string) =>
    api.get(`/api/ai/inquiries/${inquiryId}`),
  analyzeDamage: (propertyId: string, damage: any) =>
    api.post("/api/ai/damage/analyze", { propertyId, ...damage }),
  getTask: (taskId: string) =>
    api.get(`/api/ai/tasks/${taskId}`),
};

// Stripe API
export const stripeApi = {
  createPaymentIntent: (propertyId: string, bookingData: any) =>
    api.post(`/api/payments/intent`, { propertyId, ...bookingData }),
};
