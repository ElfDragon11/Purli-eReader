import functions_framework
import requests # Still needed if you keep the URL path, but will be removed for the new file upload path
import json
import re
import zipfile
import bs4
import os # Need os for file operations and cleanup
import uuid # To generate unique temporary filenames
from typing import List, Dict
import google.generativeai as genai
import time # Added for retry delay
import random # Added for jitter in retries
from concurrent.futures import ThreadPoolExecutor, as_completed # Added for parallel processing
import firebase_admin # Added for Firestore
from firebase_admin import credentials, firestore # Added for Firestore

# === CONFIGURATION ===
MODEL = "gemini-2.5-flash-preview-04-17"
# GEMINI_API_KEY will come from environment variable in Cloud Run/Cloud Functions
MAX_API_RETRIES = 3
RETRY_BASE_DELAY_SECONDS = 5
MAX_CONCURRENT_CHAPTERS = 10 # Max chapters to process in parallel

# --- Global/Initialization ---
# These will run once per instance cold start
# IMPORTANT: Fetch GEMINI_API_KEY from environment variables in production!
# Hardcoding is for testing ONLY. In Cloud Run, use the service's environment variables.
# GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") # <--- Use this in production!
GEMINI_API_KEY = "AIzaSyAyvm1rNE2cK2GBdA1K_8OFWMl1MCiQN10" # <-- Remove this line for production!


genai_initialized = False # Flag to check if Gemini setup succeeded

if not GEMINI_API_KEY:
    print("FATAL: GEMINI_API_KEY environment variable not set.")
    # The service will likely fail to start or requests will return 500
else:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(model_name=MODEL)
        print(f"Successfully initialized Gemini model: {MODEL}")
        genai_initialized = True
    except Exception as e:
        print(f"Error initializing Gemini model {MODEL}: {e}")
        print("Please ensure the model name is correct and your API key is valid.")
        # genai_initialized remains False

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    try:
        firebase_admin.initialize_app()
        print("Firebase Admin SDK initialized successfully for epub_report.")
    except Exception as e:
        print(f"Error initializing Firebase Admin SDK for epub_report: {e}")
        # If Firebase doesn't initialize, status updates won't work.

db = firestore.client() # Get a Firestore client

# === EPUB Extraction Function ===
# Keep your existing extract_epub_chapters function
def extract_epub_chapters(epub_path: str) -> List[Dict]:
    """Extracts text content from EPUB chapters."""
    chapters = []
    try:
        with zipfile.ZipFile(epub_path, 'r') as zip_ref:
            for file_name in zip_ref.namelist():
                # Check for standard EPUB chapter files and avoid table of contents
                if file_name.endswith(('.xhtml', '.html')) and 'toc' not in file_name.lower() and not file_name.startswith('__MACOSX'):
                    try:
                        with zip_ref.open(file_name, 'r') as f:
                            content_bytes = f.read()
                            try:
                                content_str = content_bytes.decode("utf-8", errors='ignore')
                            except Exception as decode_error:
                                print(f"  → Error decoding content from {file_name}: {decode_error}. Skipping file.")
                                continue

                            soup = bs4.BeautifulSoup(content_str, "html.parser")
                            text = soup.get_text(separator=' ', strip=True)
                            cleaned_text = re.sub(r'\s+', ' ', text).strip()
                            # Only add if it has significant text content
                            if len(cleaned_text) > 200:
                                chapters.append({"file": file_name, "text": cleaned_text})
                            else:
                                print(f"Skipping small or empty file: {file_name}")
                    except Exception as e:
                        print(f"Error processing file {file_name} in EPUB: {e}")
    except FileNotFoundError:
         # This shouldn't happen if the temporary file was written correctly
         print(f"Error: EPUB file not found at {epub_path}")
         return []
    except zipfile.BadZipFile:
         print(f"Error: Not a valid EPUB file at {epub_path}")
         return []
    except Exception as e:
        print(f"An unexpected error occurred while extracting EPUB: {e}")
        return []

    if not chapters:
        print("Warning: No suitable chapters found in the EPUB.")
    return chapters


# === Build Gemini prompt ===
# Keep your existing build_prompt function
def build_prompt(chapter_text: str) -> List[Dict]:
    return [{
        "role": "user",
        "parts": [{
            "text": f"""
                You are an AI tasked with identifying and marking **explicit sexual content or erotica** within book chapters for creating a clean reading experience.

                You will be given the text of a single book chapter.

                Your task is to identify and flag sexually explicit dialog, sentences, phrases, or continuous blocks of text that represent **complete scenes or extended passages** containing:
                    - Explicit descriptions of sex acts (including intercourse, oral sex, etc.)
                    - Graphic depictions of nudity or sexual arousal
                    - Reference to sexual acts that invoke strong visual imagery
                    - Detailed descriptions of sexual organs or bodily functions in a sexual context
                    - Highly graphic or detailed accounts of physical intimacy that are equivalent to erotica or pornography.

                To accomplish this task effectively, please follow these internal steps before generating the final JSON output:
                1.  **Scan for Intimate Content:** Read through the chapter and identify any areas describing physical intimacy, kissing, touching, or emotionally intense romantic interactions.
                2.  **Evaluate Explicitness:** For each identified area, carefully evaluate if it meets the **strict criteria for explicit sexual content or erotica** defined below. Focus *only* on the graphic physical descriptions of sex acts.
                3.  **Define Scene Boundaries:** If an area *does* meet the explicit criteria, determine the **full, continuous scene or passage** where this explicit content occurs. Identify the natural start and end points of this *entire sequence*, including any immediately surrounding dialogue, internal thoughts, or non-graphic actions that are an integral part of *that specific intimate sequence*, but *excluding* text that occurs clearly before or after the explicit scene has concluded.
                4.  **Format Output:** For each identified explicit scene/passage, store it under the \'text\' key.
                5.  **Compile JSON:** Compile all identified explicit scenes/passages into the requested JSON format under the 'sections' key.

                **DO NOT FLAG:**
                - Romance, affection, or emotional intensity (even if passionate or suggestive)
                - Kissing, hugging, or cuddling (unless they are the direct beginning or end of an explicit sexual scene you are flagging)
                - Non-sexual descriptions of bodies or actions (e.g., violence, injury, physical appearance outside of a sexual context)
                - Non-explicit sexual innuendo or suggestive dialogue (unless it is part of a larger explicit scene)
                - **Do not flag dialogue or descriptions that happen *before* or *after* the explicit scene concludes, even if they are related to the relationship.**

                Return a JSON object in this format:
                ```json
                {{
                "sections": [
                    {{
                    "chapter": "Chapter title or number",
                    "text": "entire text of the flagged section",
                    "summary": "short non-descriptive, non explicit summary of the flagged section",
                    }}
                    // More sections if found
                ]
                }}
                ```

                If no content is flagged, return:
                {{ "sections": [] }}
                Be conservative. If you're unsure, include the section.

                Chapter:
                \"\"\"
                {chapter_text}
                \"\"\"
            """
        }]
    }]


# === Send a single chapter to Gemini ===
def send_chapter_to_gemini(chapter_text: str, chapter_file_name: str = "Unknown Chapter", job_id: str = None) -> List[Dict]:
    """Sends a chapter text to the Gemini API for analysis with retries."""
    log_prefix = f"[Job {job_id}] " if job_id else ""
    if not genai_initialized:
        print(f"{log_prefix}Gemini API not initialized, cannot send chapter {chapter_file_name}.")
        return []

    messages = build_prompt(chapter_text)
    for attempt in range(MAX_API_RETRIES):
        try:
            print(f"{log_prefix}Attempt {attempt + 1}/{MAX_API_RETRIES} for chapter {chapter_file_name}.")
            response = model.generate_content(
                messages,
                generation_config={"temperature": 0.3},
            )
            if not response.candidates:
                print(f"{log_prefix}  → Gemini returned no candidates for chapter {chapter_file_name}.")
                if response.prompt_feedback and response.prompt_feedback.block_reason:
                    print(f"{log_prefix}  → Request blocked due to: {response.prompt_feedback.block_reason}")
                elif response.prompt_feedback and response.prompt_feedback.safety_ratings:
                    print(f"{log_prefix}  → Request blocked due to safety settings: {response.prompt_feedback.safety_ratings}")
                # Do not retry on block reasons, as it's unlikely to change
                return []

            if not hasattr(response, 'text') or not response.text:
                print(f"{log_prefix}  → Gemini returned empty text content for chapter {chapter_file_name}.")
                return [] # Or retry if this could be transient

            try:
                json_match = re.search(r"```json\s*(.*?)\s*```", response.text, re.DOTALL)
                if json_match:
                    json_string = json_match.group(1)
                else:
                    json_string = response.text.strip()
                    print(f"{log_prefix}  → Warning: No JSON code block found for chapter {chapter_file_name}. Attempting to parse full response text.")
                    if not json_string.startswith('{') or not json_string.endswith('}'):
                        print(f"{log_prefix}  → Response text does not look like JSON for chapter {chapter_file_name}: {json_string[:100]}...")
                        return [] # Unlikely to be parsable

                output = json.loads(json_string)
                if isinstance(output, dict) and "sections" in output and isinstance(output["sections"], list):
                    return output["sections"]
                else:
                    print(f"{log_prefix}  → Gemini response did not match expected JSON structure for chapter {chapter_file_name}: {response.text[:500]}...")
                    return []
            except json.JSONDecodeError:
                print(f"{log_prefix}  → Failed to parse JSON response from text for chapter {chapter_file_name}: {response.text[:500]}...")
                return [] # Bad JSON, unlikely to fix on retry
            except Exception as e:
                print(f"{log_prefix}  → An error occurred while processing Gemini response text for chapter {chapter_file_name}: {e}")
                return [] # Other processing error

        except Exception as e:
            print(f"{log_prefix}Error calling Gemini API for chapter {chapter_file_name} (Attempt {attempt + 1}/{MAX_API_RETRIES}): {e}")
            if attempt < MAX_API_RETRIES - 1:
                delay = RETRY_BASE_DELAY_SECONDS * (2 ** attempt) + random.uniform(0, 1) # Exponential backoff with jitter
                print(f"{log_prefix}Retrying in {delay:.2f} seconds...")
                time.sleep(delay)
            else:
                print(f"{log_prefix}Max retries reached for chapter {chapter_file_name}. Giving up.")
                return []
    return [] # Should be unreachable if loop completes, but as a fallback


# === Run the full processing from file bytes ===
# Create a new function to handle processing from bytes (like an upload)
def process_epub_from_bytes(epub_bytes: bytes, job_id: str = None) -> Dict:
    """Processes EPUB content received as bytes and returns results."""
    log_prefix = f"[Job {job_id}] " if job_id else ""
    firestore_status_ref = None
    if job_id and firebase_admin._apps: # Check if SDK is initialized
        firestore_status_ref = db.collection('epub_process_status').document(job_id)
        try:
            firestore_status_ref.set({
                'job_id': job_id,
                'status': 'initializing',
                'progress': 0,
                'current_step': 'Initializing and saving EPUB file.',
                'last_updated': firestore.SERVER_TIMESTAMP
            })
        except Exception as e_fs_init:
            print(f"{log_prefix}Error writing initial status to Firestore: {e_fs_init}")
            # Continue processing, but status updates might not work

    if not genai_initialized:
        print(f"{log_prefix}Gemini API not initialized, cannot process book.")
        if firestore_status_ref:
            try:
                firestore_status_ref.update({
                    'status': 'error',
                    'error_message': 'Gemini API not initialized.',
                    'progress': 0,
                    'last_updated': firestore.SERVER_TIMESTAMP
                })
            except Exception as e_fs_err:
                print(f"{log_prefix}Error writing Gemini init error status to Firestore: {e_fs_err}")
        return {"error": "Gemini API not initialized", "job_id": job_id}

    if not epub_bytes:
        print(f"{log_prefix}Error: Received empty EPUB bytes.")
        if firestore_status_ref:
            try:
                firestore_status_ref.update({
                    'status': 'error',
                    'error_message': 'Received empty file data.',
                    'progress': 0,
                    'last_updated': firestore.SERVER_TIMESTAMP
                })
            except Exception as e_fs_err:
                print(f"{log_prefix}Error writing empty file error status to Firestore: {e_fs_err}")
        return {"error": "Received empty file data.", "job_id": job_id}

    temp_epub_filename = f"uploaded_book_{uuid.uuid4()}.epub"
    temp_epub_path = os.path.join('/tmp', temp_epub_filename)

    print(f"{log_prefix}Saving EPUB bytes to temporary file: {temp_epub_path}")
    try:
        with open(temp_epub_path, "wb") as f:
            f.write(epub_bytes)
        print(f"{log_prefix}Successfully saved EPUB to {temp_epub_path}")
        if firestore_status_ref:
            firestore_status_ref.update({
                'current_step': 'EPUB file saved, starting extraction.',
                'last_updated': firestore.SERVER_TIMESTAMP
            })
    except Exception as e:
        print(f"{log_prefix}Error saving temporary file {temp_epub_path}: {e}")
        if firestore_status_ref:
            try:
                firestore_status_ref.update({
                    'status': 'error',
                    'error_message': f'Failed to save temporary EPUB file: {str(e)}',
                    'progress': 0,
                    'last_updated': firestore.SERVER_TIMESTAMP
                })
            except Exception as e_fs_err:
                print(f"{log_prefix}Error writing file save error status to Firestore: {e_fs_err}")
        return {"error": f"Failed to save temporary EPUB file: {e}", "job_id": job_id}

    chapters_data = []
    total_chapters_for_firestore = 0
    try:
        if firestore_status_ref:
            firestore_status_ref.update({
                'current_step': 'Extracting chapters from EPUB...',
                'last_updated': firestore.SERVER_TIMESTAMP
            })
        chapters_data = extract_epub_chapters(temp_epub_path)
        total_chapters_for_firestore = len(chapters_data)
        if firestore_status_ref:
            firestore_status_ref.update({
                'total_chapters': total_chapters_for_firestore,
                'current_step': f'Extracted {total_chapters_for_firestore} chapters. Preparing for analysis.',
                'last_updated': firestore.SERVER_TIMESTAMP
            })

        if not chapters_data:
            print(f"{log_prefix}No chapters to process after extraction.")
            if firestore_status_ref:
                try:
                    firestore_status_ref.update({
                        'status': 'completed', # Or 'warning' if you prefer
                        'message': 'No suitable chapters found in the EPUB.',
                        'progress': 100, # No processing needed, so 100% of 'nothing'
                        'chapters_processed': 0,
                        'total_chapters': 0,
                        'last_updated': firestore.SERVER_TIMESTAMP
                    })
                except Exception as e_fs_err:
                    print(f"{log_prefix}Error writing no chapters status to Firestore: {e_fs_err}")
            return {
                "job_id": job_id,
                "words": [],
                "phrases": [],
                "sections": [],
                "replacements": [],
                "message": "No suitable chapters found in the EPUB."
            }

        # Initialize result aggregation variables
        all_flagged_sections = []
        book_total_char_count = 0
        # book_total_chapter_count is effectively chapters_processed_count now for Firestore
        chapters_processed_count = 0 
        book_swear_word_count_map = {}
        book_flagged_chapter_count = 0
        book_flagged_content_char_count = 0
        book_flagged_chapter_titles = []

        SWEAR_WORDS = {'damn', 'damned', 'damning', 'hell', 'fuck', 'fucking', 'fucked', 'fucks', 'shit', 'shitting', 'shitted', 'shits', 'ass', 'asses', 'asshole', 'bitch', 'cock', 'penus', 'motherfuck', 'motherfucker', 'motherfucking', 'motherfuckers'}

        print(f"{log_prefix}Starting parallel processing of {total_chapters_for_firestore} chapters with up to {MAX_CONCURRENT_CHAPTERS} workers.")
        if firestore_status_ref:
            firestore_status_ref.update({
                'current_step': f'Starting analysis of {total_chapters_for_firestore} chapters.',
                'progress': 5, # Small progress for starting analysis phase
                'last_updated': firestore.SERVER_TIMESTAMP
            })
        
        with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_CHAPTERS) as executor:
            future_to_chapter_info = {
                executor.submit(send_chapter_to_gemini, chapter["text"], chapter.get('file', f'Chapter_{i}'), job_id): (chapter, i)
                for i, chapter in enumerate(chapters_data)
            }

            for i, future in enumerate(as_completed(future_to_chapter_info)):
                original_chapter_info, chapter_index = future_to_chapter_info[future]
                chapter_file_name = original_chapter_info.get('file', f'Chapter_{chapter_index}')
                chapter_text = original_chapter_info["text"]
                
                chapters_processed_count += 1
                print(f"{log_prefix}Completed processing for chapter {chapters_processed_count}/{total_chapters_for_firestore} ({chapter_file_name}).")
                
                if firestore_status_ref:
                    progress_percent = int((chapters_processed_count / total_chapters_for_firestore) * 100) if total_chapters_for_firestore > 0 else 0
                    firestore_status_ref.update({
                        'chapters_processed': chapters_processed_count,
                        'progress': progress_percent,
                        'current_step': f'Analyzing chapter {chapters_processed_count}/{total_chapters_for_firestore}: {chapter_file_name}',
                        'last_updated': firestore.SERVER_TIMESTAMP
                    })

                # Count swear words in the current chapter
                current_chapter_swear_counts = {}
                for word in chapter_text.split():
                    cleaned_word = re.sub(r'\W+', '', word).lower()
                    if cleaned_word in SWEAR_WORDS:
                        current_chapter_swear_counts[cleaned_word] = current_chapter_swear_counts.get(cleaned_word, 0) + 1
                
                # Add current chapter's swear counts to book total
                for word, count in current_chapter_swear_counts.items():
                    book_swear_word_count_map[word] = book_swear_word_count_map.get(word, 0) + count

                try:
                    flagged_sections_for_chapter = future.result()
                    if flagged_sections_for_chapter:
                        print(f"{log_prefix}  → Chapter {chapter_file_name} had {len(flagged_sections_for_chapter)} section(s) flagged.")
                        first_flagged_section = flagged_sections_for_chapter[0]
                        chapter_title_from_gemini = first_flagged_section.get("chapter", chapter_file_name)
                        if chapter_title_from_gemini not in book_flagged_chapter_titles :
                             book_flagged_chapter_titles.append(chapter_title_from_gemini)
                        all_flagged_sections.extend(flagged_sections_for_chapter)
                        book_flagged_content_char_count += sum(len(section["text"]) for section in flagged_sections_for_chapter)
                        book_flagged_chapter_count +=1
                    else:
                        print(f"{log_prefix}  → Chapter {chapter_file_name} had no sections flagged.")
                except Exception as exc:
                    print(f"{log_prefix}Chapter {chapter_file_name} generated an exception during future.result(): {exc}")
                    # Optionally log this specific chapter error to Firestore if needed

        total_swear_word_instances = sum(book_swear_word_count_map.values())
        book_percent_filtered = round((book_flagged_content_char_count / book_total_char_count) * 100, 1) if book_total_char_count > 0 else 0
        
        print(f"{log_prefix}Finished processing all chapters. Aggregating results.")
        final_result_payload = {
            "job_id": job_id,
            "totalBookCharacters": book_total_char_count,
            "totalBookChapters": chapters_processed_count, # Use actual processed count
            "totalFilteredCharacters": book_flagged_content_char_count, 
            "percentageFiltered": book_percent_filtered,
            "affectedChapterCount": book_flagged_chapter_count, 
            "affectedChapterNames": book_flagged_chapter_titles,
            "swearWordsCount": total_swear_word_instances, 
            "message": "EPUB processing completed."
        }
        if firestore_status_ref:
            try:
                firestore_status_ref.update({
                    'status': 'completed',
                    'progress': 100,
                    'current_step': 'Processing complete.',
                    'results_summary': { # Storing a summary, not the full flagged sections
                        'percentageFiltered': book_percent_filtered,
                        'affectedChapterCount': book_flagged_chapter_count,
                        'swearWordsCount': total_swear_word_instances
                    },
                    'last_updated': firestore.SERVER_TIMESTAMP
                })
            except Exception as e_fs_complete:
                print(f"{log_prefix}Error writing completion status to Firestore: {e_fs_complete}")
        return final_result_payload

    except Exception as e_main_proc:
        print(f"{log_prefix}An error occurred during main EPUB processing: {e_main_proc}")
        if firestore_status_ref:
            try:
                firestore_status_ref.update({
                    'status': 'error',
                    'error_message': f'An error occurred during EPUB processing: {str(e_main_proc)}',
                    'last_updated': firestore.SERVER_TIMESTAMP
                })
            except Exception as e_fs_err_main:
                print(f"{log_prefix}Error writing main processing error to Firestore: {e_fs_err_main}")
        return {"error": f"An error occurred during EPUB processing: {str(e_main_proc)}", "job_id": job_id}
    finally:
        if os.path.exists(temp_epub_path):
            try:
                os.remove(temp_epub_path)
                print(f"{log_prefix}Cleaned up temporary file: {temp_epub_path}")
            except OSError as e:
                print(f"{log_prefix}Error removing temporary file {temp_epub_path}: {e}")

# === HTTP Cloud Function Entry Point ===
@functions_framework.http
def epub_report(request):
    """HTTP Cloud Function to filter EPUB content using Gemini."""
    from flask import make_response, jsonify

    job_id = request.headers.get('X-Job-ID') # Get job_id from header
    if not job_id:
        job_id = str(uuid.uuid4()) # Generate a job_id if not provided
        print(f"No X-Job-ID header found. Generated Job ID: {job_id}")
    else:
        print(f"Received request with X-Job-ID: {job_id}")

    log_prefix = f"[Job {job_id}] " if job_id else ""

    # Ensure Gemini API is initialized
    if not genai_initialized:
        print(f"{log_prefix}Received request, but Gemini API initialization failed.")
        response_data = {"error": "Service backend initialization failed.", "job_id": job_id}
        response = make_response(jsonify(response_data))
        response.status_code = 500
        response.headers.set('Access-Control-Allow-Origin', '*')
        return response

    # Handle CORS preflight request (OPTIONS method)
    if request.method == 'OPTIONS':
        print(f"{log_prefix}Handling CORS preflight request.")
        response = make_response()
        response.headers.set('Access-Control-Allow-Origin', '*')
        response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Job-ID') # Allow X-Job-ID
        response.headers.set('Access-Control-Max-Age', '3600')
        return response

    # Handle POST request - expecting file data
    if request.method == 'POST':
        print(f"{log_prefix}Received POST request.")
        try:
            # Get the raw binary data from the request body
            # This assumes the client sends the ArrayBuffer directly as the request body
            epub_data = request.data # type: bytes

            if not epub_data:
                print(f"{log_prefix}Error: No file data received in request body.")
                response_data = {"error": "No EPUB file data received. Please upload the file directly.", "job_id": job_id}
                response = make_response(jsonify(response_data))
                response.status_code = 400
                response.headers.set('Access-Control-Allow-Origin', '*')
                return response

            print(f"{log_prefix}Received {len(epub_data)} bytes of EPUB data.")
            
            # Start processing and pass job_id
            print(f"{log_prefix}Starting EPUB processing.")
            result = process_epub_from_bytes(epub_data, job_id)
            result["job_id"] = job_id # Ensure job_id is in the final response

            if "error" in result:
                print(f"{log_prefix}Error during processing: {result['error']}")
                response = make_response(jsonify(result))
                response.status_code = 500 # Or appropriate error code based on result['error']
                response.headers.set('Access-Control-Allow-Origin', '*')
                return response

            response = make_response(jsonify(result))
            response.headers.set('Content-Type', 'application/json')
            response.headers.set('Access-Control-Allow-Origin', '*')
            print(f"{log_prefix}Request processed successfully.")
            return response

        except Exception as e:
            print(f"{log_prefix}An unhandled error occurred during request processing: {e}")
            response_data = {"error": f"Internal Server Error: {e}", "job_id": job_id}
            response = make_response(jsonify(response_data))
            response.status_code = 500
            response.headers.set('Access-Control-Allow-Origin', '*')
            return response
    else:
        print(f"{log_prefix}Received unsupported method: {request.method}")
        response_data = {"error": f"Method {request.method} not allowed", "job_id": job_id}
        response = make_response(jsonify(response_data))
        response.status_code = 405
        response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
        response.headers.set('Access-Control-Allow-Origin', '*')
        return response