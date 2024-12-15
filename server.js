// node --version # Ensure node >= 18
// npm install @google/generative-ai express

const express = require('express');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const dotenv = require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

const MODEL_NAME = "gemini-pro";
const API_KEY = process.env.API_KEY;

let userInfo = {}; // Store user information globally

async function runChat(userInput) {
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
    // ... other safety settings
  ];

  const chat = model.startChat({
    generationConfig,
    safetySettings,
    history: [
      {
        role: "user",
        parts: [{ text: "You are Sam, a friendly assistant who works for VitalPoint. VitalPoint is a healthcare platform for scheduling doctor appointments and managing patient information. Your job is to capture the user's name and email address. Don't answer the user's question until they have provided their name and email address. Once the information is provided, verify the email address is correct, thank the user, and output their name and email address in this format: {{name: user's name}} {{email: user's email address}}. After capturing the user's name and email address, answer their questions related to VitalPoint, including providing lists of available doctors and scheduling appointments." }],
      },
      {
        role: "model",
        parts: [{ text: "Hello! Welcome to VitalPoint. My name is Sam. What's your name?" }],
      },
      {
        role: "user",
        parts: [{ text: "Hi" }],
      },
      {
        role: "model",
        parts: [{ text: "Hi there! Thanks for reaching out to VitalPoint. Before I can assist you further, I'll need to capture your name and email address. Can you please provide that information?" }],
      },
    ],
  });

  let userMessage = userInput;

  // Check if name and email are already captured
  if (!userInfo.name || !userInfo.email) {
    if (userInput.includes("name") && userInput.includes("email")) {
      // Store user info
      const matches = userInput.match(/name:\s*([^\s]+)\s*email:\s*([^\s]+)/);
      if (matches) {
        userInfo.name = matches[1];
        userInfo.email = matches[2];
      }
      chat.history.push({
        role: "model",
        parts: [
          { text: `Thank you ${userInfo.name}! I've captured your name and email. How can I assist you further with scheduling an appointment?` },
        ],
      });
      userMessage = "Schedule appointment"; // Adjust next user input
    }
  }

  if (userInput.toLowerCase() === "view available doctors") {
    chat.history.push({
      role: "model",
      parts: [
        {
          text: "Here is the current list of available doctors: * Dr. Jane Doe * Dr. John Smith * Dr. Mary Johnson. Please let me know if you want to schedule an appointment with any of these doctors.",
        },
      ],
    });
  }

  const result = await chat.sendMessage(userMessage);
  const response = result.response;
  return response.text();
}

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

    const response = await runChat(userInput);
    res.json({ response });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
