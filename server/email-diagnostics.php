<?php
// email-diagnostics.php - A comprehensive diagnostic tool for email functionality

// Set proper headers for JSON output
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

// Enable error reporting for diagnostics
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Register shutdown function to catch fatal errors
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'component' => 'PHP Runtime',
            'message' => 'Fatal PHP error: ' . $error['message'],
            'error_details' => $error
        ], JSON_PRETTY_PRINT);
    }
});

try {
    // Collect system information
    $systemInfo = [
        'php_version' => PHP_VERSION,
        'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
        'operating_system' => PHP_OS,
        'sapi_name' => php_sapi_name(),
        'max_execution_time' => ini_get('max_execution_time'),
        'memory_limit' => ini_get('memory_limit'),
        'upload_max_filesize' => ini_get('upload_max_filesize'),
        'post_max_size' => ini_get('post_max_size'),
        'display_errors' => ini_get('display_errors'),
        'date_timezone' => date_default_timezone_get(),
        'server_time' => date('Y-m-d H:i:s')
    ];

    // Check PHP extensions
    $requiredExtensions = [
        'openssl' => 'Required for secure SMTP connections',
        'mbstring' => 'Required for handling UTF-8 email content',
        'json' => 'Required for API responses',
        'curl' => 'Required for some mail services',
        'fileinfo' => 'Used for MIME detection'
    ];

    $extensionsStatus = [];
    foreach ($requiredExtensions as $ext => $purpose) {
        $extensionsStatus[$ext] = [
            'loaded' => extension_loaded($ext),
            'purpose' => $purpose
        ];
    }

    // Check for PHPMailer files
    $mailerFiles = [
        'phpMailer/PHPMailer.php' => file_exists('phpMailer/PHPMailer.php'),
        'phpMailer/SMTP.php' => file_exists('phpMailer/SMTP.php'),
        'phpMailer/Exception.php' => file_exists('phpMailer/Exception.php')
    ];

    // Check folder permissions
    $folderPermissions = [
        'server_directory' => [
            'path' => __DIR__,
            'writable' => is_writable(__DIR__),
            'permissions' => substr(sprintf('%o', fileperms(__DIR__)), -4)
        ]
    ];

    // Check if we can include PHPMailer files
    $canLoadPHPMailer = false;
    $phpMailerVersion = 'Not available';
    $phpMailerError = null;

    try {
        require_once 'phpMailer/PHPMailer.php';
        require_once 'phpMailer/SMTP.php';
        require_once 'phpMailer/Exception.php';
        
        use PHPMailer\PHPMailer\PHPMailer;
        
        $canLoadPHPMailer = true;
        $phpMailerVersion = PHPMailer::VERSION;
    } catch (Throwable $e) {
        $phpMailerError = $e->getMessage();
    }

    // Check network connectivity to SMTP servers
    $smtpServers = [
        [
            'host' => 'mail.purlibooks.com', 
            'port' => 465,
            'protocol' => 'SSL'
        ],
        [
            'host' => 'mail.purlibooks.com', 
            'port' => 587, 
            'protocol' => 'TLS'
        ]
    ];

    $networkTests = [];
    foreach ($smtpServers as $server) {
        $startTime = microtime(true);
        $socket = @fsockopen(
            $server['protocol'] === 'SSL' ? "ssl://" . $server['host'] : $server['host'],
            $server['port'],
            $errno,
            $errstr,
            5 // 5 second timeout
        );
        $endTime = microtime(true);
        
        $result = [
            'host' => $server['host'],
            'port' => $server['port'],
            'protocol' => $server['protocol'],
            'connected' => $socket !== false,
            'response_time_ms' => round(($endTime - $startTime) * 1000, 2)
        ];
        
        if (!$result['connected']) {
            $result['error'] = "$errno: $errstr";
        } else {
            fclose($socket);
        }
        
        $networkTests[] = $result;
    }

    // Prepare and output the diagnostic report
    $diagnosticReport = [
        'success' => true,
        'timestamp' => time(),
        'date_time' => date('Y-m-d H:i:s'),
        'system_info' => $systemInfo,
        'php_extensions' => $extensionsStatus,
        'phpmailer' => [
            'files_exist' => $mailerFiles,
            'can_load' => $canLoadPHPMailer,
            'version' => $phpMailerVersion,
            'error' => $phpMailerError
        ],
        'folder_permissions' => $folderPermissions,
        'network_tests' => $networkTests
    ];

    // Return the diagnostic report
    echo json_encode($diagnosticReport, JSON_PRETTY_PRINT);

} catch (Throwable $t) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Diagnostic error: ' . $t->getMessage(),
        'error' => [
            'message' => $t->getMessage(),
            'code' => $t->getCode(),
            'file' => $t->getFile(),
            'line' => $t->getLine(),
            'trace' => $t->getTraceAsString()
        ]
    ], JSON_PRETTY_PRINT);
}
?>
