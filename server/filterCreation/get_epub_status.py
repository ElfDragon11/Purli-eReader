import functions_framework
from flask import jsonify, make_response
import firebase_admin
from firebase_admin import credentials, firestore

# --- Firebase Initialization ---
if not firebase_admin._apps:
    try:
        firebase_admin.initialize_app()
        print("Firebase Admin SDK initialized successfully for get_epub_status.")
    except Exception as e:
        print(f"Error initializing Firebase Admin SDK for get_epub_status: {e}")

db = firestore.client()

@functions_framework.http
def get_epub_status(request):
    """HTTP Cloud Function to get the status of EPUB processing."""
    
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    headers = {
        'Access-Control-Allow-Origin': '*'
    }

    job_id = request.args.get('job_id')

    if not job_id:
        error_response = jsonify({"error": "job_id query parameter is required."})
        return make_response(error_response, 400, headers)

    if not firebase_admin._apps: 
        error_response = jsonify({"error": "Service backend (Firestore) not initialized."})
        return make_response(error_response, 500, headers)

    try:
        status_ref = db.collection('epub_process_status').document(job_id)
        status_doc = status_ref.get()

        if not status_doc.exists:
            error_response = jsonify({"error": "Processing status not found for the given job_id.", "job_id": job_id, "status": "not_found"})
            return make_response(error_response, 404, headers)
        
        status_data = status_doc.to_dict()
        status_data['job_id'] = job_id 
        
        return make_response(jsonify(status_data), 200, headers)

    except Exception as e:
        print(f"Error fetching status for job_id {job_id}: {e}")
        error_response = jsonify({"error": f"An internal error occurred while fetching status: {str(e)}", "job_id": job_id})
        return make_response(error_response, 500, headers)

