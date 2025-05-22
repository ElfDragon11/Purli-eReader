<?php
// server/index.php - A simple index file that provides information about available diagnostic tools

// Set proper headers
header('Content-Type: text/html');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Purlibooks Email System - Diagnostic Tools</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 20px auto;
            padding: 20px;
            color: #333;
        }
        h1 {
            color: #2563eb;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
        }
        .card {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
            background-color: #f9fafb;
        }
        .card h2 {
            margin-top: 0;
            color: #4b5563;
        }
        .tool-link {
            display: inline-block;
            background-color: #2563eb;
            color: white;
            padding: 8px 16px;
            margin-right: 8px;
            margin-bottom: 8px;
            border-radius: 4px;
            text-decoration: none;
            font-weight: bold;
        }
        .tool-link:hover {
            background-color: #1d4ed8;
        }
        .info {
            background-color: #dbeafe;
            border-left: 4px solid #3b82f6;
            padding: 12px;
            margin-bottom: 16px;
        }
        code {
            background-color: #e5e7eb;
            padding: 2px 4px;
            border-radius: 4px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <h1>Purlibooks Email System - Diagnostic Tools</h1>
    
    <div class="info">
        <p>This page provides access to various diagnostic tools for troubleshooting the email system.</p>
    </div>
    
    <div class="card">
        <h2>SMTP Connection Testing</h2>
        <p>Test your SMTP server connection to diagnose email sending issues:</p>
        <a href="debug-smtp.php" class="tool-link">SMTP Connection Test</a>
        <p>You can add parameters to customize the test:</p>
        <code>debug-smtp.php?host=mail.example.com&port=465&username=user@example.com&password=yourpassword&secure=ssl&debug=2</code>
    </div>
    
    <div class="card">
        <h2>System Diagnostics</h2>
        <p>Check PHP configuration and extension requirements for email functionality:</p>
        <a href="email-diagnostics.php" class="tool-link">System Diagnostics</a>
    </div>
    
    <div class="card">
        <h2>Response Testing</h2>
        <p>Test how the frontend handles different types of server responses:</p>
        <div>
            <a href="debug-response.php?responseType=valid-json" class="tool-link">Valid JSON</a>
            <a href="debug-response.php?responseType=error-json" class="tool-link">Error JSON</a>
            <a href="debug-response.php?responseType=invalid-json" class="tool-link">Invalid JSON</a>
            <a href="debug-response.php?responseType=html-error" class="tool-link">HTML Error</a>
            <a href="debug-response.php?responseType=php-error" class="tool-link">PHP Error</a>
        </div>
    </div>
    
    <div class="card">
        <h2>Return to Admin</h2>
        <p>Go back to the admin dashboard:</p>
        <a href="../admin/dashboard" class="tool-link">Admin Dashboard</a>
    </div>
    
    <footer style="margin-top: 40px; color: #6b7280; font-size: 0.875rem; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        Purlibooks Email Diagnostics System
    </footer>
</body>
</html>
