import { NextResponse } from 'next/server';
import axios from "axios";
import { campbellExamples } from '@/app/data/campbellExamples';
import { determineJurisdiction, extractAmount } from '@/app/data/jurisdiction';
import type { AxiosError } from "axios";
import formidable from "formidable";
import { Readable } from 'stream';
import { IncomingMessage } from 'http';
import { parseFileText } from '@/services/parseFileText';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function getExampleSummary(): string {
  const first = campbellExamples[0];
  return `Example - Subject: ${first.subject}\n${first.body}`;
}

function getSystemPrompt(legalContext: string): string {
  const example = getExampleSummary();
  // const examplesText = campbellExamples.map((ex, i) => 
  //   `Example ${i + 1} - Subject: ${ex.subject}\n${ex.body}`
  // ).join('\n\n---\n\n');

  return `
You are Richard Campbell, an experienced lawyer known for clear, professional, and empathetic communication.
You are speaking directly with a prospective client — do NOT suggest they consult a lawyer. You ARE that lawyer.

Example of how you usually respond:

${example}

LEGAL CONTEXT:
${legalContext}

Your job:
- Greet the client based on the time of day
- Respond professionally and like a human, without repeating yourself
- Keep the conversation flowing naturally, like an email or live chat
- If there's an uploaded file, consider its content in your response
- If the amount claimed is **under $35,000**, you must:
  - Say this is a Small Claims Court matter
  - Say you are a **deputy judge** in Small Claims Court
  - Say you **cannot act as a lawyer**
  - Refer the user to a **licensed paralegal**
- Never leave a response unfinished

Strict rules:
- NEVER mention court names, levels, thresholds, or limits unless explicitly allowed
- Do NOT include your name or any sign-off
- Do NOT offer a call immediately
- Greet/apologize only once
- Respond as an ongoing thread — not like a form intake

You may decline:
- Family Law (unless post-judgment enforcement)
- Real Estate (unless mortgage-related)

You may accept:
- Personal injury, contract law, insurance, construction, shareholder disputes, professional negligence, mortgage enforcement, lawsuits against lawyers or cities
`.trim();
}

// Your goal is to:
// - Start the conversation with a friendly tone ("Good morning" / "Good afternoon") based on current time
// - Respond in a professional, human, and non-repetitive manner
// - Continue the conversation naturally, as if over email or a chat
// - If the user uploads a file, consider its content when crafting your advice

// If the claim is $35,000 or more, you must **not explain anything about the court**. Just move on and give legal advice or next steps.

// Responses that break this rule are invalid and must be regenerated. No exceptions.

// - Only mention Small Claims Court if the **total amount claimed is clearly under $35,000**
// - If the amount is ambiguous or unclear, state that you need more information to assess whether it qualifies for Small Claims Court, and avoid guessing
// - NEVER state that a case is in Small Claims Court if the amount is $35,000 or more — even if the user mentions that themselves

// Additional Instructions:

// - Do NOT greet or apologize more than once
// - Do NOT include your name or any sign-off
// - NEVER offer a call immediately
// - If the case qualifies as Small Claims Court (under $35,000), kindly refer the user to a paralegal and explain that you are a deputy judge in that court and cannot act as a lawyer there
// - Decline Family Law matters unless they relate to **post-judgment enforcement**
// - Decline Real Estate unless it's **mortgage-related**
// - You CAN handle lawsuits involving: personal injury, contract law, insurance disputes, construction issues, shareholder disputes, professional negligence, mortgage enforcement, lawsuits against other lawyers, or lawsuits against the city
// - Respond to each message like an **ongoing conversation**, NOT like a new intake
// - Never leave a response unfinished. Always conclude your thoughts
// `.trim();
// }

async function fetchFromOpenAI(chatHistory: ChatMessage[], legalContext: string): Promise<string>{
  const models = ["gpt-4o", "gpt-3.5-turbo"];
  const systemPrompt = getSystemPrompt(legalContext);

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
        max_tokens: 1000,
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
  const form = formidable({multiples: true});
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
  const uploaded = files.file || files.files;
  const uploadedArray = Array.isArray(uploaded) ? uploaded : uploaded ? [uploaded] : [];

  const parsedTexts = await Promise.all(
    uploadedArray.map(file => parseFileText(file))
  )

  fileText = parsedTexts.filter(Boolean).join('\n\n').slice(0, 3000);

  if (!Array.isArray(messages)) {
    return NextResponse.json({ message: "Invalid input format" }, { status: 400 });
  }

  if (fileText) {
    messages.push({
      role: "user",
      content: `I've attached a file. Here's an excerpt:\n\n${fileText}`,
    });
  }

  const fullUserContent = messages
  .filter(m => m.role === 'user')
  .map(m => m.content)
  .join(' ');

  const detectedAmount = extractAmount(fullUserContent);
  const jurisdiction = determineJurisdiction(detectedAmount);

  const legalContextInstructions = {
    small_claims: `The amount claimed is under $35,000. This qualifies as a Small Claims Court matter. You are a deputy judge in that court and cannot act as a lawyer. Kindly refer the client to a licensed paralegal.`,
    above_small_claims: `The amount claimed is $35,000 or more. You can proceed with legal advice and do not need to mention the court unless relevant.`,
    ambiguous: `The amount claimed is unclear. You may ask for more information to determine if this is a Small Claims Court matter.`,
  }[jurisdiction];

  const aiReply = await fetchFromOpenAI(messages, legalContextInstructions);
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