<?php
session_start();
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

include 'db.php';

/*ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);*/

//echo("<h1>this<h1/>");
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $data = json_decode(file_get_contents("php://input"), true);
    //echo($data);
    if (isset($data["username"]) && isset($data["password"])) {
        $username = $conn->real_escape_string($data["username"]);
        $password = $data["password"];

        $sql = "SELECT id, password_hash FROM users WHERE username = '$username'";
        $result = $conn->query($sql);

        if ($result->num_rows > 0) {
            $user = $result->fetch_assoc();

            if (password_verify($password, $user["password_hash"])) {
                $_SESSION["user_id"] = $user["id"];
                $_SESSION["auth_token"] = session_id(); // Generate a session token

                echo json_encode(["success" => true, "token" => $_SESSION["auth_token"]]);
            } else {
                echo json_encode(["success" => false, "message" => "Invalid credentials"]);
            }
        } else {
            echo json_encode(["success" => false, "message" => "Invalid credentials"]);
        }
    }
}

$conn->close();
?>
