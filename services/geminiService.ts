import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

const getClient = () => {
  if (!client && process.env.API_KEY) {
    client = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return client;
};

export const askSecurityAdvisor = async (question: string) => {
  const ai = getClient();
  if (!ai) throw new Error("API Key not found");

  const model = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: question,
    config: {
      systemInstruction: "You are a cybersecurity expert specializing in personal operational security (OpSec) and password hygiene. Keep answers concise, actionable, and suitable for a mobile screen. Do not ask for passwords. If the user provides a password, warn them immediately not to share it.",
    },
  });

  return response.text;
};
