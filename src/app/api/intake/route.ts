import { NextResponse } from 'next/server';
import axios from "axios";
import { campbellExamples } from '@/app/data/campbellExamples';
import type { AxiosError } from "axios";
import formidable from "formidable";
import fs from "fs/promises";
import { Readable } from 'stream';
import { IncomingMessage } from 'http';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function getExampleSummary(): string {
  const first = campbellExamples[0];
  return `Example - Subject: ${first.subject}\n${first.body}`;
}

function getSystemPrompt(): string {
  const example = getExampleSummary();
  // const examplesText = campbellExamples.map((ex, i) => 
  //   `Example ${i + 1} - Subject: ${ex.subject}\n${ex.body}`
  // ).join('\n\n---\n\n');

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

async function fetchFromOpenAI(chatHistory: ChatMessage[]): Promise<string>{
  const models = ["gpt-4o", "gpt-3.5-turbo"];
  const systemPrompt = getSystemPrompt();

  const trimmed = chatHistory.slice(-6);

  for (const model of models){
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
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
      });
      const reply = response.data.choices?.[0]?.message?.content?.trim();
      console.log('Model used:', model)
      if (reply) return reply;
    }
    catch (error){
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 429 || axiosError.response?.status === 403) {
        console.warn(`⚠️ ${model} failed (${axiosError.response?.status}). Retrying...`);
        await new Promise((r) => setTimeout(r, 1000)); // simple delay
        continue;
      }
      throw error;
    }
  }
  throw new Error("All OpenAI models failed.");
}

function readableStreamToNodeReadable(stream: ReadableStream<Uint8Array>): Readable {
  const reader = stream.getReader();
  return new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) this.push(null);
      else this.push(Buffer.from(value));
    },
  });
}

export async function POST(request: Request) {
  // const req = (request as any).body as NodeJS.ReadableStream;
  
  function toNodeRequest(request: Request): IncomingMessage {
    const body = readableStreamToNodeReadable(request.body as ReadableStream<Uint8Array>);
    return Object.assign(body, {
      headers: Object.fromEntries(request.headers.entries()),
      method: request.method,
      url: new URL(request.url).pathname,
    }) as IncomingMessage;
  }

  const nodeReq = toNodeRequest(request);
  
  if (nodeReq.method !== "POST"){
    return NextResponse.json({message: 'Method not allowed'}, {status: 405})
  }
  
  try {
  const form = formidable({multiples: false});
  const [fields, files] = await new Promise<[formidable.Fields, formidable.Files]>((resolve,reject) =>{
    form.parse(nodeReq, (err, fields, files) => {
      if (err) reject(err);
      else (resolve([fields, files]))
    });
  });

  const messagesRaw = fields.messages;
  const messages = JSON.parse(
    Array.isArray(messagesRaw) ? messagesRaw[0] : messagesRaw || '[]'
  ) as ChatMessage[];

  let fileText = '';
  const uploaded = files.file as formidable.File | formidable.File[] | undefined;;

  if (Array.isArray(uploaded) && uploaded[0]) {
    const content = await fs.readFile(uploaded[0].filepath, 'utf-8');
    fileText = content.slice(0, 2000);
  } else if (uploaded && 'filepath' in uploaded) {
    const content = await fs.readFile(uploaded.filepath, 'utf-8');
    fileText = content.slice(0, 2000);
  }

  if (!Array.isArray(messages)) {
    return NextResponse.json({ message: "Invalid input format" }, { status: 400 });
  }

  if (fileText) {
    messages.push({
      role: "user",
      content: `I've attached a file. Here's an excerpt:\n\n${fileText}`,
    });
  }

  const aiReply = await fetchFromOpenAI(messages);
  return NextResponse.json({ message: aiReply });



  } catch (error) {
    console.error('INTAKE API ERROR:', error);
    return NextResponse.json({ message: "AI processing failed" }, {status: 500});
  }
  }

  export const config = {
    api: {
      bodyParser: false,
    },
  };