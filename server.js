const express = require('express');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const dotenv = require('dotenv').config();
const session = require('express-session');
const natural = require('natural');
const { PorterStemmer } = natural;


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

// doctors
const DOCTORS = [
    {
        id: 1,
        name: "Luwi Otanes",
        specialty: "Family Medicine",
        qualifications: "MD, Board Certified in Family Practice",
        experience: "15 years",
        availability: [
            { day: "Monday", slots: ["9:00 AM", "10:30 AM", "2:00 PM", "4:00 PM"] },
            { day: "Wednesday", slots: ["9:00 AM", "11:00 AM", "3:00 PM"] },
            { day: "Friday", slots: ["10:00 AM", "1:30 PM", "4:30 PM"] }
        ],
        location: "Estrella Hospital - Silang",
        contactNumber: "09664819348"
    },
    {
        id: 2,
        name: "Carl Armendi",
        specialty: "Cardiology",
        qualifications: "MD, FACC, Interventional Cardiology",
        experience: "20 years",
        availability: [
            { day: "Tuesday", slots: ["8:00 AM", "11:00 AM", "1:30 PM"] },
            { day: "Thursday", slots: ["9:00 AM", "2:00 PM", "4:00 PM"] },
            { day: "Saturday", slots: ["10:00 AM", "12:00 PM"] }
        ],
        location: "Naic Doctors Hospital",
        contactNumber: "09265828591"
    },
    {
        id: 3,
        name: "Justin Gutierrez",
        specialty: "Pediatrics",
        qualifications: "MD, Board Certified Pediatrician",
        experience: "12 years",
        availability: [
            { day: "Monday", slots: ["9:30 AM", "11:00 AM", "2:30 PM"] },
            { day: "Tuesday", slots: ["10:00 AM", "1:30 PM", "3:30 PM"] },
            { day: "Thursday", slots: ["9:00 AM", "2:00 PM", "4:30 PM"] }
        ],
        location: "Los Banos Doctors Hospital",
        contactNumber: "096618491944"
    }
];


// Function to tokenize user input
function tokenize(input) {
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(input.toLowerCase());
    const stemmedTokens = tokens.map(token => PorterStemmer.stem(token));
    return stemmedTokens;

}

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
            },
            appointments:[] // appointments on current session
        };
    }

    // If user info is fully captured, proceed with functionality
    if (session.userInfo.name && session.userInfo.email) {
        const tokens = tokenize(userInput.toLowerCase());

        console.log("Tokens received:", tokens);

        // Doctors List Request
         if (tokens.includes("avail") && tokens.includes("doctor") || tokens.includes("list") && tokens.includes("doctor")) {
            return DOCTORS.map(doc =>
                `Doctor: ${doc.name} - ${doc.specialty}<br>` +
                `Qualifications: ${doc.qualifications}<br>` +
                `Experience: ${doc.experience}<br>` +
                `Location: ${doc.location}<br>` +
                `Contact: ${doc.contactNumber}`
            ).join("<br><br>");
        }

        // Check if user selected a doctor ONLY when appointmentStep is selectDoctor
        let doctorMatch = null;
        if(session.userInfo.infoCapture.appointmentStep === 'selectDoctor'){
             doctorMatch = DOCTORS.find(doc => {
                 const fullName = doc.name.toLowerCase();
                 const specialty = doc.specialty.toLowerCase();
                return tokens.some(token => fullName.includes(PorterStemmer.stem(token)) || specialty.includes(PorterStemmer.stem(token)));
            });
        }

        console.log("Doctor match:", doctorMatch);

        if (doctorMatch && session.userInfo.infoCapture.appointmentStep === 'selectDoctor') {
            session.userInfo.pendingAppointment = { doctor: doctorMatch };
            session.userInfo.infoCapture.appointmentStep = 'selectDay';
            console.log("Doctor selected:", doctorMatch.name);
            return `You've selected Dr. ${doctorMatch.name}. Please choose a day from their availability:<br>` +
                   doctorMatch.availability.map(a => a.day).join(", ");
        }

        // Appointment Scheduling Logic
        if (session.userInfo.infoCapture.appointmentStep) {
            console.log("Appointment step:", session.userInfo.infoCapture.appointmentStep);

            switch (session.userInfo.infoCapture.appointmentStep) {
                case 'selectDay':
                    const selectedDay = session.userInfo.pendingAppointment.doctor.availability.find(
                        a => tokens.includes(PorterStemmer.stem(a.day.toLowerCase()))
                    );

                    console.log("Selected day:", selectedDay);

                    if (selectedDay) {
                        session.userInfo.pendingAppointment.day = selectedDay.day;
                        session.userInfo.infoCapture.appointmentStep = 'selectTime';
                        return `Available time slots for ${selectedDay.day}:<br>` +
                               selectedDay.slots.join(", ") +
                               "<br><br>Please select a time slot.";
                    } else {
                        return "Please select a valid day from the options provided.";
                    }

               case 'selectTime':
                    const selectedSlot = session.userInfo.pendingAppointment.doctor.availability
                        .find(a => a.day === session.userInfo.pendingAppointment.day)
                        .slots.find(slot => {
                            // Match the time slot directly (without stemming) against the user input
                            return userInput.toLowerCase().includes(slot.toLowerCase());
                        });


                    console.log("Selected slot:", selectedSlot);

                    if (selectedSlot) {
                        const newAppointment = {
                             id: session.userInfo.appointments.length + 1,
                            patient: {
                                name: session.userInfo.name,
                                email: session.userInfo.email
                            },
                            doctor: session.userInfo.pendingAppointment.doctor,
                            day: session.userInfo.pendingAppointment.day,
                            time: selectedSlot
                        };
                        // Store the new appointment in session
                        session.userInfo.appointments.push(newAppointment);


                        // Reset appointment tracking
                        session.userInfo.pendingAppointment = null;
                        session.userInfo.infoCapture.appointmentStep = null;

                        return `Appointment Confirmed!<br><br>` +
                               `Details:<br>` +
                               `Patient: ${newAppointment.patient.name}<br>` +
                               `Doctor: ${newAppointment.doctor.name}<br>` +
                               `Specialty: ${newAppointment.doctor.specialty}<br>` +
                               `Date: ${newAppointment.day}<br>` +
                               `Time: ${newAppointment.time}<br>` +
                               `Location: ${newAppointment.doctor.location}<br><br>` +
                               `A confirmation will be sent to ${newAppointment.patient.email}`;
                    } else {
                        return "Please select a valid time slot from the options provided.";
                    }

                default:
                    return "Something went wrong. Please try again.";
            }
        }


        // View Scheduled Appointments
        if (tokens.includes("my") && tokens.includes("appoint") && !session.userInfo.infoCapture.appointmentStep ) {
             if (session.userInfo.appointments && session.userInfo.appointments.length > 0) {
                 return "Your Scheduled Appointments:<br>" +
                        session.userInfo.appointments.map(apt =>
                             `Appointment #${apt.id}<br>` +
                             `Doctor: ${apt.doctor.name} (${apt.doctor.specialty})<br>` +
                             `Date: ${apt.day}<br>` +
                             `Time: ${apt.time}<br>` +
                             `Location: ${apt.doctor.location}<br>`
                         ).join("<br><br>");
             } else {
                 return "You have no scheduled appointments.";
             }
         }

        // Start Appointment Scheduling
        if (tokens.includes("schedul") || tokens.includes("book") || tokens.includes("appoint")) {
            session.userInfo.infoCapture.appointmentStep = 'selectDoctor';
            return `Let's schedule your appointment. Please choose a doctor by name or specialty:<br><br>` +
                   DOCTORS.map(doc => `- Dr. ${doc.name} (${doc.specialty})`).join("<br>");
        }


        // Default Chat Handling with Generative AI
        let chat = model.startChat({
            generationConfig,
            safetySettings,
            history: [
                {
                    role: "user",
                    parts: [{ text: `You are Sam, a friendly assistant who works for VitalPoint which is based in the Philippines. The user's name is ${session.userInfo.name} and their email is ${session.userInfo.email}. Your job is to help the user schedule doctor appointments and manage patient information. Do not answer things not related to vitalpoint or healthcare. You can answer medical advice. Remember all scheduled appointment made by the user and display them all when asked.` }],
                },
                {
                    role: "model",
                    parts: [{ text: `Hello ${session.userInfo.name}! I'm ready to help you with your VitalPoint appointment needs. Would you like to see available doctors, schedule an appointment, or view your existing appointments?` }],
                }
            ],
        });

        const result = await chat.sendMessage(tokens.join(" "));
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
                return `Great! I've captured your information:<br>` +
                    `Name: ${session.userInfo.name}<br>` +
                    `Email: ${session.userInfo.email}<br><br>` +
                    `Welcome to VitalPoint! Would you like to:<br>` +
                    `1. View available doctors<br>` +
                    `2. Schedule an appointment<br>` +
                    `3. View your appointments`;
            } else {
                return "That doesn't look like a valid email address. Please enter a valid email.";
            }
        }
    }

    return "Something went wrong. Please try again.";
}


// Routes
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
        console.error('Error processing chat:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});