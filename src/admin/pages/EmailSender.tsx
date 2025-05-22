import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiUrl } from '../lib/apiService';
// Assume Tailwind CSS is imported globally or via a root layout/index.css

// Define TypeScript interfaces
interface Recipient {
    id?: number;
    name: string;
    email: string;
}

interface EmailSettings {
    host: string;
    username: string;
    password: string;
    port: number;
    secure: boolean;
    senderName: string;
}

function EmailSender(): JSX.Element {
    const navigate = useNavigate();
    const [recipients, setRecipients] = useState<Recipient[]>([]);
    const [subjectTemplate, setSubjectTemplate] = useState<string>('Update from Purlibooks');
    const [showEmailSettings, setShowEmailSettings] = useState<boolean>(false);
    const [emailSettings, setEmailSettings] = useState<EmailSettings>({
        host: 'mail.purlibooks.com',
        username: 'contact@purlibooks.com',
        password: 'Makingcleanbooks',
        port: 465,
        secure: true,
        senderName: 'Purlibooks Admin'
    });
    const [htmlBodyTemplate, setHtmlBodyTemplate] = useState<string>(`
<html>
<head>
    <style>
        body { font-family: sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        h1, h2 { color: #555; }
        strong { font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <p>Hi <strong>{{name}}</strong>,</p>
        <p>Hope you are having a great day!</p>
        <p>We have some exciting news from Purlibooks to share with you!</p>
        <p>This is where your main message goes. You can use <strong>HTML tags</strong> like bold, italics, <a href="#">links</a>, lists, etc.</p>
        <ul>
            <li>Item 1</li>
            <li>Item 2</li>
        </ul>
        <p>Best regards,</p>
        <p>The Purlibooks Team</p>
        <p><small style="color:#999;">This email was sent via your admin panel.</small></p>
    </div>
</body>
</html>
    `); // Default HTML structure
    const [statusMessage, setStatusMessage] = useState<string>('Ready to send emails.');
    const [isSending, setIsSending] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [sendResult, setSendResult] = useState<any>(null);

    // Load recipients from sessionStorage on component mount
    useEffect(() => {
        const recipientsData = sessionStorage.getItem('selectedEmailRecipients');
        if (recipientsData) {
            try {
                const parsedRecipients = JSON.parse(recipientsData);
                setRecipients(parsedRecipients);
                setStatusMessage(`${parsedRecipients.length} recipients loaded from dashboard selection.`);
            } catch (err) {
                setError('Error loading recipients from session storage.');
                setStatusMessage('Error loading recipients.');
                setRecipients([]);
            }
        } else {
            setStatusMessage('No recipients selected. Please go back to the dashboard and select recipients.');
            setRecipients([]);
        }
    }, []);

    // Handle email settings change
    const handleEmailSettingChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        const { name, value, type } = e.target as HTMLInputElement;
        
        // Clear any error state when user makes changes
        if (error) setError(null);
        
        setEmailSettings(prev => ({
            ...prev,
            [name]: type === 'checkbox' 
                ? (e.target as HTMLInputElement).checked 
                : (name === 'port' ? parseInt(value, 10) : value)
        }));
    };
    
    // Handle subject or body template change
    const handleTemplateChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { id, value } = e.target;
        
        // Clear any error state when user makes changes
        if (error) setError(null);
        
        if (id === "subject") {
            setSubjectTemplate(value);
        } else if (id === "htmlBody") {
            setHtmlBodyTemplate(value);
        }
    };

    // --- Sending Logic (API Call to PHP Backend) ---
    const handleSendEmails = async () => {
        if (recipients.length === 0) {
            setError('No recipients loaded.');
            return;
        }
        if (!subjectTemplate.trim() || !htmlBodyTemplate.trim()) {
            setError('Subject and Body templates cannot be empty.');
            return;
        }

        setIsSending(true);        setError(null);        setStatusMessage(`Attempting to send emails to ${recipients.length} recipients...`);

        // Use the API service to get the correct URL for the current environment
        const backendUrl = getApiUrl('sendBulkEmails.php');

        try {            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('adminAuthToken')}` // Add authentication token
                },
                body: JSON.stringify({
                    recipients: recipients,
                    subjectTemplate: subjectTemplate,
                    htmlBodyTemplate: htmlBodyTemplate,
                    emailSettings: showEmailSettings ? emailSettings : null // Only send if custom settings are enabled
                }),
            });            let result;
            let rawResponse = '';            try {
                rawResponse = await response.text();
                // Log raw response for debugging
                console.log("Raw server response:", rawResponse);
                
                // Try to parse as JSON
                try {
                    result = JSON.parse(rawResponse);
                } catch (jsonError) {
                    console.error("Failed to parse response as JSON:", rawResponse);
                    throw new Error(`Server returned invalid JSON. See console for full response.`);
                }
            } catch (parseError) {
                // Save the raw response to show it to the user
                setSendResult({
                    rawResponse,
                    parseError: parseError instanceof Error ? parseError.message : String(parseError)
                });
                throw new Error(`Failed to parse server response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            }

            if (response.ok) {
                // Handle success response from backend
                setStatusMessage(`Sending process completed. Sent: ${result.sentCount || 0}, Failed: ${result.failedCount || 0}.`);
                // Store the detailed result for display
                setSendResult(result);
                // Clear session storage to prevent accidental resending
                sessionStorage.removeItem('selectedEmailRecipients');
            } else {
                // Handle non-OK HTTP status codes from backend (4xx, 5xx)
                setError(`Backend Error (${response.status}): ${result.message || 'An error occurred on the server.'}`);
                setStatusMessage('Sending failed due to backend error.');
                setSendResult(null);
            }

        } catch (err) {
            // Handle network errors or issues parsing JSON
            console.error('Frontend error during send:', err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(`Frontend Error: Could not connect to backend or process response. ${errorMessage}`);
            setStatusMessage('Sending failed due to frontend error.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="container mx-auto px-4 py-6 bg-white shadow-md rounded-lg max-w-3xl">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h2 className="text-2xl font-semibold text-gray-800">Bulk Email Sender</h2>
                <button 
                    onClick={() => navigate('../dashboard')}
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                >
                    Back to Dashboard
                </button>
            </div>

            <div className="mb-6 pb-4 border-b border-gray-200">
                <h3 className="text-xl font-medium text-gray-700 mb-4">1. Review Recipients</h3>
                {recipients.length > 0 ? (
                    <div>
                        <p className="text-sm text-green-600 font-bold mb-2">
                            {recipients.length} recipients loaded from the dashboard.
                        </p>
                        <div className="max-h-40 overflow-y-auto border rounded p-2 mb-2">
                            <table className="min-w-full">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Name</th>
                                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Email</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recipients.map((recipient, index) => (
                                        <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="px-2 py-1 text-xs">{recipient.name}</td>
                                            <td className="px-2 py-1 text-xs">{recipient.email}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="text-red-500 text-sm mb-4">
                        No recipients selected. Please go back to the dashboard and select users to email.
                    </div>
                )}
            </div>            <div className="mb-6 pb-4 border-b border-gray-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-medium text-gray-700">2. Email Settings</h3>                    <div className="flex space-x-2">                        <button
                            onClick={() => window.open(getApiUrl('debug-smtp.php'), '_blank')}
                            className="text-xs bg-blue-500 hover:bg-blue-700 text-white py-1 px-2 rounded focus:outline-none"
                        >
                            Test SMTP Connection
                        </button>
                        <button
                            onClick={() => setShowEmailSettings(!showEmailSettings)}
                            className="text-sm text-blue-500 hover:text-blue-700"
                        >
                            {showEmailSettings ? 'Hide Custom Settings' : 'Show Custom Settings'}
                        </button>
                    </div>
                </div>

                {showEmailSettings && (
                    <div className="bg-gray-50 p-4 rounded mb-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="host" className="block text-gray-700 text-sm font-bold mb-1">SMTP Host:</label>
                                <input
                                    type="text"
                                    id="host"
                                    name="host"
                                    value={emailSettings.host}
                                    onChange={handleEmailSettingChange}
                                    placeholder="mail.example.com"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 text-sm leading-tight focus:outline-none focus:shadow-outline"
                                />
                            </div>
                            <div>
                                <label htmlFor="port" className="block text-gray-700 text-sm font-bold mb-1">SMTP Port:</label>
                                <input
                                    type="number"
                                    id="port"
                                    name="port"
                                    value={emailSettings.port}
                                    onChange={handleEmailSettingChange}
                                    placeholder="465"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 text-sm leading-tight focus:outline-none focus:shadow-outline"
                                />
                            </div>
                            <div>
                                <label htmlFor="username" className="block text-gray-700 text-sm font-bold mb-1">SMTP Username:</label>
                                <input
                                    type="text"
                                    id="username"
                                    name="username"
                                    value={emailSettings.username}
                                    onChange={handleEmailSettingChange}
                                    placeholder="user@example.com"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 text-sm leading-tight focus:outline-none focus:shadow-outline"
                                />
                            </div>
                            <div>
                                <label htmlFor="password" className="block text-gray-700 text-sm font-bold mb-1">SMTP Password:</label>
                                <input
                                    type="password"
                                    id="password"
                                    name="password"
                                    value={emailSettings.password}
                                    onChange={handleEmailSettingChange}
                                    placeholder="••••••••"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 text-sm leading-tight focus:outline-none focus:shadow-outline"
                                />
                            </div>
                            <div>
                                <label htmlFor="senderName" className="block text-gray-700 text-sm font-bold mb-1">Sender Name:</label>
                                <input
                                    type="text"
                                    id="senderName"
                                    name="senderName"
                                    value={emailSettings.senderName}
                                    onChange={handleEmailSettingChange}
                                    placeholder="Your Company"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 text-sm leading-tight focus:outline-none focus:shadow-outline"
                                />
                            </div>
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="secure"
                                    name="secure"
                                    checked={emailSettings.secure}
                                    onChange={handleEmailSettingChange}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <label htmlFor="secure" className="ml-2 block text-sm text-gray-900">
                                    Use Secure Connection (SSL/TLS)
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                <label htmlFor="subject" className="block text-gray-700 text-sm font-bold mb-2">Subject Template:</label>
                <input
                    type="text"
                    id="subject"
                    value={subjectTemplate}
                    onChange={handleTemplateChange}
                    placeholder="e.g., Your Update"
                    required
                    disabled={isSending}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-4"
                />
            </div>

            <div className="mb-6 pb-4 border-b border-gray-200">
                <h3 className="text-xl font-medium text-gray-700 mb-4">3. Compose Email Content</h3>
                <label htmlFor="htmlBody" className="block text-gray-700 text-sm font-bold mb-2">HTML Body Template (use <code className="font-mono text-blue-700">{'{{name}}'}</code>):</label>
                <textarea
                    id="htmlBody"
                    rows={15}
                    value={htmlBodyTemplate}
                    onChange={handleTemplateChange}
                    placeholder="<p>Hi {{name}},</p>..."
                    required
                    disabled={isSending}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-3 font-mono text-sm resize-y"
                ></textarea>
                <p className="text-xs text-gray-500 mt-1">Note: Use HTML tags for formatting. <code className="font-mono text-blue-700">{'{{name}}'}</code> will be replaced by the recipient's name.</p>
            </div>

            {recipients.length > 0 && (
                <div className="send-section">
                    <h3 className="text-xl font-medium text-gray-700 mb-4">4. Review and Send</h3>
                    <p className={`mb-4 ${error ? 'text-red-600' : 'text-gray-600'}`}>{statusMessage}</p>                    {error && (                <div className="mb-4 p-3 border border-red-300 bg-red-50 rounded">
                        <p className="text-sm text-red-600 font-bold">{error}</p>                        
                        <div className="flex mt-2 space-x-2">
                            <button 
                                onClick={() => navigate('../direct-diagnostics')}
                                className="text-xs bg-purple-500 hover:bg-purple-700 text-white py-1 px-2 rounded focus:outline-none focus:shadow-outline"
                            >
                                Direct API Tests
                            </button>
                        </div>
                    </div>
                )}
                    <button
                        onClick={handleSendEmails}
                        disabled={recipients.length === 0 || isSending || !subjectTemplate.trim() || !htmlBodyTemplate.trim()}
                        className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${isSending || recipients.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isSending ? 'Sending...' : 'Send Emails Now'}
                    </button>
                    
                    {/* Results Display */}
                    {sendResult && (
                        <div className="mt-6 p-4 bg-gray-50 rounded border">
                            <h4 className="font-semibold text-lg mb-2">Email Sending Results</h4>
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <div className="p-2 bg-green-100 rounded">
                                    <span className="font-medium">Sent:</span> {sendResult.sentCount || 0}
                                </div>
                                <div className="p-2 bg-red-100 rounded">
                                    <span className="font-medium">Failed:</span> {sendResult.failedCount || 0}
                                </div>
                            </div>
                            
                            {sendResult.emailConfig && (
                                <div className="mt-2">
                                    <p className="font-medium mb-1">Email Configuration Used:</p>
                                    <ul className="text-xs text-gray-600 ml-4 list-disc">
                                        <li>SMTP Server: {sendResult.emailConfig.host}</li>
                                        <li>From: {sendResult.emailConfig.username}</li>
                                        <li>Sender Name: {sendResult.emailConfig.senderName}</li>
                                        <li>Secure Connection: {sendResult.emailConfig.secure ? 'Yes' : 'No'}</li>
                                        <li>Custom Settings: {sendResult.emailConfig.usingCustomConfig ? 'Yes' : 'No'}</li>
                                    </ul>
                                </div>
                            )}
                              {sendResult.errors && sendResult.errors.length > 0 && (
                                <div className="mt-4">
                                    <p className="font-medium text-red-600">Failed Emails:</p>
                                    <div className="mt-2 max-h-40 overflow-y-auto">
                                        <ul className="text-xs">
                                            {sendResult.errors.map((error: any, index: number) => (
                                                <li key={index} className="mb-1 pb-1 border-b">
                                                    <strong>{error.recipient?.email}</strong>: {error.error}
                                                    {error.mailer_error && (
                                                        <div className="text-red-500 mt-1 ml-2">
                                                            {error.mailer_error}
                                                        </div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                            
                            {/* Display raw response when there's a parse error */}
                            {sendResult.parseError && (
                                <div className="mt-4">
                                    <p className="font-medium text-red-600">Raw Server Response:</p>
                                    <div className="mt-2 bg-gray-800 text-white p-4 rounded overflow-x-auto max-h-60 overflow-y-auto">
                                        <pre className="text-xs whitespace-pre-wrap">{sendResult.rawResponse || 'No response received from server'}</pre>
                                    </div>
                                    <p className="text-xs text-red-500 mt-2">
                                        Parse error: {sendResult.parseError}
                                    </p>
                                </div>
                            )}
                            
                            <button 
                                onClick={() => navigate('../dashboard')}
                                className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                            >
                                Back to Dashboard
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default EmailSender;