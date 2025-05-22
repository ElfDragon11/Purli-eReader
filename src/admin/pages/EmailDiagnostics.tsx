import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiUrl } from '../lib/apiService';

interface DiagnosticResult {
  success: boolean;
  timestamp?: number;
  date_time?: string;
  message?: string;
  system_info?: any;
  php_extensions?: any;
  phpmailer?: any;
  folder_permissions?: any;
  network_tests?: any[];
  debug_output?: any[];
  settings?: any;
  server_info?: any;
  connection_time_ms?: number;
  raw?: string;
  error?: any;
  test_email?: {
    message?: string;
    recipient?: string;
    time_ms?: number;
    mailer_error?: string;
  };
}

const EmailDiagnostics: React.FC = () => {
  const navigate = useNavigate();
  const [systemResult, setSystemResult] = useState<DiagnosticResult | null>(null);
  const [smtpResult, setSmtpResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [smtpSettings, setSmtpSettings] = useState({
    host: 'mail.purlibooks.com',
    port: 465,
    username: 'contact@purlibooks.com',
    password: 'Makingcleanbooks',
    secure: 'ssl',
    debug: 2
  });
  const [testEmail, setTestEmail] = useState<string>('');  // Run system diagnostics
  const runSystemDiagnostics = async () => {
    setLoading(true);
    try {
      const response = await fetch(getApiUrl('email-diagnostics.php'));
      const text = await response.text();
      
      try {
        const result = JSON.parse(text);
        setSystemResult(result);
      } catch (e) {
        setSystemResult({
          success: false,
          message: 'Failed to parse JSON response',
          raw: text
        });
      }
    } catch (e) {
      setSystemResult({
        success: false,
        message: e instanceof Error ? e.message : 'Unknown error occurred'
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Run SMTP test
  const testSmtpConnection = async () => {
    setLoading(true);
    
    // Build the query string
    const params = new URLSearchParams({
      host: smtpSettings.host,
      port: smtpSettings.port.toString(),
      username: smtpSettings.username,
      password: smtpSettings.password,
      secure: smtpSettings.secure,
      debug: smtpSettings.debug.toString()
    });
    
    // Add test email if provided
    if (testEmail) {
      params.append('testEmail', testEmail);
    }    try {
      const response = await fetch(`${getApiUrl('debug-smtp.php')}?${params.toString()}`);
      const text = await response.text();
      
      try {
        const result = JSON.parse(text);
        setSmtpResult(result);
      } catch (e) {
        setSmtpResult({
          success: false,
          message: 'Failed to parse JSON response',
          raw: text
        });
      }
    } catch (e) {
      setSmtpResult({
        success: false,
        message: e instanceof Error ? e.message : 'Unknown error occurred'
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Format debug output
  const formatDebugOutput = (output: any[]) => {
    if (!output || !Array.isArray(output)) return 'No debug output';
    
    return output.map((item, index) => {
      if (typeof item === 'string') {
        return <div key={index} className="text-xs my-1">{item}</div>;
      } else if (item.level !== undefined && item.message !== undefined) {
        return (
          <div key={index} className={`text-xs my-1 ${item.level > 2 ? 'text-orange-600' : ''}`}>
            [{item.level}] {item.message}
          </div>
        );
      } else {
        return <div key={index} className="text-xs my-1">{JSON.stringify(item)}</div>;
      }
    });
  };
  
  return (
    <div className="container mx-auto px-4 py-6 bg-white shadow-md rounded-lg max-w-4xl">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h2 className="text-2xl font-semibold text-gray-800">Email System Diagnostics</h2>
        <button 
          onClick={() => navigate('../dashboard')}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Back to Dashboard
        </button>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        {/* System Diagnostics Section */}
        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-medium text-gray-700 mb-4">System Diagnostics</h3>
          <button
            onClick={runSystemDiagnostics}
            disabled={loading}
            className={`mb-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Running...' : 'Run System Diagnostics'}
          </button>
          
          {systemResult && (
            <div className="mt-4">
              <div className={`p-3 rounded-lg mb-3 ${systemResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {systemResult.success ? 'System check passed' : 'System check failed'} 
                {systemResult.message && `: ${systemResult.message}`}
              </div>
              
              {systemResult.system_info && (
                <div className="mb-4">
                  <h4 className="font-medium text-sm mb-2">System Information</h4>
                  <div className="bg-gray-50 p-3 rounded text-xs">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(systemResult.system_info, null, 2)}</pre>
                  </div>
                </div>
              )}
              
              {systemResult.php_extensions && (
                <div className="mb-4">
                  <h4 className="font-medium text-sm mb-2">PHP Extensions</h4>
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-2 py-1 text-left">Extension</th>
                        <th className="px-2 py-1 text-left">Status</th>
                        <th className="px-2 py-1 text-left">Purpose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(systemResult.php_extensions).map(([ext, info]: [string, any]) => (
                        <tr key={ext} className={info.loaded ? 'bg-green-50' : 'bg-red-50'}>
                          <td className="px-2 py-1">{ext}</td>
                          <td className="px-2 py-1">
                            {info.loaded ? (
                              <span className="text-green-600">✓ Loaded</span>
                            ) : (
                              <span className="text-red-600">✗ Not loaded</span>
                            )}
                          </td>
                          <td className="px-2 py-1">{info.purpose}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {systemResult.raw && (
                <div className="mb-4">
                  <h4 className="font-medium text-sm mb-2">Raw Response</h4>
                  <div className="bg-gray-800 text-white p-3 rounded text-xs max-h-60 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">{systemResult.raw}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* SMTP Test Section */}
        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-medium text-gray-700 mb-3">SMTP Connection Test</h3>
          
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-gray-700 text-xs font-bold mb-1">Host:</label>
              <input
                type="text"
                value={smtpSettings.host}
                onChange={(e) => setSmtpSettings({...smtpSettings, host: e.target.value})}
                className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-xs leading-tight focus:outline-none focus:shadow-outline"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-xs font-bold mb-1">Port:</label>
              <input
                type="number"
                value={smtpSettings.port}
                onChange={(e) => setSmtpSettings({...smtpSettings, port: parseInt(e.target.value) || 0})}
                className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-xs leading-tight focus:outline-none focus:shadow-outline"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-xs font-bold mb-1">Username:</label>
              <input
                type="text"
                value={smtpSettings.username}
                onChange={(e) => setSmtpSettings({...smtpSettings, username: e.target.value})}
                className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-xs leading-tight focus:outline-none focus:shadow-outline"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-xs font-bold mb-1">Password:</label>
              <input
                type="password"
                value={smtpSettings.password}
                onChange={(e) => setSmtpSettings({...smtpSettings, password: e.target.value})}
                className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-xs leading-tight focus:outline-none focus:shadow-outline"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-xs font-bold mb-1">Security:</label>
              <select
                value={smtpSettings.secure}
                onChange={(e) => setSmtpSettings({...smtpSettings, secure: e.target.value})}
                className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-xs leading-tight focus:outline-none focus:shadow-outline"
              >
                <option value="ssl">SSL</option>
                <option value="tls">TLS</option>
                <option value="">None</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-700 text-xs font-bold mb-1">Debug Level:</label>
              <select
                value={smtpSettings.debug}
                onChange={(e) => setSmtpSettings({...smtpSettings, debug: parseInt(e.target.value)})}
                className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-xs leading-tight focus:outline-none focus:shadow-outline"
              >
                <option value="0">0 - No output</option>
                <option value="1">1 - Basic</option>
                <option value="2">2 - Standard</option>
                <option value="3">3 - Verbose</option>
                <option value="4">4 - Debug</option>
              </select>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-xs font-bold mb-1">Test Email (Optional):</label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Enter email to send a test message"
              className="shadow appearance-none border rounded w-full py-1 px-2 text-gray-700 text-xs leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          
          <button
            onClick={testSmtpConnection}
            disabled={loading}
            className={`mb-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Testing...' : 'Test SMTP Connection'}
          </button>
          
          {smtpResult && (
            <div className="mt-4">
              <div className={`p-3 rounded-lg mb-3 ${smtpResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {smtpResult.message}
                {smtpResult.connection_time_ms && (
                  <div className="text-xs mt-1">
                    Connection time: {smtpResult.connection_time_ms}ms
                  </div>
                )}
              </div>
              
              {smtpResult.test_email && (
                <div className={`p-3 rounded-lg mb-3 ${smtpResult.test_email.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  <div className="font-medium mb-1">Test Email:</div>
                  <div>{smtpResult.test_email.message}</div>
                  {smtpResult.test_email.recipient && (
                    <div className="text-xs mt-1">Sent to: {smtpResult.test_email.recipient}</div>
                  )}
                  {smtpResult.test_email.time_ms && (
                    <div className="text-xs">Send time: {smtpResult.test_email.time_ms}ms</div>
                  )}
                  {smtpResult.test_email.mailer_error && (
                    <div className="text-red-600 text-xs mt-1">{smtpResult.test_email.mailer_error}</div>
                  )}
                </div>
              )}
              
              {smtpResult.debug_output && (
                <div className="mb-4">
                  <h4 className="font-medium text-sm mb-2">SMTP Debug Output</h4>
                  <div className="bg-gray-800 text-white p-3 rounded text-xs max-h-60 overflow-y-auto">
                    {formatDebugOutput(smtpResult.debug_output)}
                  </div>
                </div>
              )}
              
              {smtpResult.raw && (
                <div className="mb-4">
                  <h4 className="font-medium text-sm mb-2">Raw Response</h4>
                  <div className="bg-gray-800 text-white p-3 rounded text-xs max-h-60 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">{smtpResult.raw}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Response Debugging Section */}
      <div className="mt-6 border rounded-lg p-4">
        <h3 className="text-lg font-medium text-gray-700 mb-3">Response Parsing Tests</h3>
        <p className="text-sm text-gray-600 mb-4">
          These tools help diagnose issues with server response handling in the frontend.
        </p>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">          <button
            onClick={() => window.open('/server/debug-response.php?responseType=valid-json', '_blank')}
            className="text-xs bg-blue-500 hover:bg-blue-700 text-white py-2 px-3 rounded"
          >
            Valid JSON
          </button>          <button
            onClick={() => window.open('/server/debug-response.php?responseType=error-json', '_blank')}
            className="text-xs bg-blue-500 hover:bg-blue-700 text-white py-2 px-3 rounded"
          >
            Error JSON
          </button>          <button
            onClick={() => window.open('/server/debug-response.php?responseType=invalid-json', '_blank')}
            className="text-xs bg-blue-500 hover:bg-blue-700 text-white py-2 px-3 rounded"
          >
            Invalid JSON
          </button>          <button
            onClick={() => window.open('/server/debug-response.php?responseType=html-error', '_blank')}
            className="text-xs bg-blue-500 hover:bg-blue-700 text-white py-2 px-3 rounded"
          >
            HTML Error
          </button>          <button
            onClick={() => window.open('/server/debug-response.php?responseType=php-error', '_blank')}
            className="text-xs bg-blue-500 hover:bg-blue-700 text-white py-2 px-3 rounded"
          >
            PHP Error
          </button>          <button
            onClick={() => window.open('/server/debug-response.php?responseType=empty', '_blank')}
            className="text-xs bg-blue-500 hover:bg-blue-700 text-white py-2 px-3 rounded"
          >
            Empty Response
          </button>          <button
            onClick={() => window.open('/server/debug-response.php?responseType=large-json', '_blank')}
            className="text-xs bg-blue-500 hover:bg-blue-700 text-white py-2 px-3 rounded"
          >
            Large JSON
          </button>          <button
            onClick={() => window.open('/server/debug-response.php?responseType=mixed-content', '_blank')}
            className="text-xs bg-blue-500 hover:bg-blue-700 text-white py-2 px-3 rounded"
          >
            Mixed Content
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailDiagnostics;
