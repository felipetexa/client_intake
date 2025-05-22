"use client"
import { useState, useEffect } from 'react';

export default function ChatWindow() {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState<string>('');

  useEffect(() => {
    setMessages([
      "Campbell: Hello! I'm here to help with your legal issue. Could you please describe what you're dealing with?"
    ]);
  }, []);

  const handleSendMessage = async () => {
    if (input.trim() === '') return;
    setMessages([...messages, `You: ${input}`]);

    const response = await fetch('/api/intake', {
      method: 'POST',
      body: JSON.stringify({ message: input }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    setMessages((prev) => [...prev, `Campbell: ${data.message}`]);
    setInput('');
  }

  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="border border-gray-300 rounded-lg p-4 min-h-[300px] bg-white shadow-sm mb-4 space-y-2 overflow-y-auto">
        {messages.map((msg, i) => (
          <p key={i} className="text-sm text-gray-800 whitespace-pre-wrap">
            {msg}
          </p>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <button
          onClick={handleSendMessage}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition"
        >
          Send
        </button>
      </div>
    </div>
  );

}