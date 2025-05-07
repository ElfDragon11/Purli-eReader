<?php

// Recipient email address
$to = "calvin@purlibooks.com";

// Subject of the email
$subject = "New Book Uploaded";

// Get book title and uploader email from POST or GET parameters
$bookTitle = urldecode($_POST["bookTitle"] ?? $_GET["bookTitle"] ?? ""); // Use $_POST, fallback to $_GET, default to empty string
$uploaderEmail = urldecode($_POST["uploaderEmail"] ?? $_GET["uploaderEmail"] ?? "");

// Validate that both parameters are present
if (empty($bookTitle) || empty($uploaderEmail)) {
    http_response_code(400); // Set HTTP status code to Bad Request
    echo "Error: Both 'bookTitle' and 'uploaderEmail' parameters are required.";
    exit;
}

// Compose the email message
$message = "A new book has been uploaded:\n\n";
$message .= "Title: " . $bookTitle . "\n";
$message .= "Uploader Email: " . $uploaderEmail . "\n\n";
$message .= "Please review and provide scene filtering!";

// Additional headers
$headers = "From: bookUpload@purlibooks.com\r\n"; // Change this to a valid email address on your server
$headers .= "Reply-To: " . $uploaderEmail . "\r\n";
$headers .= "X-Mailer: PHP/" . phpversion();

// Send the email
$mailSent = mail($to, $subject, $message, $headers);

// Check if the email was sent successfully
if ($mailSent) {
    http_response_code(200); // Set HTTP status code to OK
    echo "Notification email sent successfully.";
} else {
    http_response_code(500); // Set HTTP status code to Internal Server Error
    echo "Error: Failed to send notification email.";
}

?>