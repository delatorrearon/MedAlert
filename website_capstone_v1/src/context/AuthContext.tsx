import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { auth, User, UserRole } from '../db/database';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login:  (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => void;
  completeProfile: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => auth.getCurrentUser());

  const login = useCallback(async (email: string, password: string) => {
    const result = await auth.loginAsync(email, password);
    if (result.success && result.user) setUser(result.user);
    return { success: result.success, error: result.error };
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, role: UserRole = 'patient') => {
    const result = await auth.registerAsync(name, email, password, role);
    if (result.success && result.user) setUser(result.user);
    return { success: result.success, error: result.error };
  }, []);

  const logout = useCallback(() => {
    auth.logout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(() => {
    setUser(auth.getCurrentUser());
  }, []);

  const completeProfile = useCallback(() => {
    if (!user) return;
    auth.markProfileComplete(user.id);
    setUser(u => u ? { ...u, profileComplete: true } : u);
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refreshUser,
      completeProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
