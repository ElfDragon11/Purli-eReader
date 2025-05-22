import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    // Check if user is authenticated (e.g., stored session token)
    const token = localStorage.getItem("adminAuthToken"); // Using a specific token name
    setIsAuthenticated(!!token);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const response = await fetch("/server/login.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const text = await response.text();
      try {
        const result = JSON.parse(text);
        if (result.success && result.token) { // Ensure token is part of successful response
          localStorage.setItem("adminAuthToken", result.token); // Store auth token
          setIsAuthenticated(true);
          return true;
        }
        // If login is not successful or token is missing, ensure state is false
        localStorage.removeItem("adminAuthToken"); // Clear any stale token
        setIsAuthenticated(false);
        return false; // Return false if result.success is not true or no token
      } catch (jsonError) {
        console.error("Invalid JSON received from server during login:", text);
        localStorage.removeItem("adminAuthToken");
        setIsAuthenticated(false);
        return false;
      }
    } catch (error) {
      console.error("Login error:", error);
      localStorage.removeItem("adminAuthToken");
      setIsAuthenticated(false);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem("adminAuthToken"); // Clear stored auth
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
