<?php

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

$host = "localhost";
$dbname = "calvevav_purli_waitlist";
$username = "calvevav_purli_admin";
$password = "Makingcleanbooks";
/*/
$host = "localhost";
$username = "root"; // Default for MAMP
$password = "root"; // Default for MAMP
$dbname = "development"; // Change this to your database name
/*/
$conn = new mysqli($host, $username, $password, $dbname);

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
//echo "Connected successfully";
?>
