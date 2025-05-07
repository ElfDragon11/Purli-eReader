import functions_framework # <-- New import

import requests # Still need requests to download the EPUB URL
import json
import re
import zipfile
import bs4
from typing import List, Dict
import google.generativeai as genai

# === CONFIGURATION ===
MODEL = "gemini-2.5-flash-preview-04-17"
# EPUB_PATH is not needed here as we download it dynamically
# GEMINI_API_KEY will come from environment variable in Cloud Run/Cloud Functions

# --- Global/Initialization ---
# These will run once per instance cold start
GEMINI_API_KEY = "AIzaSyAyvm1rNE2cK2GBdA1K_8OFWMl1MCiQN10"
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
            return output.get("sections", [])

        except json.JSONDecodeError:
            print(f"  → Failed to parse JSON response from text: {response.text[:500]}...")
            return []
        except Exception as e:
            print(f"  → An error occurred while processing Gemini response text: {e}")
            return []

    except Exception as e:
        print(f"Error calling Gemini API for chapter: {e}")
        return []


# === Run the full process ===
# Adapt the process_book function to take a URL and return data
def process_epub_from_url(epub_url: str) -> Dict:
    """Downloads EPUB, processes it, and returns results."""
    if not genai_initialized:
        print("Gemini API not initialized, cannot process book.")
        return {"error": "Gemini API not initialized"}

    print(f"Downloading EPUB from: {epub_url}")
    try:
        response = requests.get(epub_url, stream=True)
        response.raise_for_status()

        epub_path = "/tmp/downloaded_book.epub"
        with open(epub_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        print(f"Successfully downloaded EPUB to {epub_path}")

    except requests.exceptions.RequestException as e:
        print(f"Error downloading EPUB from {epub_url}: {e}")
        return {"error": f"Failed to download EPUB: {e}"}
    except Exception as e:
        print(f"An unexpected error occurred during download: {e}")
        return {"error": f"An unexpected error occurred during download: {e}"}

    chapters = extract_epub_chapters(epub_path)

    try:
        print(f"Cleaned up temporary file: {epub_path}")
    except OSError as e:
        print(f"Error removing temporary file {epub_path}: {e}")


    if not chapters:
        print("No chapters to process after extraction.")
        return {
            "words": [],
            "phrases": [],
            "sections": [],
            "replacements": [],
            "message": "No suitable chapters found in the EPUB."
        }

    all_flagged = []
    for i, chapter in enumerate(chapters):
        print(f"Processing chapter {i + 1}/{len(chapters)} ({chapter.get('file', 'Unknown File')})...")
        flagged = send_chapter_to_gemini(chapter["text"])
        if flagged:
            print(f"  → Flagged {len(flagged)} section(s).")
            all_flagged.extend(flagged)
        else:
            print("  → No sections flagged.")

    for section in all_flagged:
         if "start" in section and section["start"]:
              section["start"] = " ".join(section["start"].split()[:7])
         if "end" in section and section["end"]:
             section["end"] = " ".join(section["end"].split()[-7:])


    return {
        "words": [],
        "phrases": [],
        "sections": all_flagged,
        "replacements": []
    }


# === HTTP Cloud Function Entry Point ===
# This function will be triggered by incoming HTTP requests
@functions_framework.http # <-- Use the decorator
def filter_epub_handler(request): # <-- Define the main handler function
    """HTTP Cloud Function to filter EPUB content using Gemini."""
    # Ensure Gemini API is initialized
    if not genai_initialized:
        print("Received request, but Gemini API initialization failed.")
        # Use make_response from functions_framework (which is Flask's make_response)
        from flask import make_response
        response = make_response(jsonify({"error": "Service backend initialization failed."}))
        response.status_code = 500
        # Handle CORS for error response if necessary, though Flask-CORS might cover it
        return response

    # Handle CORS preflight request (OPTIONS method)
    if request.method == 'OPTIONS':
        # Allow CORS preflight requests
        from flask import make_response
        response = make_response()
        response.headers.set('Access-Control-Allow-Origin', '*') # Be more specific in production
        response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.set('Access-Control-Max-Age', '3600')
        return response

    # Handle POST request
    if request.method == 'POST':
        try:
            request_json = request.get_json(silent=True)
            # Use request_json directly, as we expect a JSON body
            epub_url = request_json.get("epub_url") if request_json else None

            if not epub_url:
                # Use make_response for JSON error with specific status code
                from flask import make_response, jsonify
                response = make_response(jsonify({"error": "Missing 'epub_url' in request body"}))
                response.status_code = 400
                # Add CORS headers if necessary
                response.headers.set('Access-Control-Allow-Origin', '*') # Be more specific in production
                return response

            print(f"Received request to filter EPUB from: {epub_url}")

            # Call your main processing logic
            result = process_epub_from_url(epub_url)

            # Check for errors returned by the processing function
            if "error" in result:
                 from flask import make_response, jsonify
                 response = make_response(jsonify(result)) # Return the error dictionary
                 response.status_code = 500
                 response.headers.set('Access-Control-Allow-Origin', '*') # Be more specific in production
                 return response


            # Use make_response for the successful JSON response
            from flask import make_response, jsonify
            response = make_response(jsonify(result))
            response.headers.set('Content-Type', 'application/json')
            # Add CORS headers for the response
            response.headers.set('Access-Control-Allow-Origin', '*') # Be more specific in production

            print("Request processed successfully.")
            return response

        except Exception as e:
            print(f"An unhandled error occurred during request processing: {e}")
            from flask import make_response, jsonify
            response = make_response(jsonify({"error": f"Internal Server Error: {e}"}))
            response.status_code = 500
            response.headers.set('Access-Control-Allow-Origin', '*') # Be more specific in production
            return response

    else:
        # Handle other HTTP methods if necessary, otherwise return method not allowed
        from flask import make_response, jsonify
        response = make_response(jsonify({"error": f"Method {request.method} not allowed"}))
        response.status_code = 405 # Method Not Allowed
        response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS') # Indicate allowed methods
        response.headers.set('Access-Control-Allow-Origin', '*') # Be more specific in production
        return response


# Note: The if __name__ == "__main__": block is typically removed
# or modified for functions_framework deployments, as the framework handles execution.
# If you keep it, it will only run when you execute the script directly (e.g., python main.py)
# and might not be active in the Cloud Run/Functions environment.
# Remove or comment out the original __main__ block that processed a local file.