from flask import Flask, request, session, jsonify, render_template
import spacy  # Importing spaCy for tokenization
import re  # Importing regular expressions

app = Flask(__name__)
app.secret_key = 'your-secret-key'  # Secret key for session management
app.config['SESSION_TYPE'] = 'filesystem'  # Optional, for secure session storage

# Sample doctor data
DOCTORS = [
    {
        "id": 1,
        "name": "Dr. Jane Doe",
        "specialty": "Family Medicine",
        "qualifications": "MD, Board Certified in Family Practice",
        "experience": "15 years",
        "availability": [
            {"day": "Monday", "slots": ["9:00 AM", "10:30 AM", "2:00 PM", "4:00 PM"]},
            {"day": "Wednesday", "slots": ["9:00 AM", "11:00 AM", "3:00 PM"]},
            {"day": "Friday", "slots": ["10:00 AM", "1:30 PM", "4:30 PM"]},
        ],
        "location": "Main Clinic - Downtown",
        "contactNumber": "(555) 123-4567"
    },
    {
        "id": 2,
        "name": "Dr. John Smith",
        "specialty": "Cardiology",
        "qualifications": "MD, FACC, Interventional Cardiology",
        "experience": "20 years",
        "availability": [
            {"day": "Tuesday", "slots": ["8:00 AM", "11:00 AM", "1:30 PM"]},
            {"day": "Thursday", "slots": ["9:00 AM", "2:00 PM", "4:00 PM"]},
            {"day": "Saturday", "slots": ["10:00 AM", "12:00 PM"]},
        ],
        "location": "Heart Center - Westside",
        "contactNumber": "(555) 987-6543"
    },
    {
        "id": 3,
        "name": "Dr. Mary Johnson",
        "specialty": "Pediatrics",
        "qualifications": "MD, Board Certified Pediatrician",
        "experience": "12 years",
        "availability": [
            {"day": "Monday", "slots": ["9:30 AM", "11:00 AM", "2:30 PM"]},
            {"day": "Tuesday", "slots": ["10:00 AM", "1:30 PM", "3:30 PM"]},
            {"day": "Thursday", "slots": ["9:00 AM", "2:00 PM", "4:30 PM"]},
        ],
        "location": "Children's Clinic - Eastside",
        "contactNumber": "(555) 456-7890"
    }
]

# Function to tokenize and clean user input
def clean_input(user_input):
    nlp = spacy.load('en_core_web_sm')
    doc = nlp(user_input.lower())  # Convert to lowercase and tokenize
    tokens = [token.lemma_ for token in doc if not token.is_stop and not token.is_punct]
    return tokens

# Initialize session if not exists
def initialize_session():
    if 'userInfo' not in session:
        session['userInfo'] = {
            'name': None,
            'email': None,
            'pendingAppointment': None,
            'infoCapture': {
                'nameAsked': False,
                'emailAsked': False,
                'appointmentStep': None
            }
        }

# Handle user input and return responses
def handle_user_input(user_input):
    # Initialize session
    initialize_session()
    
    tokens = clean_input(user_input)
    
    # Check if user information is already captured
    if session['userInfo']['name'] and session['userInfo']['email']:
        lower_input = " ".join(tokens)

        # Handle "available doctors" request
        if "available doctors" in lower_input or "list of doctors" in lower_input:
            return jsonify(DOCTORS)
        
        # Check if user selected a doctor
        doctor_match = next((doc for doc in DOCTORS if doc['name'].lower() in lower_input or doc['specialty'].lower() in lower_input), None)
        if doctor_match and session['userInfo']['infoCapture']['appointmentStep'] == 'selectDoctor':
            session['userInfo']['pendingAppointment'] = {'doctor': doctor_match}
            session['userInfo']['infoCapture']['appointmentStep'] = 'selectDay'
            return jsonify({"message": f"You've selected Dr. {doctor_match['name']}. Please choose a day from their availability."})
        
        # Appointment scheduling logic
        if session['userInfo']['infoCapture']['appointmentStep'] == 'selectDay':
            selected_day = next((day for day in doctor_match['availability'] if day['day'].lower() in lower_input), None)
            if selected_day:
                session['userInfo']['pendingAppointment']['day'] = selected_day['day']
                session['userInfo']['infoCapture']['appointmentStep'] = 'selectTime'
                return jsonify({"message": f"Available time slots for {selected_day['day']}:", "slots": selected_day['slots']})
            else:
                return jsonify({"message": "Please select a valid day from the options provided."})
        
        if session['userInfo']['infoCapture']['appointmentStep'] == 'selectTime':
            selected_slot = next((slot for slot in doctor_match['availability'] if slot['day'] == session['userInfo']['pendingAppointment']['day'] for slot in slot['slots'] if slot.lower() in lower_input), None)
            if selected_slot:
                new_appointment = {
                    "id": len(APPOINTMENTS) + 1,
                    "patient": {
                        "name": session['userInfo']['name'],
                        "email": session['userInfo']['email']
                    },
                    "doctor": session['userInfo']['pendingAppointment']['doctor'],
                    "day": session['userInfo']['pendingAppointment']['day'],
                    "time": selected_slot
                }
                APPOINTMENTS.append(new_appointment)
                session['userInfo']['pendingAppointment'] = None
                session['userInfo']['infoCapture']['appointmentStep'] = None
                return jsonify({"message": f"Appointment Confirmed! Details:\nPatient: {new_appointment['patient']['name']}\nDoctor: {new_appointment['doctor']['name']}\nSpecialty: {new_appointment['doctor']['specialty']}\nDate: {new_appointment['day']}\nTime: {new_appointment['time']}"})
            else:
                return jsonify({"message": "Please select a valid time slot from the options provided."})

        # Handle appointment scheduling initiation
        if any(keyword in lower_input for keyword in ["schedule", "book", "appointment"]):
            session['userInfo']['infoCapture']['appointmentStep'] = 'selectDoctor'
            return jsonify({"message": "Let's schedule your appointment. Please choose a doctor by name or specialty."})

        # Handle viewing scheduled appointments
        if "my appointments" in lower_input:
            patient_appointments = [apt for apt in APPOINTMENTS if apt['patient']['email'] == session['userInfo']['email']]
            if patient_appointments:
                return jsonify({"message": "Your Scheduled Appointments:", "appointments": patient_appointments})
            else:
                return jsonify({"message": "You have no scheduled appointments."})
        
        return jsonify({"message": "I'm here to assist you. What would you like to do?"})

    # Handle name and email collection
    if not session['userInfo']['name']:
        if not session['userInfo']['infoCapture']['nameAsked']:
            session['userInfo']['infoCapture']['nameAsked'] = True
            return jsonify({"message": "Hello! Welcome. I'll need your full name to get started."})
        else:
            session['userInfo']['name'] = " ".join(tokens)
            return jsonify({"message": f"Thank you, {session['userInfo']['name']}. Now, could you please provide your email address?"})
    
    if not session['userInfo']['email']:
        if not session['userInfo']['infoCapture']['emailAsked']:
            session['userInfo']['infoCapture']['emailAsked'] = True
            return jsonify({"message": "I'll need your email address to complete your profile."})
        else:
            email = " ".join(tokens)
            email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
            if re.match(email_regex, email):
                session['userInfo']['email'] = email
                return jsonify({"message": f"Great! I've captured your information:\nName: {session['userInfo']['name']}\nEmail: {session['userInfo']['email']}\nWhat would you like to do next?"})
            else:
                return jsonify({"message": "That doesn't look like a valid email address. Please enter a valid email."})
    
    return jsonify({"message": "Something went wrong. Please try again."})

# Appointments array to store appointments
APPOINTMENTS = []

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    user_input = request.json.get('userInput')
    if not user_input:
        return jsonify({"error": "Invalid request body"}), 400
    response = handle_user_input(user_input)
    return response

if __name__ == '__main__':
    app.run(debug=True)
