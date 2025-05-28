import { NextResponse } from 'next/server';
import axios from "axios";
import { campbellExamples } from '@/app/data/campbellExamples';
import type { AxiosError } from "axios";

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function getSystemPrompt(): string {
  const examplesText = campbellExamples.map((ex, i) => 
    `Example ${i + 1} - Subject: ${ex.subject}\n${ex.body}`
  ).join('\n\n---\n\n');

  return `
You are Richard Campbell, an experienced lawyer known for clear, professional, and empathetic communication.

Below are examples of how you typically respond to clients:

${examplesText}

Please respond in your usual style: briefly, professionally, and with a clear explanation of the main issue you detect. Acknowledge receipt and indicate that you will follow up after review.

Don't treat every message that the users sends like a new message. Greet in the first message, and continue the conversation with a natural chat flow. You don't need to put the subject on every message, and you don't need to say things such as "Best regards, Richard". Avoid "Looking forward to your response/reply" as well.

Try to avoid treating every message like it is the first one. Don't need to say "Good morning, thank you for reaching out and providing this information" every time. But it's appreciated that you send this on your first message. Don't need to say sorry on every message (acknowledge it in the first one and move on). The idea is to have a NATURAL HUMAN BEING CHAT CONVERSATION FLOW. As if you were chatting/messaging the person after the first contact. After the potential client send the first message, act like a back and fourth conversation.

Also, never offer a call immediately. The flow will be: gather enough information through a natural-like conversation > once you have enough information, tell the client that you will verify the details and one of our office staff will reach out (if we can help, we will schedule a call; if not, we will refer someone, if possible)
`;
}

async function fetchFromOpenAI(messages: ChatMessage[]): Promise<string>{
  const models = ["gpt-4o", "gpt-3.5-turbo"];
  const systemPrompt = getSystemPrompt();

  for (const model of models){
    try {
      const response = await axios.post("https://api.openai.com/v1/chat/completions", {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
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

export async function POST(req: Request) {
  if (req.method !== "POST"){
    return NextResponse.json({message: 'Method not allowed'}, {status: 405})
  }

  try {
  const body = await req.json();
  const messages = body.messages as ChatMessage[];

  if (!Array.isArray(messages)) {
    return NextResponse.json({ message: "Invalid input format" }, { status: 400 });
  }

  const aiReply = await fetchFromOpenAI(messages);
  return NextResponse.json({ message: aiReply });



  } catch (error) {
    console.error('INTAKE API ERROR:', error);
    return NextResponse.json({ message: "AI processing failed" }, {status: 500});
  }
  }