import os
import json
import re
import zipfile
import bs4
from typing import List, Dict
# Removed google.cloud.aiplatform_v1 and google.oauth2.service_account
import google.generativeai as genai # New import

# === CONFIGURATION === gemini-2.0-flash
MODEL = "gemini-2.5-flash-preview-04-17" # Model name is the same  
EPUB_PATH = "Fourth-Wing.epub"

# Use environment variable for API key - Recommended for security
GEMINI_API_KEY = 

# If you absolutely must, you can uncomment the line below and paste your key,
# but using environment variables is safer, especially for production.
# GEMINI_API_KEY = "YOUR_ACTUAL_GEMINI_API_KEY" # Replace with your key if not using env var

# === Setup Gemini API ===
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable not set. Please set it with your Gemini API key.")

try:
    genai.configure(api_key=GEMINI_API_KEY)
    # Instantiate the model
    model = genai.GenerativeModel(model_name=MODEL)
    print(f"Successfully initialized Gemini model: {MODEL}")
except Exception as e:
    print(f"Error initializing Gemini model {MODEL}: {e}")
    print("Please ensure the model name is correct and your API key is valid.")
    exit(1)


# === Parse EPUB file into chapters ===
# This function is independent of the AI backend, so it remains unchanged
def extract_epub_chapters2(epub_path: str) -> List[Dict]:
    chapters = []
    with zipfile.ZipFile(epub_path, 'r') as zip_ref:
        for file_name in zip_ref.namelist():
            if file_name.endswith(('.xhtml', '.html')) and 'toc' not in file_name.lower():
                with zip_ref.open(file_name) as f:
                    soup = bs4.BeautifulSoup(f.read(), "html.parser")
                    text = soup.get_text(separator=' ', strip=True)
                    cleaned_text = re.sub(r'\s+', ' ', text)
                    if len(cleaned_text) > 200:
                        chapters.append({
                            "file": file_name,
                            "text": cleaned_text
                        })
                    print(f"Number of chapters: {len(chapters)}")
                    for chapter in chapters:
                        print(f"Chapter file: {chapter['file']}, Text length: {len(chapter['text'])}")
                    return chapters

def extract_epub_chapters(epub_path: str) -> List[Dict]:
    """Extracts text content from EPUB chapters."""
    chapters = []
    try:
        with zipfile.ZipFile(epub_path, 'r') as zip_ref:
            for file_name in zip_ref.namelist():
                # Check for standard EPUB chapter files and avoid table of contents
                if file_name.endswith(('.xhtml', '.html')) and 'toc' not in file_name.lower() and not file_name.startswith('__MACOSX'):
                    try:
                        with zip_ref.open(file_name, 'r') as f: # 'r' or 'rb' works, reading is bytes
                            content_bytes = f.read() # Read raw bytes from the zip file member

                            # --- THIS IS THE KEY FIX ---
                            # Decode bytes to string, explicitly handling errors here
                            try:
                                # Use utf-8 decoding, ignoring characters that can't be decoded
                                content_str = content_bytes.decode("utf-8", errors='ignore')
                            except Exception as decode_error:
                                print(f"  → Error decoding content from {file_name}: {decode_error}. Skipping file.")
                                continue # Move to the next file
                            # --- END OF FIX ---

                            # Now use the decoded string content with BeautifulSoup
                            # The 'errors' argument is NOT passed here
                            soup = bs4.BeautifulSoup(content_str, "html.parser")

                            text = soup.get_text(separator=' ', strip=True)
                            # Clean up multiple spaces and newlines
                            cleaned_text = re.sub(r'\s+', ' ', text).strip()
                            # Only include chapters with significant content
                            if len(cleaned_text) > 200:
                                chapters.append({
                                    "file": file_name,
                                    "text": cleaned_text
                                })
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
# The prompt format using roles and parts is compatible with google-generativeai
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
                    chapter": "Chapter title or number",
                    "text": "entire text of the flagged section",
                    "summary": "short summary of the flagged section",
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
#=== Send a single chapter to Gemini ===
def send_chapter_to_gemini(chapter_text: str) -> List[Dict]:
    messages = build_prompt(chapter_text)
    try:
    # Use model.generate_content instead of client.predict
        response = model.generate_content(
            messages,
            generation_config={"temperature": 0.3}, # parameters maps to generation_config
            # Optional: Add safety settings if needed
            # safety_settings={'HARM_CATEGORY_SEXUALLY_EXPLICIT': 'BLOCK_NONE'} # Use with caution!
        )
            # Check for potential issues with the response
        if not response.candidates:
            print("  → Gemini returned no candidates.")
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                print(f"  → Request blocked due to: {response.prompt_feedback.block_reason}")
            elif response.prompt_feedback and response.prompt_feedback.safety_ratings:
                print(f"  → Request blocked due to safety settings: {response.prompt_feedback.safety_ratings}")
            else:
                print("  → Unknown reason for no candidates.")
            return []

        # The output is in response.text for text-only responses
        if not hasattr(response, 'text') or not response.text:
            print("  → Gemini returned empty text content.")
            return []

        # Attempt to parse the JSON string from the response text
        try:
            # Look for the JSON block indicated by the prompt using ```json ... ```
            # This makes it more robust than just parsing the whole response as JSON
            json_match = re.search(r"```json\s*(.*?)\s*```", response.text, re.DOTALL)
            if json_match:
                json_string = json_match.group(1)
            else:
                # Fallback: try to parse the whole text if no code block markers are found
                json_string = response.text.strip()
                print(f"  → Warning: No JSON code block found. Attempting to parse full response text.")
                # Basic check to see if it *looks* like JSON
                if not json_string.startswith('{') or not json_string.endswith('}'):
                    print(f"  → Response text does not look like JSON: {json_string[:100]}...")
                    return []


            output = json.loads(json_string)

            # The prompt asks for a key named "sections", not "flagged_sections"
            return output.get("sections", [])

        except json.JSONDecodeError:
            print(f"  → Failed to parse JSON response from text: {response.text[:500]}...") # Print start of response text
            return []
        except Exception as e:
            print(f"  → An error occurred while processing Gemini response text: {e}")
            return []

    except Exception as e:
        print(f"Error calling Gemini API for chapter: {e}")
        return []
    
    #=== Run the full process ===
#This function remains unchanged as it uses the standard chapter and flagged_sections structures
def process_book(epub_path: str) -> Dict:
    chapters = extract_epub_chapters(epub_path)
   # print("Chapters:", chapters)
    if not chapters:
        print("No chapters to process. Exiting.")
        return {
        "words": [],
        "phrases": [],
        "sections": [],
        "replacements": []
        }
    all_flagged = []
    flagged_words = [] # /*/ Array to track total flagged words and amounts
    # Define a set of swear words to check against
    SWEAR_WORDS = {'damn', 'damned', 'damning', 'hell', 'fuck', 'fucking', 'fucked', 'fucks', 'shit', 'shitting', 'shitted', 'shits', 'ass', 'asses', 'asshole', 'bitch', 'cock', 'penus', 'motherfuck', 'motherfucker', 'motherfucking', 'motherfuckers'}  # Replace with actual swear words

    book_total_word_count = {}    # Initialize a dictionary to track total counts of swear words across the book

    for i, chapter in enumerate(chapters):
        print(f"Processing chapter {i + 1}/{len(chapters)} ({chapter.get('file', 'Unknown File')})...")
        flagged = send_chapter_to_gemini(chapter["text"])

        # Count swear words in the chapter
        word_count = {}
        for word in chapter["text"].split():
            cleaned_word = re.sub(r'\W+', '', word).lower()  # Remove punctuation and convert to lowercase
            if cleaned_word in SWEAR_WORDS:
                word_count[cleaned_word] = word_count.get(cleaned_word, 0) + 1

        # Add chapter counts to the book total
        for word, count in word_count.items():
            book_total_word_count[word] = book_total_word_count.get(word, 0) + count

        if flagged:
            print(f"  → Flagged {len(flagged)} section(s).")
            all_flagged.extend(flagged) # Assuming flagged is a list of section dicts
        else:
            print("  → No sections flagged.")

    for word, count in book_total_word_count.items():
        flagged_words.append({"word": word, "amount": count, "total": True})

    return {
        # These keys were in the original output structure but not generated by the AI prompt
        # Keeping them for compatibility with the expected output format
        "words": flagged_words,
        "phrases": [],
        "sections": all_flagged, # This is the list of flagged sections from the AI
        "replacements": []# This key was not used in the prompt, but included for completeness
}

# === Run the script ===
if __name__ == "__main__":
    print(f"Starting book processing for: {EPUB_PATH}")
    result = process_book(EPUB_PATH)
    # Update the truncation logic for the 'end' value to keep the last 7 words
    if result is not None:

        output_filename = "filtered_output.json"
        try:
            with open(output_filename, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2)
            print(f"✅ Done. Output saved to '{output_filename}'")
        except IOError as e:
            print(f"Error saving output file {output_filename}: {e}")

