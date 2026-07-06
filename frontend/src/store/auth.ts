import { create } from "zustand";
import { authApi } from "../api";

interface User {
  id: string;
  email: string;
  fullName?: string;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  signup: (email: string, password: string, fullName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set) => {
  // Check for existing token on init
  const token = localStorage.getItem("auth_token");

  return {
    user: null,
    token,
    isLoading: false,
    error: null,

    signup: async (email: string, password: string, fullName: string) => {
      set({ isLoading: true, error: null });
      try {
        const response = await authApi.signup(email, password, fullName);
        const { token, user } = response.data;
        localStorage.setItem("auth_token", token);
        set({ token, user, isLoading: false });
      } catch (error: any) {
        set({
          error: error.response?.data?.error || "Signup failed",
          isLoading: false,
        });
        throw error;
      }
    },

    login: async (email: string, password: string) => {
      set({ isLoading: true, error: null });
      try {
        const response = await authApi.login(email, password);
        const { token, user } = response.data;
        localStorage.setItem("auth_token", token);
        set({ token, user, isLoading: false });
      } catch (error: any) {
        set({
          error: error.response?.data?.error || "Login failed",
          isLoading: false,
        });
        throw error;
      }
    },

    logout: () => {
      localStorage.removeItem("auth_token");
      set({ user: null, token: null });
    },

    fetchUser: async () => {
      set({ isLoading: true });
      try {
        const response = await authApi.me();
        set({ user: response.data, isLoading: false });
      } catch {
        set({ user: null, isLoading: false });
      }
    },

    clearError: () => set({ error: null }),
  };
});
