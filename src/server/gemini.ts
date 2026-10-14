import { GoogleGenAI } from '@google/genai';

// Initialize Gemini client on server side with User-Agent header as required
export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});
