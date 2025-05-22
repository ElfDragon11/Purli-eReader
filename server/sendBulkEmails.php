<?php
// send-bulk-emails.php

// Enable error reporting for debugging
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Set up error handling to capture fatal errors
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null && ($error['type'] === E_ERROR || $error['type'] === E_PARSE)) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Fatal PHP error: ' . $error['message'] . ' in ' . $error['file'] . ' on line ' . $error['line']
        ]);
        exit;
    }
});

// PHPMailer files - MOVED HERE
require 'phpMailer/PHPMailer.php';
require 'phpMailer/SMTP.php';
require 'phpMailer/Exception.php';

use PHPMailer\PHPMailer\PHPMailer; // MOVED HERE
use PHPMailer\PHPMailer\Exception; // MOVED HERE

// Set JSON content type early (called only once)
header('Content-Type: application/json');

try {
    // Basic authentication check using the admin token
$headers = getallheaders();
$authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : '';

if (empty($authHeader) || strpos($authHeader, 'Bearer ') !== 0) {
    http_response_code(401); // Unauthorized
    echo json_encode(['message' => 'Authentication required.']);
    exit;
}

// Extract token
$token = substr($authHeader, 7); // Remove "Bearer " prefix

// Verify the token is the same as stored in localStorage for admin auth
// This should be replaced with a more secure token verification in production
if (empty($token) || $token === 'null') {
    http_response_code(401); // Unauthorized
    echo json_encode(['message' => 'Invalid authentication token.']);
    exit;
}

// header('Content-Type: application/json'); // REMOVED - Duplicate: Tell the frontend we respond with JSON

// No need for composer autoload as we're requiring files directly

// --- Configure your email sender based on Namecheap settings ---
// !!! Use environment variables or a secure config file for credentials in production !!!
$smtpHost = 'purlibooks.com'; // Namecheap often requires 'mail.' prefix
$smtpUsername = 'contact@purlibooks.com'; // The email address you authenticate with
$smtpPassword = 'Makingcleanbooks'; // The password for the above email address
$smtpPort = 465; // Using SSL port as specified in Namecheap settings
$smtpSecure = PHPMailer::ENCRYPTION_SMTPS; // Using SMTPS (SSL) for port 465

// Sender details that appear in the 'From' field of the email
$senderEmail = $smtpUsername; // *** THIS MUST MATCH THE SMTP_USERNAME TO AVOID "ON BEHALF OF" ***
$senderName = 'Purlibooks Admin'; // The name shown as the sender

// --- Get data from frontend ---
$json_data = file_get_contents('php://input');
$request_data = json_decode($json_data, true); // Decode JSON into associative array

$recipients = $request_data['recipients'] ?? [];
$subjectTemplate = $request_data['subjectTemplate'] ?? '';
$htmlBodyTemplate = $request_data['htmlBodyTemplate'] ?? '';
$emailSettings = $request_data['emailSettings'] ?? null;

// If custom email settings are provided, override defaults
if ($emailSettings) {
    $smtpHost = $emailSettings['host'] ?? $smtpHost;
    $smtpUsername = $emailSettings['username'] ?? $smtpUsername;
    $smtpPassword = $emailSettings['password'] ?? $smtpPassword;
    $smtpPort = $emailSettings['port'] ?? $smtpPort;
    
    // Handle secure connection correctly
    if (isset($emailSettings['secure'])) {
        if ($emailSettings['secure'] === true) {
            // Use the correct encryption based on port number
            $smtpSecure = ($smtpPort == 465) ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        } else {
            $smtpSecure = '';  // No encryption
        }
    }
    
    $senderEmail = $smtpUsername; // Maintain sender = username to avoid "on behalf of"
    $senderName = $emailSettings['senderName'] ?? $senderName;
}

if (empty($recipients) || !is_array($recipients)) {
    http_response_code(400); // Bad Request
    echo json_encode(['message' => 'No recipients provided or invalid format.']);
    exit;
}

if (empty($subjectTemplate) || empty($htmlBodyTemplate)) {
     http_response_code(400); // Bad Request
    echo json_encode(['message' => 'Subject or Body template missing.']);
    exit;
}


$sentCount = 0;
$failedCount = 0;
$errors = []; // Log detailed errors

// --- Process and Send Emails ---
// First, test the SMTP connection to fail early if connection details are wrong
try {
    $testMail = new PHPMailer(true);
    $testMail->isSMTP();
    $testMail->Host = $smtpHost;
    $testMail->SMTPAuth = true;
    $testMail->Username = $smtpUsername;
    $testMail->Password = $smtpPassword;
    $testMail->SMTPSecure = $smtpSecure;
    $testMail->Port = $smtpPort;
    $testMail->SMTPDebug = 4;
    $testMail->Debugoutput = function($str, $level) {
        error_log("Connection Test: $str");
    };
    
    // Test connection without sending
    if (!$testMail->smtpConnect()) {
        throw new Exception("SMTP connection failed: Could not connect to the SMTP server");
    }
    
    // Close the connection
    $testMail->smtpClose();
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'SMTP Connection Test Failed: ' . $e->getMessage()
    ]);
    exit;
}

foreach ($recipients as $recipient) {
    $name = $recipient['name'] ?? 'Recipient';
    $email = $recipient['email'] ?? null;

    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        error_log("Skipping invalid email address: " . ($email ?? 'null'));
        $failedCount++;
        $errors[] = ['recipient' => $recipient, 'error' => 'Invalid email format'];
        continue; // Skip to the next recipient
    }    // Create a new PHPMailer instance for *each* email to reset state
    $mail = new PHPMailer(true); // Passing `true` enables exceptions
    
    try {        // Server settings for SMTP
        $mail->isSMTP();
        $mail->Host = $smtpHost;
        $mail->SMTPAuth = true; // Enable SMTP authentication
        $mail->Username = $smtpUsername;
        $mail->Password = $smtpPassword;
        $mail->SMTPSecure = $smtpSecure;
        $mail->Port = $smtpPort;
        
        // Debug settings
        $mail->SMTPDebug = 4; // Most verbose debug output (0-4)
        $mail->Debugoutput = function($str, $level) {
            error_log("PHPMailer Debug ($level): $str");
        };

        // Sender and Recipient
        // !!! IMPORTANT: $senderEmail MUST MATCH $smtpUsername to avoid "on behalf of" !!!
        $mail->setFrom($senderEmail, $senderName);
        $mail->addAddress($email, $name); // Add a recipient

        // Content
        $mail->isHTML(true); // Set email format to HTML        // Personalize subject and body
        $personalizedSubject = str_replace('{{name}}', htmlspecialchars($name), $subjectTemplate);
        $personalizedHtmlBody = str_replace('{{name}}', htmlspecialchars($name), $htmlBodyTemplate); // Use htmlspecialchars for name in HTML context
        
        $mail->Subject = $personalizedSubject;
        $mail->Body    = $personalizedHtmlBody;
        // Add a plain-text alternative body for better deliverability
        $plainTextBody = strip_tags(str_replace(['<br>', '<br/>', '<br />', '</p>'], "\n", $personalizedHtmlBody));
        $plainTextBody = html_entity_decode($plainTextBody);
        $mail->AltBody = $plainTextBody;

        $mail->send();
        error_log("Email sent successfully to: {$email}"); // Log success
        $sentCount++;

    } catch (Exception $e) {
        // Log specific errors for debugging
        error_log("Email sending failed for {$email}. Mailer Error: {$mail->ErrorInfo}");
        $failedCount++;
        $errors[] = ['recipient' => $recipient, 'error' => $e->getMessage(), 'mailer_error' => $mail->ErrorInfo];
        // Optionally, wait a bit before the next attempt if encountering rate limits
        // sleep(1);
    }
}

// --- Send Response to Frontend ---
// Use http_response_code(200) by default if successful

// Add information about the email configuration used (without exposing the password)
$configInfo = [
    'host' => $smtpHost,
    'port' => $smtpPort,
    'username' => $smtpUsername,
    'secure' => !empty($smtpSecure),
    'senderName' => $senderName,
    'usingCustomConfig' => $emailSettings !== null
];

echo json_encode([
    'message' => 'Bulk email sending process completed.',
    'sentCount' => $sentCount,
    'failedCount' => $failedCount,
    'emailConfig' => $configInfo,
    // Optionally return errors for frontend display/logging
    'errors' => $errors
]);

// Remember to close any open database connections if you added authentication/logging
// $db_connection->close();

} catch (Exception $exception) {
    // Handle any uncaught exceptions
    http_response_code(500);
    error_log("Uncaught exception in sendBulkEmails.php: " . $exception->getMessage());
    
    echo json_encode([
        'success' => false,
        'message' => 'Server error: ' . $exception->getMessage()
    ]);
} catch (Error $error) {
    // Handle PHP errors
    http_response_code(500);
    error_log("PHP error in sendBulkEmails.php: " . $error->getMessage());
    
    echo json_encode([
        'success' => false,
        'message' => 'PHP error: ' . $error->getMessage()
    ]);
}
?>