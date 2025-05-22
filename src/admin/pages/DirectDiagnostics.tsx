// This file serves as a diagnostic tool that can be accessed from within the React app
// It works with any server configuration because it makes AJAX requests instead of direct navigation

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setWorkingApiUrl } from '../lib/apiService';

function DiagnosticTool() {
  const navigate = useNavigate();
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTest, setActiveTest] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Function to run direct AJAX tests to PHP files
  const runTest = async (testType: string) => {
    setLoading(true);
    setActiveTest(testType);
    setError(null);
    
    try {
      let response;
      let endpoint = '';
        switch(testType) {
        case 'smtp':
          endpoint = '/server/debug-smtp.php';
          break;
        case 'system':
          endpoint = '/server/email-diagnostics.php';
          break;
        case 'valid-json':
          endpoint = '/server/debug-response.php?responseType=valid-json';
          break;
        case 'error-json':
          endpoint = '/server/debug-response.php?responseType=error-json';
          break;
        case 'invalid-json':
          endpoint = '/server/debug-response.php?responseType=invalid-json';
          break;
        case 'html-error':
          endpoint = '/server/debug-response.php?responseType=html-error';
          break;
        case 'php-error':
          endpoint = '/server/debug-response.php?responseType=php-error';
          break;
        default:
          throw new Error('Unknown test type');
      }
      
      response = await fetch(endpoint);
      
      // Get the raw text of the response
      const rawText = await response.text();
      
      // Try to parse as JSON if possible
      let parsedResult;
      try {
        parsedResult = JSON.parse(rawText);
        setResults({
          success: true,
          isParsedJson: true,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries([...response.headers.entries()]),
          data: parsedResult,
          raw: rawText
        });
      } catch (e) {
        // Not JSON, show as raw text
        setResults({
          success: response.ok,
          isParsedJson: false,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries([...response.headers.entries()]),
          raw: rawText
        });
      }
      
    } catch (err) {
      console.error('Test error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setResults({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  // Hard-coded SMTP settings for direct test
  const runSmtpTest = async () => {
    setLoading(true);
    setActiveTest('smtp-direct');
    
    try {
      // Create URLSearchParams to encode the query string
      const params = new URLSearchParams({
        host: 'mail.purlibooks.com',
        port: '465',
        username: 'contact@purlibooks.com',
        password: 'Makingcleanbooks',
        secure: 'ssl',
        debug: '2'
      });
        const response = await fetch(`/server/debug-smtp.php?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      const rawText = await response.text();
      
      try {
        const jsonResult = JSON.parse(rawText);
        setResults({
          success: jsonResult.success,
          isParsedJson: true,
          status: response.status,
          statusText: response.statusText,
          data: jsonResult,
          raw: rawText
        });
      } catch (e) {
        setResults({
          success: false,
          isParsedJson: false,
          status: response.status,
          statusText: response.statusText,
          error: 'Failed to parse response as JSON',
          raw: rawText
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setResults({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  // Test sending a sample email directly
  const runEmailTest = async () => {
    setLoading(true);
    setActiveTest('email-test');
    
    try {
      const testData = {
        recipients: [{ name: 'Test User', email: 'admin@purlibooks.com' }],
        subjectTemplate: 'Test Email from Diagnostic Tool',
        htmlBodyTemplate: '<html><body><p>This is a test email from the diagnostics tool.</p><p>Hello {{name}},</p><p>If you receive this email, SMTP is working correctly.</p></body></html>',
        emailSettings: {
          host: 'mail.purlibooks.com',
          username: 'contact@purlibooks.com',
          password: 'Makingcleanbooks',
          port: 465,
          secure: true,
          senderName: 'Purli Diagnostics'
        }
      };
        const response = await fetch('/server/sendBulkEmails.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminAuthToken')}`
        },
        body: JSON.stringify(testData)
      });
      
      const rawText = await response.text();
      
      try {
        const jsonResult = JSON.parse(rawText);
        setResults({
          success: jsonResult.success !== false,
          isParsedJson: true,
          status: response.status,
          statusText: response.statusText,
          data: jsonResult,
          raw: rawText
        });
      } catch (e) {
        setResults({
          success: false,
          isParsedJson: false,
          status: response.status,
          statusText: response.statusText,
          error: 'Failed to parse response as JSON',
          raw: rawText
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setResults({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  // Try a direct fetch to the PHP file to see what's returned
  const checkPhpAccess = async () => {
    setLoading(true);
    setActiveTest('php-access');
    
    try {      const response = await fetch('/server/index.php', {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/json',
        }
      });
      
      const text = await response.text();
      
      setResults({
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        raw: text.length > 500 ? text.substring(0, 500) + '...' : text
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };
  // Try with different URL patterns to identify which works
  const testUrlPatterns = async () => {
    setLoading(true);
    setActiveTest('url-patterns');
    
    // Define TypeScript type for test results
    type UrlTestResult = {
      pattern: string;
      status?: number;
      contentType?: string | null;
      success: boolean;
      isParsedJson?: boolean;
      data?: any;
      rawText?: string;
      error?: string;
    };
      // URL patterns to test
    const patterns = [
      '/server/api-test.php',
      './server/api-test.php',
      'server/api-test.php',
      window.location.origin + '/server/api-test.php',
      window.location.pathname.split('/').slice(0, -2).join('/') + '/server/api-test.php'
    ];
    
    const results: UrlTestResult[] = [];
    
    for (const pattern of patterns) {
      try {
        const response = await fetch(pattern, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        
        const rawText = await response.text();
        let jsonData = null;
        let isParsedJson = false;
        
        try {
          jsonData = JSON.parse(rawText);
          isParsedJson = true;
        } catch (e) {
          // Not JSON
        }
        
        results.push({
          pattern,
          status: response.status,
          contentType: response.headers.get('content-type'),
          success: response.ok,
          isParsedJson,
          data: jsonData,
          rawText: rawText.length > 100 ? rawText.substring(0, 100) + '...' : rawText
        });
      } catch (err) {
        results.push({
          pattern,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }
    
    setResults({
      success: results.some(r => r.success && r.isParsedJson),
      urlTests: results
    });
    
    setLoading(false);
  };

  return (
    <div className="container mx-auto px-4 py-6 bg-white shadow-md rounded-lg max-w-4xl">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h2 className="text-2xl font-semibold text-gray-800">PHP Direct Access Diagnostics</h2>
        <button 
          onClick={() => navigate('../dashboard')}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Back to Dashboard
        </button>
      </div>
      
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
        <p className="text-sm text-blue-700">
          This tool tests direct access to PHP files using AJAX requests. Use this to diagnose issues with your web server configuration.
        </p>
      </div>
        <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-700 mb-3">Server Access Tests</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
          <button
            onClick={() => checkPhpAccess()}
            className="text-xs bg-blue-500 hover:bg-blue-700 text-white py-2 px-3 rounded"
            disabled={loading}
          >
            Check PHP Access
          </button>
          <button
            onClick={() => testUrlPatterns()}
            className="text-xs bg-purple-600 hover:bg-purple-800 text-white py-2 px-3 rounded"
            disabled={loading}
          >
            Test URL Patterns
          </button>
          <button
            onClick={() => runTest('system')}
            className="text-xs bg-blue-500 hover:bg-blue-700 text-white py-2 px-3 rounded"
            disabled={loading}
          >
            System Diagnostics
          </button>
          <button
            onClick={() => runSmtpTest()}
            className="text-xs bg-blue-500 hover:bg-blue-700 text-white py-2 px-3 rounded"
            disabled={loading}
          >
            SMTP Test
          </button>
          <button
            onClick={() => runEmailTest()}
            className="text-xs bg-indigo-600 hover:bg-indigo-800 text-white py-2 px-3 rounded"
            disabled={loading}
          >
            Send Test Email
          </button>
        </div>
        
        <h3 className="text-lg font-medium text-gray-700 mb-3">Response Tests</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <button
            onClick={() => runTest('valid-json')}
            className="text-xs bg-green-500 hover:bg-green-700 text-white py-2 px-3 rounded"
            disabled={loading}
          >
            Valid JSON
          </button>
          <button
            onClick={() => runTest('error-json')}
            className="text-xs bg-yellow-500 hover:bg-yellow-700 text-white py-2 px-3 rounded"
            disabled={loading}
          >
            Error JSON
          </button>
          <button
            onClick={() => runTest('invalid-json')}
            className="text-xs bg-red-500 hover:bg-red-700 text-white py-2 px-3 rounded"
            disabled={loading}
          >
            Invalid JSON
          </button>
          <button
            onClick={() => runTest('html-error')}
            className="text-xs bg-purple-500 hover:bg-purple-700 text-white py-2 px-3 rounded"
            disabled={loading}
          >
            HTML Error
          </button>
          <button
            onClick={() => runTest('php-error')}
            className="text-xs bg-orange-500 hover:bg-orange-700 text-white py-2 px-3 rounded"
            disabled={loading}
          >
            PHP Error
          </button>
        </div>
      </div>
      
      {loading && (
        <div className="text-center py-10">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <p className="mt-2 text-gray-600">Running {activeTest} test...</p>
        </div>
      )}
      
      {error && !loading && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
          <p className="text-sm text-red-700">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}
        {results && !loading && (
        <div className="mt-6 border rounded-lg overflow-hidden">
          <div className={`p-4 ${results.success ? 'bg-green-100' : 'bg-red-100'}`}>
            <h3 className="font-bold">
              {results.success ? 'Test Passed ✅' : 'Test Failed ❌'}
            </h3>
            <div className="text-sm">
              <p><strong>Status:</strong> {results.status} {results.statusText}</p>
              {results.contentType && (
                <p><strong>Content Type:</strong> {results.contentType}</p>
              )}
              {results.isParsedJson !== undefined && (
                <p><strong>Valid JSON:</strong> {results.isParsedJson ? 'Yes' : 'No'}</p>
              )}
            </div>
          </div>
          
          {results.urlTests && (
            <div className="p-4 border-t border-gray-200">
              <h4 className="font-medium text-sm mb-2">URL Pattern Tests</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-2 py-1 border">URL Pattern</th>
                      <th className="px-2 py-1 border">Status</th>
                      <th className="px-2 py-1 border">Content Type</th>
                      <th className="px-2 py-1 border">JSON</th>
                      <th className="px-2 py-1 border">Result</th>
                    </tr>
                  </thead>
                  <tbody>                    {results.urlTests.map((test: any, index: number) => (
                      <tr key={index} className={test.success ? 'bg-green-50' : 'bg-red-50'}>
                        <td className="px-2 py-1 border font-mono">{test.pattern}</td>
                        <td className="px-2 py-1 border">{test.status || 'Error'}</td>
                        <td className="px-2 py-1 border">{test.contentType || '-'}</td>
                        <td className="px-2 py-1 border">{test.isParsedJson ? 'Yes' : 'No'}</td>
                        <td className="px-2 py-1 border">
                          {test.success ? '✅' : '❌'} 
                          {test.error && <span className="text-red-600"> {test.error}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-2 bg-blue-50 text-xs text-blue-800 rounded">
                <p><strong>Tip:</strong> Use the working URL pattern for all your API requests</p>
                {results.urlTests.filter((t: any) => t.success && t.isParsedJson).length > 0 && (
                  <div className="mt-2">
                    <p>Working URL patterns found! Click to set as default:</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {results.urlTests
                        .filter((t: any) => t.success && t.isParsedJson)
                        .map((t: any, i: number) => (
                          <button
                            key={i}
                            className="bg-green-500 hover:bg-green-700 text-white text-xs py-1 px-2 rounded"
                            onClick={() => {
                              // Extract base URL from the pattern by removing the endpoint
                              const baseUrl = t.pattern.replace('api-test.php', '');
                              setWorkingApiUrl(baseUrl);
                              alert(`API URL set to: ${baseUrl}`);
                            }}
                          >
                            Use {t.pattern.replace('api-test.php', '')}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {results.headers && (
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <h4 className="font-medium text-sm mb-2">Response Headers</h4>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                {JSON.stringify(results.headers, null, 2)}
              </pre>
            </div>
          )}
          
          {results.data && (
            <div className="p-4 border-t border-gray-200">
              <h4 className="font-medium text-sm mb-2">Parsed Response</h4>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto max-h-60 overflow-y-auto">
                {JSON.stringify(results.data, null, 2)}
              </pre>
            </div>
          )}
          
          {results.raw && (
            <div className="p-4 border-t border-gray-200">
              <h4 className="font-medium text-sm mb-2">Raw Response</h4>
              <div className="bg-gray-800 text-white p-2 rounded overflow-x-auto max-h-60 overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap">{results.raw}</pre>
              </div>
            </div>
          )}
        </div>
      )}
      
      <div className="mt-8 bg-yellow-50 border-l-4 border-yellow-500 p-4">
        <h3 className="font-medium text-yellow-800 mb-2">Troubleshooting Web Server Configuration</h3>
        <ul className="list-disc ml-5 text-sm text-yellow-700">
          <li className="mb-1">If you're seeing HTML instead of PHP output, your web server may be redirecting all requests to index.html</li>
          <li className="mb-1">Check your .htaccess file or server configuration to ensure PHP files are being processed correctly</li>
          <li className="mb-1">For Apache, make sure mod_php is enabled and .htaccess is allowing direct access to .php files</li>
          <li className="mb-1">For Nginx, ensure your location blocks are configured to process PHP files with php-fpm</li>
          <li className="mb-1">For a quick fix, try renaming your PHP files to have a unique extension like .php-api.php</li>
        </ul>
      </div>
    </div>
  );
}

export default DiagnosticTool;
