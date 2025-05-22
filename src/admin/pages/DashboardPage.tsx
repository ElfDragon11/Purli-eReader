import { useEffect, useState } from "react";
import { useAuth } from '../lib/auth.tsx';
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useNavigate } from "react-router-dom";
import { Checkbox } from "../../components/ui/checkbox";

interface WaitlistEntry {
  id: number;
  email: string;
  name: string;
  date_added: string;
  source: string;
  selected?: boolean; // New property for selection
}

const ITEMS_PER_PAGE = 10;

export function DashboardPage() {
  const { isAuthenticated, logout } = useAuth();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalEntries, setTotalEntries] = useState(0);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newSource, setNewSource] = useState("");
  const [selectedEntries, setSelectedEntries] = useState<Set<number>>(new Set());
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("../login");
      return;
    }

    // Fetch waitlist data from PHP backend
    const fetchWaitlist = async () => {
      setLoadingError(null);
      try {
        const response = await fetch("/server/getWaitlist.php");
        const text = await response.text();

        try {
          const result = JSON.parse(text);
          if (result.success && result.entries) {
            setEntries(result.entries);
            setTotalEntries(result.entries.length);
          } else {
            console.error("Unexpected response structure:", result);
            setLoadingError(result.message || "Failed to load waitlist data (server error)");
          }
          return result.success;
        } catch (jsonError) {
          console.error("Invalid JSON received from server:", text);
          setLoadingError("Server returned invalid data. Please check server logs.");
          return false;
        }
      } catch (error) {
        console.error("Failed to fetch waitlist:", error);
        setLoadingError(`Network error: ${error instanceof Error ? error.message : "Could not connect to server"}`);
      }
    };

    fetchWaitlist();
  }, [isAuthenticated, navigate]);

  const handleDownloadCSV = () => {
    if (entries.length === 0) {
      alert("No entries to download.");
      return;
    }

    const headers = ["ID", "Email", "Name", "Date Added", "Source"];
    const csvRows = [
      headers.join(','), // header row
      ...entries.map(entry => 
        [
          entry.id,
          `"${entry.email.replace(/"/g, '""')}"`, // Escape double quotes in email
          `"${entry.name.replace(/"/g, '""')}"`,   // Escape double quotes in name
          new Date(entry.date_added).toLocaleDateString(),
          `"${entry.source.replace(/"/g, '""')}"` // Escape double quotes in source
        ].join(',')
      )
    ];
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) { // feature detection
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "waitlist_signups.csv");
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleLogout = () => {
    logout(); // Call logout first
    navigate("../login"); // Navigate to login page after logout
  };

  const handleDelete = async (id: number) => {
    const isConfirmed = window.confirm(
      "Are you sure you want to delete this signup?"
    );
    if (!isConfirmed) return;

    try {
      const response = await fetch(`/server/deleteUser.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const result = await response.json();
      if (result.success) {
        setEntries(entries.filter((entry) => entry.id !== id)); // Remove from UI
        setTotalEntries((prev) => prev - 1);
        alert("Signup deleted successfully!");
      } else {
        alert("Error deleting signup: " + result.error);
      }
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Failed to delete signup.");
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, make API call to add
    const newEntry: WaitlistEntry = {
      id: Date.now(),
      email: newEmail,
      name: newName,
      date_added: new Date().toISOString(),
      source: newSource,
    };
    setEntries([newEntry, ...entries]);
    setTotalEntries((prev) => prev + 1);
    setNewEmail("");
    setNewName("");
    setNewSource("Admin");
  };

  // Handle bulk selections
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    const newSelectedEntries = new Set<number>();
    if (checked) {
      paginatedEntries.forEach((entry) => newSelectedEntries.add(entry.id));
    }
    setSelectedEntries(newSelectedEntries);
  };

  // Handle select all entries across all pages
  const handleSelectAllEntries = () => {
    const newSelectedEntries = new Set<number>();
    entries.forEach((entry) => newSelectedEntries.add(entry.id));
    setSelectedEntries(newSelectedEntries);
  };

  const handleEntrySelect = (id: number) => {
    const newSelectedEntries = new Set(selectedEntries);
    if (newSelectedEntries.has(id)) {
      newSelectedEntries.delete(id);
    } else {
      newSelectedEntries.add(id);
    }
    setSelectedEntries(newSelectedEntries);
  };

  // Handle sending emails to selected users
  const handleSendEmailToSelected = () => {
    // Only proceed if users are selected
    if (selectedEntries.size === 0) {
      alert("Please select at least one user to email.");
      return;
    }
    
    // Filter entries to include only selected ones
    const selectedUsers = entries.filter(entry => selectedEntries.has(entry.id));
    
    // Store selected users in sessionStorage for the email sender to access
    sessionStorage.setItem('selectedEmailRecipients', JSON.stringify(selectedUsers));
    
    // Navigate to email sender
    navigate('../email');
  };

  const paginatedEntries = entries.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-navy">Admin Dashboard</h1>
          <div className="flex gap-4">
            <Button 
              variant="default"
              onClick={() => navigate('../email')}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              Email Tool
            </Button>
            <Button 
              variant="outline" 
              onClick={handleLogout}
              className="text-red-500 border-red-500 hover:bg-red-50"
            >
              Logout
            </Button>
          </div>
        </div>

        {/* Error Display Section */}
        {loadingError && (
          <div className="bg-red-50 border border-red-200 rounded-lg shadow-sm p-4 mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error loading waitlist</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{loadingError}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tools Section */}
        <div className="bg-gray-50 p-4 rounded-lg shadow-sm mb-6">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Email System Tools</h2>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('../direct-diagnostics')}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Email System Diagnostics
            </button>
            <button
              onClick={() => navigate('../diagnostics')}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Full Diagnostics Dashboard
            </button>
          </div>
        </div>

        {/* User Management Section */}
        <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
          <h2 className="text-xl font-semibold text-navy mb-4">User Management</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="border-muted focus:border-primary focus:ring-primary"
              />
            </div>
            <div>
              <Input
                type="email"
                placeholder="Email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                className="border-muted focus:border-primary focus:ring-primary"
              />
            </div>
            <Button type="submit" className="bg-primary hover:bg-primary-hover text-navy font-semibold">
              Add User
            </Button>
          </form>

          <div className="mt-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold text-navy">
                Waitlist Entries ({totalEntries} total)
              </h3>
              <div className="flex gap-2">
                <Button 
                  onClick={handleSendEmailToSelected} 
                  className="bg-green-500 hover:bg-green-600 text-white"
                >
                  Email Selected ({selectedEntries.size})
                </Button>
                <Button onClick={handleDownloadCSV} variant="outline" className="ml-auto">
                  Download CSV
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-3">
                      <div className="flex items-center space-x-1">
                        <input
                          type="checkbox"
                          onChange={handleSelectAll}
                          checked={paginatedEntries.length > 0 && 
                                  paginatedEntries.every(entry => selectedEntries.has(entry.id))}
                          className="h-4 w-4"
                        />
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={handleSelectAllEntries}
                          className="text-xs h-6 ml-1"
                        >
                          All
                        </Button>
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date Added
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedEntries.map((entry) => (
                    <tr key={entry.id} className={selectedEntries.has(entry.id) ? "bg-blue-50" : ""}>
                      <td className="px-2 py-4 whitespace-nowrap text-center">
                        <input
                          type="checkbox"
                          checked={selectedEntries.has(entry.id)}
                          onChange={() => handleEntrySelect(entry.id)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{entry.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{entry.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(entry.date_added).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{entry.source}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(entry.id)}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <div className="flex justify-between items-center">
                <div className="flex gap-3 items-center">
                  <span>
                    Page {currentPage} of {Math.ceil(totalEntries / ITEMS_PER_PAGE)}
                  </span>
                  {selectedEntries.size > 0 && (
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-semibold">
                      {selectedEntries.size} selected
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => p + 1)}
                    disabled={
                      currentPage >=
                      Math.ceil(totalEntries / ITEMS_PER_PAGE)
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}