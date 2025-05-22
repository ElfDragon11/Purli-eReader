<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

include 'db.php';

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Add a new signup to the waitlist
    $data = json_decode(file_get_contents("php://input"), true);

    if (isset($data["name"]) && isset($data["email"])) {
        $name = $conn->real_escape_string($data["name"]);
        $email = $conn->real_escape_string($data["email"]);

        $sql = "INSERT INTO signups (name, email) VALUES ('$name', '$email')";

        if ($conn->query($sql) === TRUE) {
            echo json_encode(["success" => true, "message" => "Successfully added to waitlist!"]);
        } else {
            echo json_encode(["success" => false, "message" => "Error: " . $conn->error]);
        }
    } else {
        echo json_encode(["success" => false, "message" => "Missing name or email"]);
    }
}

if ($_SERVER["REQUEST_METHOD"] == "GET") {
    // Retrieve all waitlist entries
    //echo json_encode(["successGet" => true]);
    $sql = "SELECT id, name, email, date_added, source FROM signups ORDER BY date_added DESC";
    //echo $sql;
    $result = $conn->query($sql);
    //echo json_encode($result);
    $waitlist = [];
    while ($row = $result->fetch_assoc()) {
        $waitlist[] = $row;
    }
    echo json_encode(["success" => true, "entries" => $waitlist]);
}

$conn->close();
?>
