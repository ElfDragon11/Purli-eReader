<?php
// debug-response.php - A tool to test server response parsing
// This script helps diagnose issues with frontend JSON parsing by returning various response formats

// Set proper headers for JSON output (or intentionally wrong ones for testing)
$contentType = $_GET['contentType'] ?? 'application/json';
header("Content-Type: $contentType");

// Get parameters for testing
$responseType = $_GET['responseType'] ?? 'valid-json';
$delay = intval($_GET['delay'] ?? 0);

// Add artificial delay if requested
if ($delay > 0) {
    sleep(min($delay, 10)); // Max 10 seconds
}

// Generate different response types for testing
switch ($responseType) {
    case 'valid-json':
        echo json_encode([
            'success' => true,
            'message' => 'This is a valid JSON response',
            'timestamp' => time(),
            'data' => [
                'number' => 42,
                'string' => 'Hello World',
                'boolean' => true,
                'null' => null,
                'array' => [1, 2, 3],
                'object' => ['key' => 'value']
            ]
        ], JSON_PRETTY_PRINT);
        break;
        
    case 'error-json':
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'This is an error response with a valid JSON structure',
            'error' => 'ERROR_TEST',
            'code' => 400
        ], JSON_PRETTY_PRINT);
        break;
        
    case 'invalid-json':
        echo '{
            "success": true,
            "message": "This is an invalid JSON response with syntax errors,
            "timestamp": ' . time() . ',
        }';
        break;
        
    case 'html-error':
        header('Content-Type: text/html');
        echo '<html>
            <body>
                <h1>500 Internal Server Error</h1>
                <p>This simulates an HTML error page returned instead of JSON</p>
                <hr>
                <address>Apache/2.4.41 (Ubuntu) Server</address>
            </body>
        </html>';
        break;
        
    case 'php-error':
        header('Content-Type: text/plain');
        echo "PHP Fatal error:  Uncaught Error: Call to undefined function nonexistent_function() in /var/www/html/server/debug-response.php:42\nStack trace:\n#0 {main}\n  thrown in /var/www/html/server/debug-response.php on line 42";
        break;
        
    case 'empty':
        // Return an empty response
        break;
        
    case 'large-json':
        $largeArray = [];
        for ($i = 0; $i < 1000; $i++) {
            $largeArray[] = [
                'id' => $i,
                'name' => "Item $i",
                'description' => str_repeat("Lorem ipsum dolor sit amet ", 5),
                'created' => date('Y-m-d H:i:s')
            ];
        }
        echo json_encode([
            'success' => true,
            'message' => 'This is a large JSON response',
            'items' => $largeArray
        ]);
        break;
        
    case 'mixed-content':
        echo "Some plain text before the JSON\n";
        echo json_encode(['success' => true, 'message' => 'JSON embedded in other content']);
        echo "\nSome plain text after the JSON";
        break;
        
    case 'cors-error':
        header('Access-Control-Allow-Origin: http://wrong-origin.example.com');
        echo json_encode(['success' => false, 'message' => 'CORS policy error simulation']);
        break;
        
    case 'timeout':
        // Sleep for 30 seconds to trigger timeout
        set_time_limit(35);
        sleep(30);
        echo json_encode(['success' => true, 'message' => 'Response after timeout']);
        break;

    case 'slow-response':
        // Flush output buffers and send response in chunks with delays
        ob_end_flush();
        flush();
        
        echo "Starting slow response...\n";
        flush();
        
        sleep(2);
        echo "First part of data...\n";
        flush();
        
        sleep(2);
        echo "Second part of data...\n";
        flush();
        
        sleep(2);
        echo "Final JSON: " . json_encode(['success' => true, 'message' => 'Slow response completed']);
        break;
        
    default:
        echo json_encode([
            'success' => true,
            'message' => 'Unknown response type requested',
            'responseType' => $responseType
        ]);
}
?>
