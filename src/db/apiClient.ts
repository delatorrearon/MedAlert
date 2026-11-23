import { clientEnv } from '../config/env';
import { User, UserProfile, DailyLog, MLSnapshot, TipReview, TipRecInput, UserRole } from './database';

const BASE_URL = clientEnv.apiBaseUrl;
const TOKEN_KEY = 'med_auth_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage issues in restricted environments
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options?.headers as Record<string, string>) || {}),
    };

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }
    return await res.json();
  } catch (_err) {
    // Return null or rethrow based on context; allows callers to fall back to local storage
    return null;
  }
}

export const api = {
  async checkHealth(): Promise<{ status: string; mysqlConnected: boolean } | null> {
    // If running in production (e.g. *.vercel.app), do not attempt loopback requests to localhost
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return null;
    }
    return request<{ status: string; mysqlConnected: boolean }>('/health');
  },

  // Auth
  async register(name: string, email: string, password: string, role: UserRole = 'patient') {
    const res = await request<{ success: boolean; error?: string; user?: User; token?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    });
    if (res?.success && res.token) {
      setAuthToken(res.token);
    }
    return res;
  },

  async login(email: string, password: string) {
    const res = await request<{ success: boolean; error?: string; user?: User; token?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res?.success && res.token) {
      setAuthToken(res.token);
    }
    return res;
  },

  logout(): void {
    setAuthToken(null);
  },

  async getAllUsers(): Promise<User[] | null> {
    return request<User[]>('/auth/users');
  },

  async markProfileComplete(userId: string): Promise<boolean> {
    const res = await request<{ success: boolean }>('/auth/profile-complete', {
      method: 'PUT',
      body: JSON.stringify({ userId }),
    });
    return !!res?.success;
  },

  async updateUser(id: string, name: string): Promise<boolean> {
    const res = await request<{ success: boolean }>(`/auth/user/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
    return !!res?.success;
  },

  // Profiles
  async getProfile(userId: string): Promise<UserProfile | null> {
    return request<UserProfile>(`/profiles/${userId}`);
  },

  async saveProfile(profile: UserProfile): Promise<UserProfile | null> {
    return request<UserProfile>('/profiles', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
  },

  // Daily Logs
  async getDailyLogs(userId: string): Promise<DailyLog[] | null> {
    return request<DailyLog[]>(`/daily-logs/${userId}`);
  },

  async saveDailyLog(log: DailyLog): Promise<DailyLog | null> {
    return request<DailyLog>('/daily-logs', {
      method: 'POST',
      body: JSON.stringify(log),
    });
  },

  async deleteDailyLog(userId: string, logId: string): Promise<boolean> {
    const res = await request<{ success: boolean }>(`/daily-logs/${userId}/${logId}`, {
      method: 'DELETE',
    });
    return !!res?.success;
  },

  // ML Snapshots
  async getSnapshots(userId: string): Promise<MLSnapshot[] | null> {
    return request<MLSnapshot[]>(`/ml-snapshots/${userId}`);
  },

  async saveSnapshot(snapshot: MLSnapshot): Promise<MLSnapshot | null> {
    return request<MLSnapshot>('/ml-snapshots', {
      method: 'POST',
      body: JSON.stringify(snapshot),
    });
  },

  // Tip Reviews
  async getTipReviews(): Promise<TipReview[] | null> {
    return request<TipReview[]>('/tip-reviews');
  },

  async syncTipReviews(
    patient: Pick<User, 'id' | 'name' | 'email'>,
    date: string,
    recs: TipRecInput[]
  ): Promise<TipReview[] | null> {
    return request<TipReview[]>('/tip-reviews/sync', {
      method: 'POST',
      body: JSON.stringify({ patient, date, recs }),
    });
  },

  async setTipStatus(
    id: string,
    status: 'approved' | 'rejected',
    approvedText: string,
    reviewedBy: string
  ): Promise<boolean> {
    const res = await request<{ success: boolean }>(`/tip-reviews/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, approvedText, reviewedBy }),
    });
    return !!res?.success;
  },

  async setTipGroup(
    key: string,
    status: 'approved' | 'rejected',
    block: string,
    reviewedBy: string
  ): Promise<boolean> {
    const res = await request<{ success: boolean }>('/tip-reviews/group', {
      method: 'PUT',
      body: JSON.stringify({ key, status, block, reviewedBy }),
    });
    return !!res?.success;
  },
};
