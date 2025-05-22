<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");
/*
$servername = "localhost";
$username = "calvevav_purli_admin";
$password = "Makingcleanbooks";
$database = "calvevav_purli_waitlist";

// Create connection
$conn = new mysqli($servername, $username, $password, $database);
*/

include 'db.php';
// Check connection
if ($conn->connect_error) {
    die(json_encode(["success" => false, "message" => "Connection failed: " . $conn->connect_error]));
}

// Get data from request
$data = json_decode(file_get_contents("php://input"), true);

if (isset($data['fullName']) && isset($data['email'])) {
    $name = $conn->real_escape_string($data['fullName']);
    $email = $conn->real_escape_string($data['email']);
    $source = $conn->real_escape_string($data['source']);

    // Prevent duplicate emails
    $checkEmail = "SELECT * FROM signups WHERE email = '$email'";
    $result = $conn->query($checkEmail);

    if ($result->num_rows > 0) {
        echo json_encode(["success" => false, "message" => "Email already exists"]);
    } else {
        $sql = "INSERT INTO signups (name, email, source) VALUES ('$name', '$email', '$source')";
        if ($conn->query($sql) === TRUE) {
            echo json_encode(["success" => true, "message" => "User added successfully"]);
        } else {
            echo json_encode(["success" => false, "message" => "Error: " . $conn->error]);
        }
    }
} else {
    echo json_encode(["success" => false, "message" => "Invalid input"]);
}

$conn->close();
?>
