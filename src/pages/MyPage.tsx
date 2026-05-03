import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { LogOut, Play, Pause, Square, BookOpen, Clock, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Note {
  id: string;
  content: string;
  createdAt: any;
}

interface StudySession {
  id: string;
  durationSeconds: number;
  createdAt: any;
}

export default function MyPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [totalStudyTime, setTotalStudyTime] = useState(0);

  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!user) return;
    
    const notesQuery = query(collection(db, 'notes'), where('userId', '==', user.uid));
    const unsubscribeNotes = onSnapshot(notesQuery, (snapshot) => {
      const data: Note[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() } as Note));
      data.sort((a, b) => {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tB - tA; // descending
      });
      setNotes(data);
    });

    const sessionsQuery = query(collection(db, 'studySessions'), where('userId', '==', user.uid));
    const unsubscribeSessions = onSnapshot(sessionsQuery, (snapshot) => {
      let total = 0;
      snapshot.forEach(doc => {
        const data = doc.data() as StudySession;
        total += data.durationSeconds;
      });
      setTotalStudyTime(total);
    });

    return () => {
      unsubscribeNotes();
      unsubscribeSessions();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user]);

  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerActive]);

  const toggleTimer = () => setTimerActive(!timerActive);

  const endSession = async () => {
    if (!user || timerSeconds === 0) return;
    setTimerActive(false);
    
    try {
      await addDoc(collection(db, 'studySessions'), {
        userId: user.uid,
        durationSeconds: timerSeconds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to save study session", err);
    }
    
    setTimerSeconds(0);
  };

  const deleteNote = async (id: string) => {
    if (!confirm('노트를 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'notes', id));
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':');
  };

  if (!user) return null;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 text-gray-900 font-sans pb-20 pr-16 md:pr-0">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex flex-row justify-between items-center sticky top-0 z-10 shadow-sm pr-16 shrink-0">
        <div className="flex flex-row items-center gap-2 overflow-hidden">
          <BookOpen className="text-blue-600 shrink-0" size={28} />
          <h1 className="text-xl font-bold tracking-tight truncate font-display">마이페이지</h1>
        </div>
      </header>
      
      <main className="max-w-4xl mx-auto mt-8 px-4 flex flex-col gap-8 flex-1 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Total Study Time Stats */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
            <Clock size={40} className="text-blue-500 mb-3" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">총 누적 공부 시간</h2>
            <div className="text-4xl font-bold text-gray-800 font-mono tracking-tight">
              {formatTime(totalStudyTime)}
            </div>
          </div>

          {/* Current Session Timer */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-2xl shadow-md text-white flex flex-col items-center justify-center">
            <h2 className="text-sm font-medium text-blue-100 uppercase tracking-wider mb-2">현재 공부 세션</h2>
            <div className="text-5xl font-bold font-mono tracking-tight tabular-nums mb-6">
              {formatTime(timerSeconds)}
            </div>
            
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleTimer}
                className="w-14 h-14 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center transition"
              >
                {timerActive ? <Pause size={24} className="fill-white" /> : <Play size={24} className="ml-1 fill-white" />}
              </button>
              
              <button 
                onClick={endSession}
                disabled={timerSeconds === 0}
                className="w-14 h-14 bg-red-500 hover:bg-red-600 disabled:bg-gray-400/30 disabled:text-gray-300 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition"
              >
                <Square size={20} className="fill-current" />
              </button>
            </div>
            <p className="mt-4 text-xs text-blue-200 text-center max-w-[200px]">
              정지 버튼을 누르면 기록이 저장됩니다.
            </p>
          </div>
        </div>

        {/* AI Notes Section */}
        <div className="mt-4">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <BookOpen size={24} className="text-indigo-600" />
            에듀코치 AI 노트
            <span className="bg-indigo-100 text-indigo-700 text-sm px-2 py-0.5 rounded-full font-medium ml-2">{notes.length}</span>
          </h2>
          
          {notes.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-500">
              저장된 노트가 없습니다. 코칭 화면에서 유용한 답변을 저장해보세요.
            </div>
          ) : (
            <div className="columns-1 md:columns-2 gap-4 space-y-4">
              {notes.map(note => (
                <div key={note.id} className="break-inside-avoid bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition group relative">
                  <div className="text-xs text-gray-400 mb-3 flex justify-between items-center pr-8">
                    {new Date(note.createdAt?.toMillis?.() || Date.now()).toLocaleString('ko-KR')}
                  </div>
                  <div className="prose prose-sm max-w-none text-gray-700 markdown-body">
                    <ReactMarkdown>{note.content}</ReactMarkdown>
                  </div>
                  
                  <button 
                    onClick={() => deleteNote(note.id)}
                    className="absolute top-4 right-4 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="노트 삭제"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
