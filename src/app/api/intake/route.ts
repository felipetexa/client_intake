import { NextResponse } from 'next/server';
import axios from "axios";
import type { AxiosError } from "axios";

async function fetchFromOpenAI(prompt: string): Promise<string>{
  const models = ["gpt-4o", "gpt-3.5-turbo"];

  for (const model of models){
    try {
      const response = await axios.post("https://api.openai.com/v1/chat/completions", {
        model,
        messages: [{ role: "user", content: prompt }],
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


  const { message } = await req.json();

  const prompt = `
        You are an experienced lawyer. Here is a message from a client:

        "${message}"

        Provide a brief, professional response acknowledging receipt and indicating that the lawyer will follow up after review. Mention the main issue you detect in their description.
        `;

  try {
    const aiResponse = await fetchFromOpenAI(prompt);
    return NextResponse.json({ message: aiResponse });
  } catch (error) {
    console.error('INTAKE API ERROR:', error);
    return NextResponse.json({ message: "AI processing failed" }, {status: 500});
  }
  }