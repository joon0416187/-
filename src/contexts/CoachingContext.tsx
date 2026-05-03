import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface CoachingContextType {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  selectedFileIds: string[];
  setSelectedFileIds: React.Dispatch<React.SetStateAction<string[]>>;
}

const CoachingContext = createContext<CoachingContextType | null>(null);

export const CoachingProvider = ({ children }: { children: React.ReactNode }) => {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = sessionStorage.getItem('coaching_messages');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch(e) {}
    }
    return [{
      id: 'init',
      role: 'model',
      text: '안녕하세요! 선택하신 자료를 바탕으로 수행평가 대비를 도와드리겠습니다. 어떤 부분에 대해 질문이 있으신가요?',
    }];
  });

  const [selectedFileIds, setSelectedFileIds] = useState<string[]>(() => {
    const saved = sessionStorage.getItem('coaching_files');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch(e) {}
    }
    return [];
  });

  useEffect(() => {
    sessionStorage.setItem('coaching_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    sessionStorage.setItem('coaching_files', JSON.stringify(selectedFileIds));
  }, [selectedFileIds]);

  return (
    <CoachingContext.Provider value={{ messages, setMessages, selectedFileIds, setSelectedFileIds }}>
      {children}
    </CoachingContext.Provider>
  );
};

export const useCoaching = () => {
  const context = useContext(CoachingContext);
  if (!context) throw new Error('useCoaching must be used within CoachingProvider');
  return context;
};
