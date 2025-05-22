// apiService.ts - Central service for making API requests to PHP backend

// Function to determine the correct base URL for API requests
const getBaseApiUrl = (): string => {
  // Check if we're in production (at purlibooks.com domain)
  const isPurliProduction = window.location.hostname === 'purlibooks.com';
  
  // If we're in production, use the full domain URL
  if (isPurliProduction) {
    return 'https://purlibooks.com/server/';
  }
  
  // Check if we have a cached working URL from a previous test
  const cachedUrl = localStorage.getItem('apiBaseUrl');
  if (cachedUrl) {
    return cachedUrl;
  }
  
  // Default fallback path for development
  return '/server/';
};

// Save a working API URL for future use
export const setWorkingApiUrl = (url: string): void => {
  if (!url.endsWith('/')) {
    url = url + '/';
  }
  localStorage.setItem('apiBaseUrl', url);
};

// Create the full API URL for a specific endpoint
export const getApiUrl = (endpoint: string): string => {
  const baseUrl = getBaseApiUrl();
  // Remove any leading slash from the endpoint
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  return `${baseUrl}${cleanEndpoint}`;
};

// Generic API request function with proper error handling
export const apiRequest = async <T>(
  endpoint: string, 
  options: RequestInit = {}
): Promise<{ data?: T; error?: string; rawResponse?: string }> => {
  try {
    const url = getApiUrl(endpoint);
    
    // Set default headers if not provided
    if (!options.headers) {
      options.headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
    }
    
    // Add authentication token if available
    const token = localStorage.getItem('adminAuthToken');
    if (token && options.headers instanceof Headers) {
      options.headers.append('Authorization', `Bearer ${token}`);
    } else if (token && typeof options.headers === 'object') {
      (options.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
    
    // Make the request
    const response = await fetch(url, options);
    
    // Get raw response text first
    const rawText = await response.text();
    
    // Try to parse as JSON
    try {
      const jsonData = JSON.parse(rawText);
      
      // Handle successful response
      if (response.ok) {
        return { data: jsonData as T };
      }
      
      // Handle API error with JSON response
      return { 
        error: jsonData.message || `API error (${response.status})`,
        data: jsonData,
        rawResponse: rawText
      };
    } catch (parseError) {
      // Could not parse as JSON
      return {
        error: `Failed to parse response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        rawResponse: rawText
      };
    }
  } catch (fetchError) {
    // Network error or other fetch failure
    return { 
      error: `Network error: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`
    };
  }
};

export default {
  getApiUrl,
  apiRequest,
  setWorkingApiUrl
};
