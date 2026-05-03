import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, Send, User as UserIcon, Bot, Loader2, FileText, Save, CheckCircle2, Clock, MessageSquare } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { useCoaching, Message } from '../contexts/CoachingContext';
import { useTimer } from '../contexts/TimerContext';

interface FileData {
  id: string;
  name: string;
  url: string; // The base64 data url
  type: string;
}

  // Interface Message is now exported from CoachingContext


export default function Coaching() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { messages, setMessages, selectedFileIds } = useCoaching();
  const { timerActive, timerSeconds, formatTime } = useTimer();
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [savedNoteIds, setSavedNoteIds] = useState<string[]>([]);
  const [isSavingConversation, setIsSavingConversation] = useState(false);

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const fetchFiles = async () => {
      if (!user || selectedFileIds.length === 0) {
          setLoading(false);
          return;
      }
      try {
        const fileDocs = await Promise.all(
          selectedFileIds.map(id => getDoc(doc(db, 'files', id)))
        );
        const loadedFiles = fileDocs
          .filter(d => d.exists() && d.data().userId === user.uid)
          .map(d => ({ id: d.id, ...d.data() } as FileData));
        setFiles(loadedFiles);
      } catch (err) {
        console.error('Failed to load files:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFiles();
  }, [user, selectedFileIds]);

  // Helper to parse Data URL to base64 string
  const parseDataUrl = (dataUrl: string) => {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || '';
    const bstr = arr[1];
    return { mime, data: bstr };
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userText = input.trim();
    setInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);
    setIsTyping(true);

    try {
      let apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        try {
          const res = await fetch('/api/config');
          const data = await res.json();
          apiKey = data.geminiApiKey;
        } catch (e) {
          console.warn('Failed to fetch API key from server', e);
        }
      }

      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured');
      }

      const ai = new GoogleGenAI({ apiKey });

      // Construct file parts
      const fileParts = files.map(f => {
        const parsed = parseDataUrl(f.url);
        return {
          inlineData: {
            mimeType: parsed.mime,
            data: parsed.data
          }
        };
      });

      // Include conversation history
      const historyContext = messages
        .filter(m => m.id !== 'init')
        .map(m => `${m.role === 'user' ? '학생' : '에듀코치'}: ${m.text}`)
        .join('\n');

      const fullPrompt = `
당신은 학생의 수행평가 대비를 돕는 친절하고 전문적인 '소크라테스식 에듀코치'입니다.
다음 첨부된 파일(들)의 내용을 분석하여 학생과 대화해주세요.

[필수 지침]
1. 항상 역질문이나 힌트로 답해서 학생이 문제를 작은 단위로 쪼개서 스스로 생각할 수 있도록 유도하세요.
2. 절대 학생의 질문에 대한 최종 정답, 완성된 에세이 등 완전한 정답을 직접 가르쳐주지 마세요.
3. 학생이 틀렸을 때는 바로 정답을 알려주지 말고, "그렇게 생각한 이유가 뭘까?"와 같이 따뜻하게 격려하며 사고 과정을 되짚어볼 수 있게 해주세요.
4. 학생이 문항 번호를 부르거나 문제를 찝어달라고 할 때, 또는 학생이 보아야 할 자료/문제가 있다면 해당 이미지/파일을 대화창에 띄워주세요. 
   띄워주는 방법은 마크다운 이미지 문법을 사용하여 반드시 괄호 안에 업로드된 파일의 정확한 파일명을 적어주세요. 
   예시: \`![문제 사진](math_q3.png)\`

첨부된 파일 목록:
${files.map(f => `- ${f.name}`).join('\n')}

[이전 대화 내용]
${historyContext}

학생: ${userText}
      `.trim();

      const response = await ai.models.generateContentStream({
        model: 'gemini-1.5-flash',
        contents: {
          parts: [...fileParts, { text: fullPrompt }]
        }
      });

      const messageId = Date.now().toString() + '_resp';
      setMessages(prev => [...prev, { id: messageId, role: 'model', text: '' }]);

      let fullResponseText = '';
      for await (const chunk of response) {
        if (chunk.text) {
          fullResponseText += chunk.text;
          setMessages(prev => prev.map(m => m.id === messageId ? { ...m, text: fullResponseText } : m));
        }
      }

    } catch (err: any) {
      console.error('Coaching Error:', err);
      
      let errorMessage = '죄송합니다. 오류가 발생하여 답변을 작성하지 못했습니다. 잠시 후 다시 시도해주세요.';
      if (err instanceof Error && err.message === 'GEMINI_API_KEY is not configured') {
        errorMessage = 'Gemini API 키가 설정되지 않았습니다.\n\nNetlify 배포 시 **Site configuration > Environment variables** 에서 `VITE_GEMINI_API_KEY` 환경 변수를 추가해주세요.\n\n**중요:** 환경 변수를 추가한 후 반드시 Netlify의 Deploys 탭에서 **Trigger deploy -> Clear cache and deploy site**를 눌러 사이트를 "새로 빌드"해야 키가 적용됩니다. (Vite 특성상 빌드 시점에 키가 포함되어야 합니다.)\n\n키 발급은 [Google AI Studio](https://aistudio.google.com/app/apikey)에서 무료로 받을 수 있습니다.';
      }
      
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: errorMessage }]);
    } finally {
      setIsTyping(false);
    }
  };

  const saveNote = async (message: Message) => {
    if (!user || savingNoteId === message.id || savedNoteIds.includes(message.id)) return;
    setSavingNoteId(message.id);
    try {
      await addDoc(collection(db, 'notes'), {
        userId: user.uid,
        content: message.text,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setSavedNoteIds(prev => [...prev, message.id]);
    } catch (err) {
      console.error('Failed to save note:', err);
      alert('노트 저장에 실패했습니다.');
    } finally {
      setSavingNoteId(null);
    }
  };

  const saveConversation = async () => {
    if (!user || isSavingConversation || messages.length <= 1) return;
    setIsSavingConversation(true);
    try {
      const chatContent = messages
        .filter(m => m.id !== 'init')
        .map(m => `**${m.role === 'user' ? '학생' : '에듀코치'}**\n${m.text}\n`)
        .join('\n---\n\n');
      
      const fullContent = `# 대화 내역 저장\n\n${chatContent}`;

      await addDoc(collection(db, 'notes'), {
        userId: user.uid,
        content: fullContent,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      alert('현재 대화가 마이페이지에 저장되었습니다.');
    } catch (err) {
      console.error('Failed to save conversation:', err);
      alert('대화 저장에 실패했습니다.');
    } finally {
      setIsSavingConversation(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-gray-50 h-full overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex flex-row items-center justify-between shrink-0 pr-16 shadow-sm">
        <div className="flex flex-row items-center gap-3 overflow-hidden">
          <button 
            onClick={() => navigate('/')}
            className="p-1.5 hover:bg-gray-100 rounded-full transition shrink-0"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div className="flex flex-col shrink-0">
            <h1 className="text-lg font-bold text-gray-900 leading-tight font-display">AI 에듀코치</h1>
            <p className="text-xs text-green-600 font-medium">{files.length}개의 파일 분석 중</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {timerActive && (
            <div className="hidden sm:flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-mono font-medium text-sm border border-blue-100">
              <Clock size={14} />
              {formatTime(timerSeconds)}
            </div>
          )}
          <button
            onClick={saveConversation}
            disabled={isSavingConversation || messages.length <= 1}
            className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSavingConversation ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span className="hidden sm:inline">현재 대화 저장</span>
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto w-full">
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
          {/* Reference Files Info */}
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex flex-col gap-2 shadow-sm">
            <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-1.5"><FileText size={16} /> 분석 대상 자료</h3>
            <div className="flex flex-wrap gap-2">
              {files.map(f => (
                <div key={f.id} className="bg-white border border-blue-200 px-3 py-1.5 rounded-lg text-sm text-blue-800 flex items-center gap-2">
                  <span className="truncate max-w-[200px]">{f.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Messages */}
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-green-100 text-green-700'}`}>
                {msg.role === 'user' ? <UserIcon size={20} /> : <Bot size={24} />}
              </div>
              <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[80%]`}>
                <span className="text-xs text-gray-500 mb-1 px-1">{msg.role === 'user' ? '학생' : '에듀코치'}</span>
                <div className="relative group">
                  <div className={`px-4 py-3 rounded-2xl ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-sm whitespace-pre-wrap' 
                      : 'bg-white text-gray-800 rounded-tl-sm border border-gray-100 shadow-sm leading-relaxed markdown-body'
                  }`}>
                    {msg.role === 'model' ? (
                      <ReactMarkdown
                        components={{
                          img: ({ node, ...props }) => {
                            const file = files.find(f => f.name === props.src);
                            if (file) {
                              if (file.type.includes('pdf')) {
                                return (
                                  <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-800 rounded-lg border border-blue-100 my-2">
                                    <FileText size={20} />
                                    <span className="font-medium">{file.name}</span>
                                    <span className="text-sm">(PDF 자료)</span>
                                  </div>
                                );
                              }
                              return (
                                <img
                                  src={file.url}
                                  alt={props.alt || file.name}
                                  className="max-w-full h-auto rounded-lg shadow-sm border border-gray-200 my-3"
                                />
                              );
                            }
                            // Fallback
                            return <img {...props} className="max-w-full h-auto rounded-lg my-2" />;
                          }
                        }}
                      >{msg.text}</ReactMarkdown>
                    ) : (
                      msg.text
                    )}
                  </div>
                  {msg.role === 'model' && !isTyping && msg.id !== 'init' && (
                    <button
                      onClick={() => saveNote(msg)}
                      disabled={savedNoteIds.includes(msg.id) || savingNoteId === msg.id}
                      className="absolute -right-10 top-2 p-1.5 bg-white border border-gray-200 rounded-full text-gray-400 hover:text-blue-600 hover:border-blue-200 shadow-sm transition opacity-0 group-hover:opacity-100 disabled:opacity-100 focus:opacity-100"
                      title="노트에 저장"
                    >
                      {savingNoteId === msg.id ? (
                        <Loader2 size={16} className="animate-spin text-blue-600" />
                      ) : savedNoteIds.includes(msg.id) ? (
                        <CheckCircle2 size={16} className="text-green-600" />
                      ) : (
                        <Save size={16} />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {isTyping && (
             <div className="flex gap-3">
               <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center shadow-sm bg-green-100 text-green-700">
                 <Bot size={24} />
               </div>
               <div className="px-4 py-3 bg-white rounded-2xl rounded-tl-sm border border-gray-100 shadow-sm flex items-center gap-1.5">
                 <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                 <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                 <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 p-4 shrink-0">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="수행평가 자료에 대해 질문해보세요..."
            className="flex-1 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-300 rounded-xl"
            disabled={isTyping}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Send size={20} className="ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}
