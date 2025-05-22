<?php
// Set the content type header to JSON for responses
header('Content-Type: application/json');

// Read JSON input from the request body
$input = file_get_contents('php://input');
$data = json_decode($input, true);

// Validate the input
if (!isset($data['email']) || !isset($data['name'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Both email and name are required.']);
    exit;
}

$email = $data['email'];
$name  = $data['name'];

// Recipient email and subject
$to = 'calvin@purlibooks.com';
$subject = 'Author Contact Form Submitted';

// Create the HTML email message with inline CSS for a clean look
$message = "
<html>
<head>
  <title>Author Contact Form Submitted</title>
  <style type='text/css'>
    body {
      font-family: Arial, sans-serif;
      background-color: #f4f4f4;
      margin: 0;
      padding: 20px;
      color: #333;
    }
    .container {
      max-width: 600px;
      margin: auto;
      background: #ffffff;
      padding: 20px;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    h2 {
      color: #0056b3;
      margin-bottom: 20px;
    }
    p {
      line-height: 1.6;
      margin: 10px 0;
    }
    .label {
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class='container'>
    <h2>New Contact Form Submission</h2>
    <p><span class='label'>Name:</span> " . htmlspecialchars($name) . "</p>
    <p><span class='label'>Email:</span> " . htmlspecialchars($email) . "</p>
  </div>
</body>
</html>
";

// Set the email headers for HTML content
$headers = "MIME-Version: 1.0" . "\r\n";
$headers .= "Content-type: text/html; charset=UTF-8" . "\r\n";
$headers .= "From: no-reply@purlibooks.com" . "\r\n";

// Send the email and return a JSON response based on the result
if (mail($to, $subject, $message, $headers)) {
    echo json_encode(['success' => 'Email sent successfully.']);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to send email.']);
}
?>
