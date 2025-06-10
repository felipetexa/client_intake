import type { NextApiRequest, NextApiResponse } from 'next';
import formidable, { File } from 'formidable';
import fs from 'fs/promises';
import axios, { AxiosError } from 'axios';
import { campbellExamples } from '@/app/data/campbellExamples';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

// Disable the default Next.js body parser so we can use formidable
export const config = {
  api: {
    bodyParser: false,
  },
};

// Generate example prompt
function getExampleSummary(): string {
  const first = campbellExamples[0];
  return `Example - Subject: ${first.subject}\n${first.body}`;
}

// Construct system prompt with examples and instructions
function getSystemPrompt(): string {
  const example = getExampleSummary();
  return `
You are Richard Campbell, an experienced lawyer known for clear, professional, and empathetic communication.

Below are examples of how you typically respond to clients:

${example}
Your goal is to:
- Start the conversation with a friendly tone ("Good morning"/"Good afternoon") based on current time
- Respond in a professional, human, and non-repetitive manner
- Continue the conversation naturally, as if over email or a chat
- If the user uploads a file, consider it when crafting your advice

Important guidance:
- Do NOT greet or apologize more than once
- Do NOT add your name or sign-offs
- NEVER offer a call immediately
- If the case is Small Claims Court (under $35,000), kindly refer to a paralegal due to conflict
- Decline Family Law matters unless post-judgment enforcement
- Decline Real Estate unless it's mortgage-related
- You can handle lawsuits against negligent professionals, the city, or other lawyers
- Your specialties include: personal injury, insurance, construction, shareholder disputes, professional negligence, and mortgage enforcement

Respond to each message like a conversation, NOT like a new intake.
`.trim();
}

// Fetch a completion from OpenAI using chat history
async function fetchFromOpenAI(chatHistory: ChatMessage[]): Promise<string> {
  const models = ["gpt-4o", "gpt-3.5-turbo"];
  const systemPrompt = getSystemPrompt();
  const trimmed = chatHistory.slice(-6); // Keep last 6 messages

  for (const model of models) {
    try {
      const response = await axios.post("https://api.openai.com/v1/chat/completions", {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...trimmed,
        ],
        temperature: 0.5,
        max_tokens: 300,
      }, {
        headers: {
          "Content-Type": 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}`,
        },
      });

      const reply = response.data.choices?.[0]?.message?.content?.trim();
      console.log('Model used:', model);
      if (reply) return reply;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 429 || axiosError.response?.status === 403) {
        console.warn(`⚠️ ${model} failed (${axiosError.response?.status}). Retrying...`);
        await new Promise((r) => setTimeout(r, 1000)); // Delay and try next
        continue;
      }
      throw error;
    }
  }

  throw new Error("All OpenAI models failed.");
}

// Default export for the API route
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const form = formidable({ multiples: false });
    const [fields, files] = await new Promise<[formidable.Fields, formidable.Files]>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // Get messages field
    const messagesRaw = fields.messages;
    const messages = JSON.parse(
      Array.isArray(messagesRaw) ? messagesRaw[0] : messagesRaw || '[]'
    ) as ChatMessage[];

    // Handle optional file
    let fileText = '';
    const uploaded = files.file as File | File[] | undefined;

    if (Array.isArray(uploaded) && uploaded[0]?.filepath) {
      const content = await fs.readFile(uploaded[0].filepath, 'utf-8');
      fileText = content.slice(0, 2000);
    } else if (uploaded && 'filepath' in uploaded) {
      const content = await fs.readFile(uploaded.filepath, 'utf-8');
      fileText = content.slice(0, 2000);
    }

    // Add file content to conversation if present
    if (fileText) {
      messages.push({
        role: "user",
        content: `I've attached a file. Here's an excerpt:\n\n${fileText}`,
      });
    }

    if (!Array.isArray(messages)) {
      return res.status(400).json({ message: "Invalid input format" });
    }

    const aiReply = await fetchFromOpenAI(messages);
    return res.status(200).json({ message: aiReply });

  } catch (error) {
    console.error('INTAKE API ERROR:', error);
    return res.status(500).json({ message: "AI processing failed" });
  }
}
