const express = require('express');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const dotenv = require('dotenv').config();
const session = require('express-session');

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// Session Middleware Setup
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

const MODEL_NAME = "gemini-pro";
const API_KEY = process.env.API_KEY;

// Enhanced Doctors Array with More Details
const DOCTORS = [
    {
        id: 1,
        name: "Dr. Jane Doe",
        specialty: "Family Medicine",
        qualifications: "MD, Board Certified in Family Practice",
        experience: "15 years",
        availability: [
            { day: "Monday", slots: ["9:00 AM", "10:30 AM", "2:00 PM", "4:00 PM"] },
            { day: "Wednesday", slots: ["9:00 AM", "11:00 AM", "3:00 PM"] },
            { day: "Friday", slots: ["10:00 AM", "1:30 PM", "4:30 PM"] }
        ],
        location: "Main Clinic - Downtown",
        contactNumber: "(555) 123-4567"
    },
    {
        id: 2,
        name: "Dr. John Smith",
        specialty: "Cardiology",
        qualifications: "MD, FACC, Interventional Cardiology",
        experience: "20 years", 
        availability: [
            { day: "Tuesday", slots: ["8:00 AM", "11:00 AM", "1:30 PM"] },
            { day: "Thursday", slots: ["9:00 AM", "2:00 PM", "4:00 PM"] },
            { day: "Saturday", slots: ["10:00 AM", "12:00 PM"] }
        ],
        location: "Heart Center - Westside",
        contactNumber: "(555) 987-6543"
    },
    {
        id: 3,
        name: "Dr. Mary Johnson",
        specialty: "Pediatrics",
        qualifications: "MD, Board Certified Pediatrician",
        experience: "12 years",
        availability: [
            { day: "Monday", slots: ["9:30 AM", "11:00 AM", "2:30 PM"] },
            { day: "Tuesday", slots: ["10:00 AM", "1:30 PM", "3:30 PM"] },
            { day: "Thursday", slots: ["9:00 AM", "2:00 PM", "4:30 PM"] }
        ],
        location: "Children's Clinic - Eastside",
        contactNumber: "(555) 456-7890"
    }
];

// Appointments Tracking
const APPOINTMENTS = [];

// Function to run the chat
async function runChat(userInput, session) {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const generationConfig = {
        temperature: 0.9,
        topK: 1,
        topP: 1,
        maxOutputTokens: 1000,
    };

    const safetySettings = [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
    ];

    // Initialize session if not exists
    if (!session.userInfo) {
        session.userInfo = {
            name: null,
            email: null,
            pendingAppointment: null,
            infoCapture: {
                nameAsked: false,
                emailAsked: false,
                appointmentStep: null
            }
        };
    }

    // If user info is fully captured, proceed with functionality
    if (session.userInfo.name && session.userInfo.email) {
        const lowerInput = userInput.toLowerCase();

        // Doctors List Request
        if (lowerInput.includes("available doctors") || lowerInput.includes("list of doctors")) {
            return DOCTORS.map(doc => 
                `${doc.name} - ${doc.specialty}\n` +
                `Qualifications: ${doc.qualifications}\n` +
                `Experience: ${doc.experience}\n` +
                `Location: ${doc.location}\n` +
                `Available Days: ${doc.availability.map(a => a.day).join(", ")}\n` +
                `Contact: ${doc.contactNumber}`
            ).join("\n\n");
        }

        // Check if user selected a doctor
        const doctorMatch = DOCTORS.find(doc =>
            lowerInput.includes(doc.name.toLowerCase()) ||
            lowerInput.includes(doc.specialty.toLowerCase())
        );
        if (doctorMatch && session.userInfo.infoCapture.appointmentStep === 'selectDoctor') {
            session.userInfo.pendingAppointment = { doctor: doctorMatch };
            session.userInfo.infoCapture.appointmentStep = 'selectDay';
            return `You've selected Dr. ${doctorMatch.name}. Please choose a day from their availability:\n` +
                   doctorMatch.availability.map(a => a.day).join(", ");
        }

        // Appointment Scheduling Logic
        if (session.userInfo.infoCapture.appointmentStep) {
            switch (session.userInfo.infoCapture.appointmentStep) {
                case 'selectDay':
                    const selectedDay = session.userInfo.pendingAppointment.doctor.availability.find(
                        a => lowerInput.includes(a.day.toLowerCase())
                    );
                    if (selectedDay) {
                        session.userInfo.pendingAppointment.day = selectedDay.day;
                        session.userInfo.infoCapture.appointmentStep = 'selectTime';
                        return `Available time slots for ${selectedDay.day}:\n` +
                               selectedDay.slots.join(", ") +
                               "\n\nPlease select a time slot.";
                    } else {
                        return "Please select a valid day from the options provided.";
                    }

                case 'selectTime':
                    const selectedSlot = session.userInfo.pendingAppointment.doctor.availability
                        .find(a => a.day === session.userInfo.pendingAppointment.day)
                        .slots.find(slot => lowerInput.includes(slot.toLowerCase()));
                    
                    if (selectedSlot) {
                        const newAppointment = {
                            id: APPOINTMENTS.length + 1,
                            patient: {
                                name: session.userInfo.name,
                                email: session.userInfo.email
                            },
                            doctor: session.userInfo.pendingAppointment.doctor,
                            day: session.userInfo.pendingAppointment.day,
                            time: selectedSlot
                        };
                        APPOINTMENTS.push(newAppointment);

                        // Reset appointment tracking
                        session.userInfo.pendingAppointment = null;
                        session.userInfo.infoCapture.appointmentStep = null;

                        return `Appointment Confirmed!\n\n` +
                               `Details:\n` +
                               `Patient: ${newAppointment.patient.name}\n` +
                               `Doctor: ${newAppointment.doctor.name}\n` +
                               `Specialty: ${newAppointment.doctor.specialty}\n` +
                               `Date: ${newAppointment.day}\n` +
                               `Time: ${newAppointment.time}\n` +
                               `Location: ${newAppointment.doctor.location}\n\n` +
                               `A confirmation will be sent to ${newAppointment.patient.email}`;
                    } else {
                        return "Please select a valid time slot from the options provided.";
                    }

                default:
                    return "Something went wrong. Please try again.";
            }
        }

        // Start Appointment Scheduling
        if (lowerInput.includes("schedule") || lowerInput.includes("book") || lowerInput.includes("appointment")) {
            session.userInfo.infoCapture.appointmentStep = 'selectDoctor';
            return `Let's schedule your appointment. Please choose a doctor by name or specialty:\n\n` +
                   DOCTORS.map(doc => `- ${doc.name} (${doc.specialty})`).join("\n");
        }

        // View Scheduled Appointments
        if (lowerInput.includes("my appointments") || lowerInput.includes("appointment history")) {
            const patientAppointments = APPOINTMENTS.filter(
                apt => apt.patient.email === session.userInfo.email
            );

            if (patientAppointments.length > 0) {
                return "Your Scheduled Appointments:\n" + 
                       patientAppointments.map(apt => 
                           `Appointment #${apt.id}\n` +
                           `Doctor: ${apt.doctor.name} (${apt.doctor.specialty})\n` +
                           `Date: ${apt.day}\n` +
                           `Time: ${apt.time}\n` +
                           `Location: ${apt.doctor.location}\n`
                       ).join("\n\n");
            } else {
                return "You have no scheduled appointments.";
            }
        }

        // Default Chat Handling with Generative AI
        let chat = model.startChat({
            generationConfig,
            safetySettings,
            history: [
                {
                    role: "user",
                    parts: [{ text: `You are Sam, a friendly assistant who works for VitalPoint. The user's name is ${session.userInfo.name} and their email is ${session.userInfo.email}. Your job is to help the user schedule doctor appointments and manage patient information.` }],
                },
                {
                    role: "model",
                    parts: [{ text: `Hello ${session.userInfo.name}! I'm ready to help you with your VitalPoint appointment needs. Would you like to see available doctors, schedule an appointment, or view your existing appointments?` }],
                }
            ],
        });

        const result = await chat.sendMessage(userInput);
        return result.response.text();
    }

    // Name and Email Capture
    if (!session.userInfo.name) {
        if (!session.userInfo.infoCapture.nameAsked) {
            session.userInfo.infoCapture.nameAsked = true;
            return "Hello! Welcome to VitalPoint. I'll need your full name to get started.";
        } else {
            session.userInfo.name = userInput.trim();
            return `Thank you, ${session.userInfo.name}. Now, could you please provide your email address?`;
        }
    }

    if (!session.userInfo.email) {
        if (!session.userInfo.infoCapture.emailAsked) {
            session.userInfo.infoCapture.emailAsked = true;
            return "I'll need your email address to complete your profile.";
        } else {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emailRegex.test(userInput.trim())) {
                session.userInfo.email = userInput.trim();
                return `Great! I've captured your information:\nName: ${session.userInfo.name}\nEmail: ${session.userInfo.email}\n\n` +
                       `Welcome to VitalPoint! Would you like to:\n` +
                       `1. View available doctors\n` +
                       `2. Schedule an appointment\n` +
                       `3. View your appointments`;
            } else {
                return "That doesn't look like a valid email address. Please enter a valid email.";
            }
        }
    }

    return "Something went wrong. Please try again.";
}


// Rest of the code remains the same (app routes and server setup)

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/loader.gif', (req, res) => {
    res.sendFile(__dirname + '/loader.gif');
});

app.post('/chat', async (req, res) => {
    try {
        const userInput = req.body?.userInput;
        if (!userInput) {
            return res.status(400).json({ error: 'Invalid request body' });
        }
        const response = await runChat(userInput, req.session);
        res.json({ response });
    } catch (error) {
        console.error('Error in chat endpoint:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});