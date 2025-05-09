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

# === CONFIGURATION ===
MODEL = "gemini-2.5-flash-preview-04-17"
# GEMINI_API_KEY will come from environment variable in Cloud Run/Cloud Functions

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
# Keep your existing send_chapter_to_gemini function
def send_chapter_to_gemini(chapter_text: str) -> List[Dict]:
    """Sends a chapter text to the Gemini API for analysis."""
    if not genai_initialized:
         print("Gemini API not initialized, cannot send chapter.")
         return []

    messages = build_prompt(chapter_text)
    try:
        response = model.generate_content(
            messages,
            generation_config={"temperature": 0.3},
        )
        if not response.candidates:
            print("  → Gemini returned no candidates.")
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                print(f"  → Request blocked due to: {response.prompt_feedback.block_reason}")
            elif response.prompt_feedback and response.prompt_feedback.safety_ratings:
                print(f"  → Request blocked due to safety settings: {response.prompt_feedback.safety_ratings}")
            return []

        if not hasattr(response, 'text') or not response.text:
            print("  → Gemini returned empty text content.")
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
            # Validate output structure slightly
            if isinstance(output, dict) and "sections" in output and isinstance(output["sections"], list):
                return output["sections"]
            else:
                print(f"  → Gemini response did not match expected JSON structure: {response.text[:500]}...")
                return []

        except json.JSONDecodeError:
            print(f"  → Failed to parse JSON response from text: {response.text[:500]}...")
            return []
        except Exception as e:
            print(f"  → An error occurred while processing Gemini response text: {e}")
            return []

    except Exception as e:
        print(f"Error calling Gemini API for chapter: {e}")
        return []


# === Run the full processing from file bytes ===
# Create a new function to handle processing from bytes (like an upload)
def process_epub_from_bytes(epub_bytes: bytes) -> Dict:
    """Processes EPUB content received as bytes and returns results."""
    if not genai_initialized:
        print("Gemini API not initialized, cannot process book.")
        return {"error": "Gemini API not initialized"}

    if not epub_bytes:
        print("Error: Received empty EPUB bytes.")
        return {"error": "Received empty file data."}

    # Save the bytes to a temporary file
    # Use a unique filename to avoid potential conflicts if processing is parallelized
    temp_epub_filename = f"uploaded_book_{uuid.uuid4()}.epub"
    temp_epub_path = os.path.join('/tmp', temp_epub_filename)

    print(f"Saving EPUB bytes to temporary file: {temp_epub_path}")
    try:
        with open(temp_epub_path, "wb") as f:
            f.write(epub_bytes)
        print(f"Successfully saved EPUB to {temp_epub_path}")
    except IOError as e:
        print(f"Error saving temporary file {temp_epub_path}: {e}")
        return {"error": f"Failed to save temporary EPUB file: {e}"}
    except Exception as e:
         print(f"An unexpected error occurred while saving file: {e}")
         return {"error": f"An unexpected error occurred while saving file: {e}"}


    chapters = []
    try:
        # Extract chapters from the temporary file
        chapters = extract_epub_chapters(temp_epub_path)

        if not chapters:
            print("No chapters to process after extraction.")
            return {
                "words": [], # Assuming these aren't used/needed for the filtering logic
                "phrases": [], # Assuming these aren't used/needed for the filtering logic
                "sections": [],
                "replacements": [], # This might be redundant if replacement is in "sections"
                "message": "No suitable chapters found in the EPUB."
            }

        all_flagged = []
        flagged_words = [] # /*/ Array to track total flagged words and amounts

        # Define a set of swear words to check against
        SWEAR_WORDS = {'damn', 'damned', 'damning', 'hell', 'fuck', 'fucking', 'fucked', 'fucks', 'shit', 'shitting', 'shitted', 'shits', 'ass', 'asses', 'asshole', 'bitch', 'cock', 'penus', 'motherfuck', 'motherfucker', 'motherfucking', 'motherfuckers'}  # Replace with actual swear words

        # Initialize a dictionary to track total counts of swear words across the book
        
        book_total_char_count = 0
        book_total_chapter_count = 0
        book_swear_word_count = {}
        book_flagged_chapter_count = 0
        book_flagged_content_char_count = 0
        book_flagged_chapter_titles =[]
        for i, chapter in enumerate(chapters):
            book_total_chapter_count += 1
            print(f"Processing chapter {i + 1}/{len(chapters)} ({chapter.get('file', 'Unknown File')})...")
            flagged = send_chapter_to_gemini(chapter["text"])

            book_total_char_count += len(chapter['text'])
            # Count swear words in the chapter
            word_count = {}
            for word in chapter["text"].split():
                cleaned_word = re.sub(r'\W+', '', word).lower()  # Remove punctuation and convert to lowercase
                if cleaned_word in SWEAR_WORDS:
                    word_count[cleaned_word] = word_count.get(cleaned_word, 0) + 1

            # Add chapter counts to the book total
            for word, count in word_count.items():
                book_swear_word_count[word] = book_swear_word_count.get(word, 0) + count
                

            if flagged:
                print(f"  → Flagged {len(flagged)} section(s).")
                book_flagged_chapter_titles.append(flagged[0].get("chapter", "Unknown Chapter"))
                all_flagged.extend(flagged)
                book_flagged_content_char_count += sum(len(section["text"]) for section in flagged)
                book_flagged_chapter_count += 1
            else:
                print("  → No sections flagged.")

        # After processing all chapters, add the book total counts to the flagged_words array
        total_swear_count = 0
        for word, count in book_swear_word_count.items():
            flagged_words.append({"word": word, "amount": count})
            book_flagged_content_char_count += len(word) * count
            total_swear_count += count
        
       
        book_percent_filtered = round((book_flagged_content_char_count / book_total_char_count) * 100, 1) if book_total_char_count > 0 else 0
        # Apply word limits to start/end phrases if needed
        return {
            "totalBookCharacters": book_total_char_count,
            "totalBookChapters": book_total_chapter_count,
            "totalFilteredCharacters":book_flagged_content_char_count,
            "percentageFiltered": book_percent_filtered,
            "affectedChapterCount": book_flagged_chapter_count,
            "affectedChapterNames": book_flagged_chapter_titles,
            "swearWordsCount": total_swear_count,
            #"flaggedWords: flagged_words, UNCOMMENT if we want to pass back the specific words and counts
            #"flaggedSections": all_flagged, UNCOMMENT if we want to pass back the flagged sections
        }

    finally:
        # Clean up the temporary file
        if os.path.exists(temp_epub_path):
            try:
                os.remove(temp_epub_path)
                print(f"Cleaned up temporary file: {temp_epub_path}")
            except OSError as e:
                print(f"Error removing temporary file {temp_epub_path}: {e}")


# === HTTP Cloud Function Entry Point ===
@functions_framework.http
def epub_report(request):
    """HTTP Cloud Function to filter EPUB content using Gemini."""
    from flask import make_response, jsonify # Import here to ensure availability

    # Ensure Gemini API is initialized
    if not genai_initialized:
        print("Received request, but Gemini API initialization failed.")
        response = make_response(jsonify({"error": "Service backend initialization failed."}))
        response.status_code = 500
        response.headers.set('Access-Control-Allow-Origin', '*') # Be more specific in production
        return response

    # Handle CORS preflight request (OPTIONS method)
    if request.method == 'OPTIONS':
        print("Handling CORS preflight request.")
        response = make_response()
        response.headers.set('Access-Control-Allow-Origin', '*') # Be more specific in production
        response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
        # Allow Content-Type, especially for binary data uploads
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.set('Access-Control-Max-Age', '3600') # Cache preflight response for 1 hour
        return response

    # Handle POST request - expecting file data
    if request.method == 'POST':
        print("Received POST request.")
        try:
            # Get the raw binary data from the request body
            # This assumes the client sends the ArrayBuffer directly as the request body
            epub_data = request.data # type: bytes

            if not epub_data:
                print("Error: No file data received in request body.")
                response = make_response(jsonify({"error": "No EPUB file data received. Please upload the file directly."}))
                response.status_code = 400 # Bad Request
                response.headers.set('Access-Control-Allow-Origin', '*') # Be more specific in production
                return response

            print(f"Received {len(epub_data)} bytes of EPUB data.")

            # Process the uploaded EPUB data
            result = process_epub_from_bytes(epub_data)

            # Check for errors returned by the processing function
            if "error" in result:
                 print(f"Error during processing: {result['error']}")
                 response = make_response(jsonify(result)) # Return the error dictionary
                 response.status_code = 500 # Internal Server Error
                 response.headers.set('Access-Control-Allow-Origin', '*') # Be more specific in production
                 return response


            # Success response
            response = make_response(jsonify(result))
            response.headers.set('Content-Type', 'application/json')
            response.headers.set('Access-Control-Allow-Origin', '*') # Be more specific in production

            print("Request processed successfully.")
            return response

        except Exception as e:
            print(f"An unhandled error occurred during request processing: {e}")
            response = make_response(jsonify({"error": f"Internal Server Error: {e}"}))
            response.status_code = 500
            response.headers.set('Access-Control-Allow-Origin', '*') # Be more specific in production
            return response

    else:
        # Handle other HTTP methods
        print(f"Received unsupported method: {request.method}")
        response = make_response(jsonify({"error": f"Method {request.method} not allowed"}))
        response.status_code = 405 # Method Not Allowed
        response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS') # Indicate allowed methods
        response.headers.set('Access-Control-Allow-Origin', '*') # Be more specific in production
        return response