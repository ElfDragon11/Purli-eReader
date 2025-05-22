<?php
require 'db.php';
header("Content-Type: application/json");

// Read the JSON input
$data = json_decode(file_get_contents("php://input"), true);

if ($_SERVER["REQUEST_METHOD"] === "POST" && isset($data["id"])) {
    $signup_id = intval($data["id"]);

    // Prepare and execute delete statement
    $stmt = $conn->prepare("DELETE FROM signups WHERE id = ?");
    $stmt->bind_param("i", $signup_id);
    
    if ($stmt->execute()) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false, "error" => "Error deleting signup."]);
    }
    exit;
}


?>


