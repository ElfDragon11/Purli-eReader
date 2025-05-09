import functions_framework
import requests
import json
import re
import zipfile
import bs4
from typing import List, Dict
import google.generativeai as genai
import os
import uuid
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
import firebase_admin
from firebase_admin import credentials, firestore
from supabase import create_client, Client

# === CONFIGURATION ===
MODEL = "gemini-2.5-flash-preview-04-17"
MAX_API_RETRIES = 3
RETRY_BASE_DELAY_SECONDS = 5
MAX_CONCURRENT_CHAPTERS = 10

# --- Global/Initialization ---
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
genai_initialized = False
model = None # Initialize model to None

if not GEMINI_API_KEY:
    print("FATAL: GEMINI_API_KEY environment variable not set.")
else:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(model_name=MODEL)
        print(f"Successfully initialized Gemini model: {MODEL}")
        genai_initialized = True
    except Exception as e:
        print(f"Error initializing Gemini model {MODEL}: {e}")

# Initialize Firebase Admin SDK and Firestore client
db = None
firebase_initialized = False
try:
    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    db = firestore.client()
    firebase_initialized = True
    print("Firebase Admin SDK and Firestore client initialized successfully for Cloud Run Function.")
except Exception as e:
    print(f"FATAL: Error initializing Firebase/Firestore for Cloud Run Function: {e}")

# Initialize Supabase Client
supabase_url: str = os.environ.get("SUPABASE_URL")
supabase_key: str = os.environ.get("SUPABASE_SERVICE_KEY")
supabase: Client | None = None
supabase_initialized = False
if supabase_url and supabase_key:
    try:
        supabase = create_client(supabase_url, supabase_key)
        supabase_initialized = True
        print("Supabase client initialized successfully for Cloud Run Function.")
    except Exception as e:
        print(f"FATAL: Error initializing Supabase client for Cloud Run Function: {e}")
else:
    print("FATAL: SUPABASE_URL and/or SUPABASE_SERVICE_KEY env vars not set for Cloud Run Function. Supabase reporting disabled.")

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
                            if len(cleaned_text) > 200:
                                chapters.append({"file": file_name, "text": cleaned_text})
                            else:
                                print(f"Skipping small or empty file: {file_name}")
                    except Exception as e:
                        print(f"Error processing file {file_name} in EPUB: {e}")
    except FileNotFoundError:
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
    """Builds the prompt message list for the Gemini API."""
    return [{
        "role": "user",
        "parts": [{
            "text": f"""
                You are helping create a clean-reading experience for families and schools by identifying and marking **sentances, phrases, scenes or extended passages including or focused on explicit sexual content or erotica**.

                You will be given the text of a single book chapter.

                Your task is to identify and flag sexually explicit dialog or text, or continuous blocks of text that represent **complete scenes or extended passages** containing:
                    - Explicit descriptions of sex acts (including intercourse, oral sex, etc.)
                    - Graphic depictions of nudity or sexual arousal
                    - Refrence to sexual acts that invoke strong visual imagery
                    - Detailed descriptions of sexual organs or bodily functions in a sexual context
                    - Highly graphic or detailed accounts of physical intimacy that are equivalent to erotica or pornography.

                    **To accomplish this task effectively, please follow these internal steps before generating the final JSON output:**
                    1.  **Scan for Intimate Content:** Read through the chapter and identify any areas describing physical intimacy, kissing, touching, or emotionally intense romantic interactions.
                    2.  **Evaluate Explicitness:** For each identified area, carefully evaluate if it meets the **strict criteria for explicit sexual content or erotica** defined below. Focus *only* on the graphic physical descriptions of sex acts.
                    3.  **Define Scene Boundaries:** If an area *does* meet the explicit criteria, determine the **full, continuous scene or passage** where this explicit content occurs. Identify the natural start and end points of this *entire sequence*, including any immediately surrounding dialogue, internal thoughts, or non-graphic actions that are an integral part of *that specific intimate sequence*, but *excluding* text that occurs clearly before or after the explicit scene has concluded.
                    4.  **Format Output:** For each identified explicit scene/passage, extract the first few words for the `start` key and the last few words for the `end` key, ensuring these accurately capture the full extent of the flagged passage's boundaries.
                    5.  **Generate Replacement:** Create a neutral `replacement` summary or marker for the flagged passage.
                    6.  **Compile JSON:** Compile all identified explicit scenes/passages into the requested JSON format under the 'scenes' key.

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
                    "start": "The exact first 5-7 words of the section to filter(HTML INCLUDED)", // IMPORTANT: Include any html tags that are part of the text. DO NOT append ellipses or other punctuation to the start or end of the text
                    "end": " The exact last 5-7 words of thes section to filter(HTML INCLUDED)",  // IMPORTANT: Include any html tags that are part of the text. DO NOT append ellipses or other punctuation to the start or end of the text
                    "replacement": "<br/><br/>[short summary of what is being filtered]<br/><br/>" // A brief, family-friendly summary like[ CHaracter A and Character B kiss passionately] or a suggestion like [Content removed]"
                    }}
                    // More sections if found
                ]
                }}

                If no content is flagged, return:
                {{ "sections": [] }}
                Be conservative. If you're unsure, include the section. Provide enough context in 'start' and 'end' (e.g., 5-10 words) to easily locate the section in the original text. The 'replacement' should be a brief, family-family summary or a suggestion like "[Content removed]".
                Chapter:
                Chapter:
                \"\"\"
                {chapter_text}
                \"\"\"
            """
        }]
    }]


# === Send a single chapter to Gemini ===
def send_chapter_to_gemini(chapter_text: str, chapter_file_name: str = "Unknown Chapter", job_id: str = None) -> List[Dict]: # Added chapter_file_name and job_id
    log_prefix = f"[Job {job_id}] " if job_id else ""
    if not genai_initialized or not model: # Check model as well
         print(f"{log_prefix}Gemini API not initialized, cannot send chapter {chapter_file_name}.")
         return []

    messages = build_prompt(chapter_text)
    for attempt in range(MAX_API_RETRIES):
        try:
            print(f"{log_prefix}Attempt {attempt + 1}/{MAX_API_RETRIES} for chapter {chapter_file_name}.")
            response = model.generate_content(
                messages,
                generation_config={"temperature": 0.3},
                request_options={'timeout': 60} # Added 60-second timeout
            )
            if not response.candidates:
                print(f"{log_prefix}  → Gemini returned no candidates for chapter {chapter_file_name}.")
                if response.prompt_feedback and response.prompt_feedback.block_reason:
                    print(f"  → Request blocked due to: {response.prompt_feedback.block_reason}")
                elif response.prompt_feedback and response.prompt_feedback.safety_ratings:
                    print(f"  → Request blocked due to safety settings: {response.prompt_feedback.safety_ratings}")
                return []

            if not hasattr(response, 'text') or not response.text:
                print(f"{log_prefix}  → Gemini returned empty text content for chapter {chapter_file_name}.")
                return []

            try:
                json_match = re.search(r"```json\s*(.*?)\s*```", response.text, re.DOTALL)
                if json_match:
                    json_string = json_match.group(1)
                else:
                    json_string = response.text.strip()
                    print(f"  → Warning: No JSON code block found. Attempting to parse full response text.")
                    if not json_string.startswith('{') or not json_string.endswith('}'):
                        print(f"  → Response text does not look like JSON: {json_string[:100]}...")
                        return []

                output = json.loads(json_string)
                return output.get("sections", [])

            except json.JSONDecodeError:
                print(f"{log_prefix}  → Failed to parse JSON response for chapter {chapter_file_name}: {response.text[:500]}...")
                return []
            except Exception as e:
                print(f"{log_prefix}  → An error occurred while processing Gemini response text for chapter {chapter_file_name}: {e}")
                return []

        except Exception as e:
            print(f"{log_prefix}Error calling Gemini API for chapter {chapter_file_name} (Attempt {attempt + 1}/{MAX_API_RETRIES}): {e}")
            if attempt < MAX_API_RETRIES - 1:
                delay = RETRY_BASE_DELAY_SECONDS * (2 ** attempt) + random.uniform(0, 1)
                print(f"{log_prefix}Retrying in {delay:.2f} seconds...")
                time.sleep(delay)
            else:
                print(f"{log_prefix}Max retries reached for chapter {chapter_file_name}. Giving up.")
                return []
    return []


# === Run the full process ===
def process_epub_from_url(epub_url: str, job_id: str, user_id_for_supabase: str | None, epub_url_for_supabase: str) -> Dict:
    log_prefix = f"[Job {job_id}] "
    firestore_status_ref = None
    temp_epub_path = f"/tmp/downloaded_book_{job_id}.epub" # Unique temp file per job

    # --- Function to save report to Supabase (similar to epub_report.py) ---
    def save_report_to_supabase(report_data):
        if not supabase_initialized or not supabase:
            print(f"{log_prefix}Supabase not initialized. Skipping report save for Cloud Run Function.")
            return
        try:
            data, error = supabase.table('reports').insert(report_data).execute()
            if error:
                print(f"{log_prefix}Error saving report to Supabase for Cloud Run Function: {error}")
            else:
                print(f"{log_prefix}Report successfully saved to Supabase for Cloud Run Function: {data}")
        except Exception as e_supa:
            print(f"{log_prefix}Exception while saving report to Supabase for Cloud Run Function: {e_supa}")
    # ---

    try:
        if firebase_initialized and db:
            firestore_status_ref = db.collection('epub_process_status').document(job_id)
            firestore_status_ref.set({
                'job_id': job_id, 'status': 'initializing', 'progress': 0,
                'current_step': 'Initializing and downloading EPUB from URL.',
                'last_updated': firestore.SERVER_TIMESTAMP
            })
        else:
            print(f"{log_prefix}Firebase not initialized. Firestore status updates will be skipped.")

        if not genai_initialized:
            error_message = "Gemini API not initialized for Cloud Run Function."
            print(f"{log_prefix}{error_message}")
            if firestore_status_ref: firestore_status_ref.update({'status': 'error', 'error_message': error_message, 'last_updated': firestore.SERVER_TIMESTAMP})
            save_report_to_supabase({
                "filter_job_id": job_id, "user_id": user_id_for_supabase, "file_name": epub_url_for_supabase,
                "processing_status": "error_gemini_init", "error_message": error_message, "gemini_model_used": MODEL
            })
            return {"error": error_message, "filter_job_id": job_id, "words": [], "phrase": [], "sections": []} # Updated error return

        print(f"{log_prefix}Downloading EPUB from: {epub_url}")
        response = requests.get(epub_url, stream=True, timeout=60)
        response.raise_for_status()
        with open(temp_epub_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192): f.write(chunk)
        print(f"{log_prefix}Successfully downloaded EPUB to {temp_epub_path}")
        if firestore_status_ref: firestore_status_ref.update({'current_step': 'EPUB downloaded, starting extraction.', 'last_updated': firestore.SERVER_TIMESTAMP})

        chapters_data = extract_epub_chapters(temp_epub_path)
        total_chapters_for_firestore = len(chapters_data)
        if firestore_status_ref: firestore_status_ref.update({'total_chapters': total_chapters_for_firestore, 'current_step': f'Extracted {total_chapters_for_firestore} chapters. Preparing for analysis.', 'last_updated': firestore.SERVER_TIMESTAMP})

        if not chapters_data:
            message = "No suitable chapters found in the EPUB."
            print(f"{log_prefix}{message}")
            if firestore_status_ref: firestore_status_ref.update({'status': 'completed', 'message': message, 'progress': 100, 'last_updated': firestore.SERVER_TIMESTAMP})
            save_report_to_supabase({
                "filter_job_id": job_id, "user_id": user_id_for_supabase, "file_name": epub_url_for_supabase,
                "total_book_chapters": 0, "processing_status": "completed_no_chapters",
                "error_message": message, "gemini_model_used": MODEL,
                "total_swear_word_instances": 0, "swear_word_map": json.dumps({})
            })
            return {"words": [], "phrase": [], "sections": [], "message": message, "filter_job_id": job_id} # Updated return for no chapters

        all_flagged_sections = []
        book_total_char_count = 0
        chapters_processed_count = 0
        book_flagged_chapter_count = 0
        book_flagged_chapter_titles = []

        if firestore_status_ref: firestore_status_ref.update({'current_step': f'Starting analysis of {total_chapters_for_firestore} chapters.', 'progress': 5, 'last_updated': firestore.SERVER_TIMESTAMP})

        with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_CHAPTERS) as executor:
            future_to_chapter_info = {
                executor.submit(send_chapter_to_gemini, chapter["text"], chapter.get('file', f'Chapter_{i}'), job_id): (chapter, i)
                for i, chapter in enumerate(chapters_data)
            }
            for future in as_completed(future_to_chapter_info):
                original_chapter_info, chapter_index = future_to_chapter_info[future]
                chapter_file_name = original_chapter_info.get('file', f'Chapter_{chapter_index}')
                chapter_text = original_chapter_info["text"]
                book_total_char_count += len(chapter_text)
                chapters_processed_count += 1
                print(f"{log_prefix}Completed processing for chapter {chapters_processed_count}/{total_chapters_for_firestore} ({chapter_file_name}).")

                if firestore_status_ref:
                    progress_percent = int((chapters_processed_count / total_chapters_for_firestore) * 100) if total_chapters_for_firestore > 0 else 0
                    firestore_status_ref.update({
                        'chapters_processed': chapters_processed_count, 'progress': progress_percent,
                        'current_step': f'Analysis in progress: {chapters_processed_count} of {total_chapters_for_firestore} chapters analyzed.',
                        'last_updated': firestore.SERVER_TIMESTAMP
                    })
                try:
                    flagged_for_chapter = future.result()
                    if flagged_for_chapter:
                        print(f"{log_prefix}  → Chapter {chapter_file_name} had {len(flagged_for_chapter)} section(s) flagged by Cloud Run Function prompt.")
                        # Add original chapter file name to each section for context if needed later, though not in final JSON output
                        for section in flagged_for_chapter: section['original_chapter_file'] = chapter_file_name
                        all_flagged_sections.extend(flagged_for_chapter)
                        if chapter_file_name not in book_flagged_chapter_titles:
                            book_flagged_chapter_titles.append(chapter_file_name)
                        book_flagged_chapter_count +=1 # Count chapters with flags, not flags themselves for this metric
                except Exception as exc:
                    print(f"{log_prefix}Chapter {chapter_file_name} generated an exception: {exc}")
        
        # Apply the specific start/end truncation for this function's output
        processed_all_flagged_sections_for_output = []
        for section in all_flagged_sections:
            new_section = {
                "start": " ".join(section.get("start", "").split()[:7]) if section.get("start") else "",
                "end": " ".join(section.get("end", "").split()[-7:]) if section.get("end") else "",
                "replacement": section.get("replacement", "[Content removed]")
            }
            processed_all_flagged_sections_for_output.append(new_section)

        percentage_filtered_chapters = round((book_flagged_chapter_count / total_chapters_for_firestore) * 100, 1) if total_chapters_for_firestore > 0 else 0
        
        final_result_payload = {
            "words": [],  # New field, initialized as empty list
            "phrase": [], # New field, initialized as empty list
            "sections": processed_all_flagged_sections_for_output,
            "filter_job_id": job_id
        }
        if firestore_status_ref: firestore_status_ref.update({
            'status': 'completed', 'progress': 100, 'current_step': 'Processing complete for Cloud Run Function.',
            'results_summary': {'flagged_section_count': len(all_flagged_sections), 'affected_chapter_count': book_flagged_chapter_count},
            'last_updated': firestore.SERVER_TIMESTAMP
        })
        
        report_to_save = {
            "filter_job_id": job_id, "user_id": user_id_for_supabase, "file_name": epub_url_for_supabase,
            "total_book_characters": book_total_char_count, "total_book_chapters": chapters_processed_count,
            "total_filtered_characters": len(all_flagged_sections), # Number of flagged sections
            "percentage_filtered": percentage_filtered_chapters, # Chapter-based percentage
            "affected_chapter_count": book_flagged_chapter_count,
            "affected_chapter_names": json.dumps(book_flagged_chapter_titles),
            "all_flagged_sections": json.dumps(processed_all_flagged_sections_for_output), # Save the processed ones
            "total_swear_word_instances": 0, "swear_word_map": json.dumps({}), # Not applicable for this function
            "processing_status": "completed", "gemini_model_used": MODEL
        }
        save_report_to_supabase(report_to_save)
        return final_result_payload

    except requests.exceptions.RequestException as e_req:
        error_message = f"Failed to download EPUB: {e_req}"
        print(f"{log_prefix}{error_message}")
        if firestore_status_ref: firestore_status_ref.update({'status': 'error', 'error_message': error_message, 'last_updated': firestore.SERVER_TIMESTAMP})
        save_report_to_supabase({
            "job_id": job_id, "user_id": user_id_for_supabase, "file_name": epub_url_for_supabase,
            "processing_status": "error_download", "error_message": error_message, "gemini_model_used": MODEL
        })
        return {"error": error_message, "job_id": job_id, "words": [], "phrase": [], "sections": []} # Updated error return
    except Exception as e_main:
        error_message = f"An error occurred during EPUB processing in Cloud Run Function: {e_main}"
        print(f"{log_prefix}{error_message}")
        if firestore_status_ref: firestore_status_ref.update({'status': 'error', 'error_message': error_message, 'last_updated': firestore.SERVER_TIMESTAMP})
        save_report_to_supabase({
            "job_id": job_id, "user_id": user_id_for_supabase, "file_name": epub_url_for_supabase,
            "processing_status": "error_processing", "error_message": str(e_main), "gemini_model_used": MODEL
        })
        return {"error": error_message, "job_id": job_id, "words": [], "phrase": [], "sections": []} # Updated error return
    finally:
        if os.path.exists(temp_epub_path):
            try:
                os.remove(temp_epub_path)
                print(f"{log_prefix}Cleaned up temporary file: {temp_epub_path}")
            except OSError as e_os:
                print(f"{log_prefix}Error removing temporary file {temp_epub_path}: {e_os}")

# === HTTP Cloud Function Entry Point ===
@functions_framework.http
def filter_epub_handler(request):
    from flask import make_response, jsonify # Keep Flask imports local to handler

    job_id = request.headers.get('X-Job-ID')
    user_id = request.headers.get('X-User-ID')

    if not job_id:
        job_id = str(uuid.uuid4())
        print(f"No X-Job-ID header found. Generated Job ID for Cloud Run Function: {job_id}")
    else:
        print(f"Received request for Cloud Run Function with X-Job-ID: {job_id}")
    
    log_prefix = f"[Job {job_id}] "

    if not genai_initialized:
        print(f"{log_prefix}Received request, but Gemini API initialization failed for Cloud Run Function.")
        response_data = {"error": "Service backend initialization failed.", "job_id": job_id, "words": [], "phrase": [], "sections": []}
        response = make_response(jsonify(response_data))
        response.status_code = 500
        response.headers.set('Access-Control-Allow-Origin', '*')
        return response

    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.set('Access-Control-Allow-Origin', '*')
        response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Job-ID, X-User-ID')
        response.headers.set('Access-Control-Max-Age', '3600')
        return response

    if request.method == 'POST':
        try:
            request_json = request.get_json(silent=True)
            epub_url = request_json.get("epub_url") if request_json else None

            if not epub_url:
                response_data = {"error": "Missing 'epub_url' in request body", "job_id": job_id, "words": [], "phrase": [], "sections": []}
                response = make_response(jsonify(response_data))
                response.status_code = 400
                response.headers.set('Access-Control-Allow-Origin', '*')
                return response

            print(f"{log_prefix}Received request to filter EPUB from: {epub_url} for Cloud Run Function.")
            result = process_epub_from_url(epub_url, job_id, user_id, epub_url)
            
            # Ensure all required keys are present in the result, especially for error cases from process_epub_from_url
            final_response_data = {
                "words": result.get("words", []),
                "phrases": result.get("phrase", []),
                "sections": result.get("sections", []),
            }
            if "error" in result:
                final_response_data["error"] = result["error"]
                if "message" in result: # Carry over message if it exists (e.g. for no chapters found)
                     final_response_data["message"] = result["message"]
                response = make_response(jsonify(final_response_data))
                response.status_code = 500 if "error" in result and result["error"] != "No suitable chapters found in the EPUB." else 200 # 200 for no chapters
            elif "message" in result and result.get("sections") == []: # Handle no chapters found as success with message
                final_response_data["message"] = result["message"]
                response = make_response(jsonify(final_response_data))
                response.status_code = 200
            else:
                response = make_response(jsonify(final_response_data))
            
            response.headers.set('Content-Type', 'application/json')
            response.headers.set('Access-Control-Allow-Origin', '*')
            print(f"{log_prefix}Request processed by Cloud Run Function.")
            return response
        except Exception as e:
            print(f"{log_prefix}An unhandled error occurred in filter_epub_handler: {e}")
            response_data = {"error": f"Internal Server Error: {str(e)}", "job_id": job_id, "words": [], "phrase": [], "sections": []}
            response = make_response(jsonify(response_data))
            response.status_code = 500
            response.headers.set('Access-Control-Allow-Origin', '*')
            return response
    else:
        response_data = {"error": f"Method {request.method} not allowed", "job_id": job_id, "words": [], "phrase": [], "sections": []}
        response = make_response(jsonify(response_data))
        response.status_code = 405
        response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
        response.headers.set('Access-Control-Allow-Origin', '*')
        return response