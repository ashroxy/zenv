import React, { useState, useRef, useEffect } from 'react';
import { Bot, ArrowRight, Shield } from './Icons';
import { askSecurityAdvisor } from '../services/geminiService';

const Advisor: React.FC = () => {
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([
    { role: 'model', text: 'Hello. I am your Security Advisor. Ask me about password hygiene, encryption standards, or OpSec. Do not share real passwords with me.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const response = await askSecurityAdvisor(userMsg);
      setMessages(prev => [...prev, { role: 'model', text: response || "I couldn't generate a response." }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'model', text: "Secure connection failed. Check your API configuration." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 transition-colors">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10 transition-colors">
        <Bot className="text-indigo-500 dark:text-indigo-400" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Security Advisor</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
              m.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-br-none shadow-md' 
                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none border border-slate-200 dark:border-slate-700 shadow-sm'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
             <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-700 flex gap-1 shadow-sm">
                <span className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce delay-100"></span>
                <span className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce delay-200"></span>
             </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mb-[80px] transition-colors"> {/* Bottom margin for nav */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about security..."
            className="flex-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-full px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-slate-200 dark:border-slate-700 placeholder-slate-400 dark:placeholder-slate-500 shadow-sm transition-colors"
          />
          <button 
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-indigo-600 disabled:opacity-50 text-white p-3 rounded-full hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/30"
          >
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Advisor;