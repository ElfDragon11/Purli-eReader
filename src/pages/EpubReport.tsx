import React, { useState, ChangeEvent } from 'react';
import { extractCover } from '../lib/extractCover'; // Import the extractCover function
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// --- Define Types/Interfaces (can be kept in this file or moved to a types file) ---
// UNCOMMENT interfaces if we pass the sections or words back to the react app
/*interface FlaggedSection {
  chapter: string;
  text: string; // The actual extracted text of the section
  summary: string; // A brief summary of the flagged content
}
interface FlaggedWord {
  word: string, 
  count: number
}*/
interface FilterResults {
  job_id: string; // Added job_id
  totalBookCharacters: number;
  totalBookChapters: number;
  totalFilteredCharacters: number;
  percentageFiltered: string; // Note: It's a string because the backend uses .toFixed(2)
  affectedChapterCount: number;
  affectedChapterNames: string[];
  swearWordsCount: number; // count of swear words
  //flaggedSections: FlaggedSection[]; // List of flagged sections
}

// --- End Type Definitions ---

const EpubReport: React.FC = () => {
  // State variables with explicit types
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [results, setResults] = useState<FilterResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string>('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const { user } = useAuth();

  // Store interval ID and current job ID for polling
  const intervalIdRef = React.useRef<NodeJS.Timeout | null>(null);
  const currentJobIdRef = React.useRef<string | null>(null);
  const initialPollAttemptsRef = React.useRef<number>(0); // Added to track initial poll attempts

  // New function to handle the processing logic
  const processEpub = async (file: File) => {
      setProcessing(true);
      setResults(null); 
      setError(null);
      setProgressText(`Uploading and Analyzing "${file.name}"...`);
      setProgressPercent(0);
      if (coverImage) { // Revoke previous image if any
        URL.revokeObjectURL(coverImage);
      }
      setCoverImage(null);

      currentJobIdRef.current = crypto.randomUUID(); // Generate and store unique job ID
      initialPollAttemptsRef.current = 0; // Reset for new job
      console.log("Client generated Job ID:", currentJobIdRef.current);
      setIsPolling(true); // Start polling AFTER setting the job ID

      try {
        const arrayBuffer = await file.arrayBuffer();
        const coverBlob = await extractCover(file); // Renamed to coverBlob
        if (coverBlob) {
          setCoverImage(URL.createObjectURL(coverBlob)); // Convert Blob to object URL
        }

        const headers: HeadersInit = {
          'Content-Type': 'application/octet-stream',
          'X-Job-ID': currentJobIdRef.current!,
        };
        if (user && user.id) { // Check if user and user.id exist
          headers['X-User-ID'] = user.id;
        }
        if (file && file.name) { // Check if file and file.name exist
            headers['X-File-Name'] = file.name;
        }

        const response = await fetch("https://epub-report-478949773026.us-central1.run.app/epub-report", {
          method: 'POST',
          headers: headers, // Use the headers object
          body: arrayBuffer,
        });

        setProgressText('Finalizing analysis...'); // Update text after upload

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: response.statusText }));
          throw new Error(`Analysis failed: ${errorData.message || response.statusText} (Status: ${response.status})`);
        }

        const data: FilterResults = await response.json();
        setResults(data);
        setProgressText('Analysis Complete!');
        setProgressPercent(100); // Ensure progress is 100% on successful completion
      } catch (err: any) {
        console.error("Error processing EPUB:", err);
        setError(`An error occurred during analysis: ${err.message || String(err)}`);
        setProgressText('Analysis failed.');
      } finally {
        setProcessing(false); 
        setIsPolling(false); // Stop polling when main fetch completes or errors
      }
  }

  // Function to check processing status
  const checkProcessingStatus = async (jobId: string) => {
    if (!jobId) return;

    try {
      // Ensure you are using the correct deployed URL for get_epub_status
      const statusCheckUrl = `https://get-epub-status-478949773026.us-central1.run.app/get-epub-status?job_id=${jobId}`;
      const statusResponse = await fetch(statusCheckUrl);

      if (!statusResponse.ok) {
        console.warn(`Status check for job ${jobId} returned: ${statusResponse.status} ${statusResponse.statusText}`);
        if (statusResponse.status === 404) {
            initialPollAttemptsRef.current += 1;
            // Stop polling for 404 only if it's not one of the first few attempts (e.g., after 3-4 attempts)
            // This gives the backend ~9-12 seconds for the initial document creation.
            if (initialPollAttemptsRef.current > 3) { // Allow 3 retries (total 4 attempts including initial)
                console.error(`Job ID ${jobId} still not found after ${initialPollAttemptsRef.current} attempts. Stopping polling.`);
                setIsPolling(false);
            } else {
                console.warn(`Job ID ${jobId} not found (attempt ${initialPollAttemptsRef.current}), will retry...`);
            }
        } else {
            // For other errors (e.g., 500), stop polling immediately.
            console.error(`Status check for job ${jobId} failed with status ${statusResponse.status}. Stopping polling.`);
            setIsPolling(false);
        }
        return;
      }

      // If response is OK, it means the document was found. Reset attempts counter for this job.
      initialPollAttemptsRef.current = 0;

      const statusData = await statusResponse.json();

      if (statusData.progress !== undefined) {
        setProgressPercent(statusData.progress);
      }
      if (statusData.current_step) { // Assuming your status endpoint might provide this
        setProgressText(statusData.current_step);
      }

      if (statusData.status === 'completed' || statusData.status === 'error') {
        setIsPolling(false); 
        if (statusData.status === 'completed') {
            setProgressPercent(100);
            // If results are not yet set by the main fetch, you might set them here if statusData includes them
            // Or trust the main fetch to complete shortly.
            setProgressText(statusData.message || "Analysis complete according to status check.");
        }
        if (statusData.status === 'error' && !error) { // only set error if not already set by main fetch
            setError(statusData.error_message || statusData.message || 'Processing failed according to status check.');
            setProgressText("Analysis failed according to status check.");
        }
      }
    } catch (pollError) {
      console.error("Error polling for status:", pollError);
      // Also count network errors or other fetch issues as an attempt
      initialPollAttemptsRef.current += 1;
      if (initialPollAttemptsRef.current > 3) {
          console.error(`Polling failed multiple times for job ${jobId} due to network or other errors. Stopping polling.`);
          setIsPolling(false);
      }
    }
  };

  // Effect to manage polling
  React.useEffect(() => {
    if (isPolling && currentJobIdRef.current) {
      const jobId = currentJobIdRef.current;
      // Initial check immediately
      checkProcessingStatus(jobId);
      intervalIdRef.current = setInterval(() => {
        checkProcessingStatus(jobId);
      }, 3000); // Poll every 3 seconds
    } else if (!isPolling && intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
    };
  }, [isPolling]); // Only depends on isPolling and the implicitly stable currentJobIdRef

  React.useEffect(() => {
    // Cleanup object URL when component unmounts or coverImage changes
    return () => {
      if (coverImage) {
        URL.revokeObjectURL(coverImage);
      }
    };
  }, [coverImage]);


  // Handle file selection - this now also triggers processing
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files ? event.target.files[0] : null;
    if (file) {
      setSelectedFile(file);
      // Immediately start the processing function
      processEpub(file);
    } else {
        // User cancelled file selection
        setSelectedFile(null);
        setResults(null);
        setError(null);
        setProgressText('');
    }
  };

  // Function to reset the state and allow uploading another file
  const resetAnalysis = () => {
      setSelectedFile(null);
      setProcessing(false);
      setResults(null);
      setError(null);
      setProgressText('');
      if (coverImage) {
        URL.revokeObjectURL(coverImage); // Revoke old object URL
      }
      setCoverImage(null); // Reset the cover image
      setProgressPercent(0); // Reset progress bar
      setIsPolling(false); // Ensure polling is stopped
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current); // Clear any existing polling interval
        intervalIdRef.current = null;
      }
      currentJobIdRef.current = null; // Reset job ID
  };


  return (
      // Using Tailwind classes based on the Purli screenshots and previous code
          <div className="text-center px-5 max-w-3xl mx-auto"> {/* Adjust padding and max-width */}
              {/* Conditional rendering for initial state, processing, or results */}
              {!selectedFile && !processing && !results && !error && (
                  <>
                    {/* Initial state: Show main marketing copy and upload button */}
                    <h1 className="text-5xl md:text-6xl font-bold mb-2 text-deep-navy">
                        Scan Your Book for <br/>Explicit Content
                    </h1>
                    <p className="text-lg text-gray-600 mb-5 italic">
                        Learn what sections you should skip to have a clean reading experience.
                    </p>
                    <p className="text-base text-gray-600 mb-8 leading-relaxed">
                      Upload your EPUB file, and this tool will generate a report highlighting potential explicit content using AI analysis. Use this information to filter your book within the Purli app for a worry-free reading experience.
                    </p>
                    <div className="flex justify-center mb-5">
                        <input
                          type="file"
                          accept=".epub"
                          onChange={handleFileChange}
                          id="epub-upload"
                          className="hidden" // Tailwind class to hide element
                        />
                        {/* Styled label for file input, acts as the button */}
                        <label
                          htmlFor="epub-upload"
                          className="inline-block py-3 px-6 bg-blue-300 text-gray-800 rounded cursor-pointer transition-colors duration-300 ease-in-out hover:bg-blue-400"
                        >
                          Choose EPUB File to Analyze
                        </label>
                    </div>
                  </>
              )}

              {/* Show progress/error messages during or after processing */}
              {processing && (
                 <div className="mt-4 italic text-gray-600 text-center">
                     <p>{progressText}</p>
                     {/* Progress Bar - always show if processing or polling was active and not yet fully reset */}
                     {(isPolling || progressPercent > 0) && (
                        <>
                            <p className="text-sm font-semibold text-blue-700">{progressPercent}%</p> {/* Added percentage display */}
                            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 my-1"> {/* Adjusted margin */}
                                <div 
                                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${progressPercent}%` }}
                                ></div>
                            </div>
                        </>
                     )}
                     {/* Show spinner only if polling is not active AND progress is 0 (initial upload phase) */}
                     {!isPolling && progressPercent === 0 && (
                        <div className="w-8 h-8 border-4 border-blue-500 border-solid rounded-full animate-spin border-t-transparent mx-auto mt-4"></div>
                     )}
                     <p className="mt-2">Please be patient, our server is hard at work! Your file should be processed in less than 5 minutes.</p>
                 </div>
              )}
              {error && (
                  <div className="mt-4 text-red-600">
                    <p>{error}</p>
                    {/* Offer retry/reset after error */}
                    <button
                        onClick={resetAnalysis}
                        className="mt-4 py-2 px-4 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                        Try Again
                    </button>
                  </div>
              )}

              {/* Show results after successful processing */}
              {results && (
                <div className=" p-5 pt-0">
                    <h2 className="text-2xl font-semibold text-gray-800 mb-4 text-center">
                      Content Report for: <br/> {selectedFile?.name.split('.').slice(0, -1).join('.')}
                    </h2>

                    {coverImage && (
                        <div className="mb-4">
                            <img
                                src={coverImage}
                                alt="Book Cover"
                                className="w-32 h-auto mx-auto rounded shadow"
                            />
                        </div>
                    )}

      
                  <p className="mb-2 text-gray-600">Excplicit Content in book: <strong className="font-bold">{results.percentageFiltered}%</strong></p>
                  <p className="mb-2 text-gray-600">Number of Swear Words: <strong className="font-bold">{results.swearWordsCount}</strong></p>
                  <p className="mb-2 text-gray-600">Chapters with Explicit Content: <strong className="font-bold">{results.affectedChapterCount}/{results.totalBookChapters}</strong></p>
                  {results.affectedChapterCount > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-gray-700 font-medium">Explicit Chapters:</p>
                      <ul className="list-disc list-inside pl-0 ">
                        {results.affectedChapterNames.map((chapterName, index) => (
                          <li key={index} className="mb-1 text-gray-600">{chapterName}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {/* Button to analyze another file */}
                    <div className="text-center space-x-0 md:space-x-4">
                      <button
                          onClick={resetAnalysis}
                          className="mt-8 py-2 px-4 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 "
                      >
                          Upload Another Book
                      </button>
                      <Link to={user ? "/library" : "/"} >
                        <button className="mt-8 py-2 px-4 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                          Read with Purli
                        </button>
                      </Link>
                    </div>

                  </div>
              )}
          </div>
  );
};

export default EpubReport;