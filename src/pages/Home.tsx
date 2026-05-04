import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { LogOut, UploadCloud, File, Image as ImageIcon, Copy, CheckCircle2, Link as LinkIcon, AlertCircle, MessageSquare, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCoaching } from '../contexts/CoachingContext';

interface FileData {
  id: string;
  name: string;
  url: string;
  type: string;
  createdAt: any;
  updatedAt: any;
}

enum OperationType {
  LIST = 'list',
  WRITE = 'write',
  DELETE = 'delete'
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

export default function Home() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileData[]>([]);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    
    const q = query(
      collection(db, 'files'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: FileData[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as FileData);
      });
      // Sort on client
      data.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      setFiles(data);
      setError(null);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'files');
      setError("데이터를 불러오는데 문제가 발생했습니다.");
    });

    return () => unsubscribe();
  }, [user]);

  const { selectedFileIds, setSelectedFileIds } = useCoaching();
  const navigate = useNavigate();

  const handleLogout = () => {
    signOut(auth);
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;
    try {
      await deleteDoc(doc(db, 'files', fileToDelete));
      setSelectedFileIds(prev => prev.filter(id => id !== fileToDelete));
      setFileToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'files');
      setError('파일 삭제 중 오류가 발생했습니다.');
      setFileToDelete(null);
    }
  };

  const toggleFileSelection = (id: string) => {
    setSelectedFileIds(prev => 
      prev.includes(id) ? prev.filter(fId => fId !== id) : [...prev, id]
    );
  };

  const startCoaching = () => {
    if (selectedFileIds.length === 0) return;
    navigate(`/coaching`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !user) return;
    
    const filesArray = Array.from(e.target.files);
    
    // Validate
    const invalidFiles = filesArray.filter(f => !f.type.includes('pdf') && !f.type.includes('image'));
    if (invalidFiles.length > 0) {
      setError('PDF와 이미지(JPG, PNG) 파일만 업로드할 수 있습니다.');
      e.target.value = '';
      return;
    }

    const oversizedFiles = filesArray.filter(f => f.size > 700 * 1024);
    if (oversizedFiles.length > 0) {
      setError('무료 데이터베이스 용량 제한으로 인해 700KB 이하의 파일만 업로드 가능합니다.');
      e.target.value = '';
      return;
    }
    
    setError(null);
    setUploading(true);
    
    try {
      await Promise.all(
        filesArray.map(
          (file) =>
            new Promise<void>((resolve, reject) => {
              const reader = new FileReader();

              reader.onload = async (event) => {
                const base64String = event.target?.result as string;

                try {
                  await addDoc(collection(db, 'files'), {
                    userId: user.uid,
                    name: file.name,
                    url: base64String,
                    type: file.type,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                  resolve();
                } catch (dbErr) {
                  handleFirestoreError(dbErr, OperationType.WRITE, 'files');
                  reject(dbErr);
                }
              };

              reader.onerror = () => {
                reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
              };

              reader.readAsDataURL(file);
            })
        )
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || '일부 파일 업로드에 실패했습니다.');
    } finally {
      e.target.value = '';
      setUploading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!user) return null;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 text-gray-900 font-sans pb-20">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex flex-row justify-between items-center sticky top-0 z-10 shadow-sm pr-16 shrink-0">
        <div className="flex flex-row items-center gap-2 overflow-hidden">
          <UploadCloud className="text-blue-600 shrink-0" size={28} />
          <h1 className="text-xl font-bold tracking-tight truncate font-display">핫링크 스토리지</h1>
        </div>
        <div className="flex flex-row items-center gap-4 shrink-0">
          <div className="text-sm text-gray-500 hidden sm:block shrink-0 truncate max-w-[200px]">{user.email}</div>
          <button 
            onClick={handleLogout}
            className="flex flex-row items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-red-600 bg-gray-100 hover:bg-red-50 px-3 py-1.5 rounded-md transition whitespace-nowrap shrink-0"
          >
            <LogOut size={16} />
            <span>로그아웃</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto mt-8 px-4">
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-3 border border-red-100">
            <AlertCircle className="shrink-0 mt-0.5" size={20} />
            <p className="text-sm font-medium leading-relaxed">{error}</p>
          </div>
        )}

        {/* Upload Zone */}
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 mb-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
            <UploadCloud size={32} />
          </div>
          <h2 className="text-xl font-bold mb-2">파일 업로드</h2>
          <p className="text-gray-500 text-sm mb-6 max-w-sm">
            PDF 문서나 이미지(JPG, PNG) 파일을 업로드하고 핫링크 HTML 태그를 생성하세요.
          </p>
          
          <div className="relative">
            <input 
              type="file" 
              multiple
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" 
              onChange={handleFileChange}
              disabled={uploading}
              accept=".pdf,image/jpeg,image/png"
            />
            <button 
              disabled={uploading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition shadow-sm disabled:opacity-70 flex items-center justify-center min-w-[200px]"
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2 w-full">
                  <span className="text-sm">처리 중...</span>
                </div>
              ) : (
                '파일 선택 (여러 개 가능)'
              )}
            </button>
          </div>
        </div>

        {/* File List */}
        <div>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <span className="bg-gray-100 text-gray-700 py-1 px-2.5 rounded-md text-sm">{files.length}</span>
              나의 파일
            </h3>
            
            {files.length > 0 && (
              <button 
                onClick={startCoaching}
                disabled={selectedFileIds.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <MessageSquare size={18} />
                선택한 파일로 AI 코칭 시작 ({selectedFileIds.length})
              </button>
            )}
          </div>
          
          {files.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
              저장된 파일이 없습니다. 첫 번째 파일을 위에서 업로드해 보세요!
            </div>
          ) : (
            <div className="grid gap-4">
              {files.map(file => {
                const isImage = file.type.includes('image');
                const htmlCode = isImage 
                  ? `<img src="${file.url}" alt="${file.name}" />`
                  : `<a href="${file.url}" target="_blank">Download ${file.name}</a>`;
                  
                return (
                  <div key={file.id} className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:items-center shadow-sm hover:shadow-md transition duration-200">
                    <div className="flex items-center">
                      <input 
                        type="checkbox" 
                        checked={selectedFileIds.includes(file.id)}
                        onChange={() => toggleFileSelection(file.id)}
                        className="w-5 h-5 mr-3 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <div className="w-12 h-12 shrink-0 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                        {isImage ? <ImageIcon size={24} /> : <File size={24} />}
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 truncate mb-1" title={file.name}>{file.name}</h4>
                      <p className="text-xs text-gray-500 flex items-center gap-2">
                        {new Date(file.createdAt?.toMillis?.() || Date.now()).toLocaleDateString('ko-KR')}
                        <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                        {file.type}
                      </p>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <button 
                        onClick={() => copyToClipboard(file.url, `url-${file.id}`)}
                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition text-gray-700"
                        title="URL 복사"
                      >
                        {copiedId === `url-${file.id}` ? <CheckCircle2 size={16} className="text-green-600" /> : <LinkIcon size={16} />}
                        <span className="sm:hidden">URL 복사</span>
                      </button>
                      <button 
                        onClick={() => copyToClipboard(htmlCode, `html-${file.id}`)}
                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 border border-transparent rounded-md transition font-medium"
                        title="HTML 복사"
                      >
                        {copiedId === `html-${file.id}` ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                        <span className="hidden sm:inline">HTML 복사</span>
                      </button>
                      <button
                        onClick={() => setFileToDelete(file.id)}
                        className="flex items-center justify-center p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 border border-transparent rounded-md transition"
                        title="삭제"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 overflow-hidden">
            <div className="flex justify-center mb-4 text-red-500">
              <AlertCircle size={48} />
            </div>
            <h3 className="text-xl font-bold text-center text-gray-900 mb-2">파일 삭제</h3>
            <p className="text-center text-gray-600 mb-6 font-medium">정말로 이 파일을 삭제하시겠습니까?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setFileToDelete(null)}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-semibold transition"
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
