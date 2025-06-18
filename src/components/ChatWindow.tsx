"use client"
import { useRef, useState } from 'react';

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]
>([
  {
    role: "assistant",
    content:
      "Hello! I'm here to help with your legal issue. Could you please describe what you're dealing with?",
  },
]);
  const [input, setInput] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSendMessage = async () => {
    if (input.trim() === '') return;

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: input }];
    setMessages(newMessages);
    setInput('');

    const formData = new FormData();
    formData.append('messages', JSON.stringify(newMessages));
    if(uploadedFile){
      formData.append('file', uploadedFile);
    }

    const response = await fetch('/api/intake', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
    
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; 
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="border border-gray-300 rounded-lg p-4 min-h-[300px] bg-white shadow-sm mb-4 space-y-2 overflow-y-auto">
      {messages.map((msg, i) => (
  <p
    key={i}
    className={`text-sm whitespace-pre-wrap ${
      msg.role === "assistant" ? "text-gray-800" : "text-blue-800"
    }`}
  >
    {msg.role === "assistant" ? "Campbell: " : "You: "}
    {msg.content}
  </p>
))}
      </div>
      <div className="flex gap-2">
        <textarea
          value={input}
          autoComplete="off"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }}}
          placeholder="Type your message..."
          rows={1}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <button
          onClick={handleSendMessage}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition"
        >
          Send
        </button>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt,.odt,.jpg,.jpeg,.png,.heic,.webp"
          onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
          className="text-sm"
        />
      </div>
    </div>
  );

}