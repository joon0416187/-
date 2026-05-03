import React, { useState } from 'react';
import { Menu, X, Home, User as UserIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 h-screen overflow-hidden relative">
      {/* Absolute Hamburger Menu Button - Overlay on top of headers */}
      <button 
        onClick={toggleMenu}
        className="absolute top-3 right-4 z-50 p-2 bg-white rounded-full shadow-md text-gray-700 hover:text-blue-600 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        {menuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Side Navigation Menu */}
      <div 
        className={`absolute inset-y-0 right-0 w-64 bg-white shadow-2xl z-40 transform transition-transform duration-300 ease-in-out ${menuOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="p-6 pt-16 flex flex-col gap-4">
          <Link 
            to="/" 
            onClick={closeMenu}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${location.pathname === '/' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            <Home size={20} />
            <span>홈 (자료 업로드)</span>
          </Link>
          <Link 
            to="/mypage" 
            onClick={closeMenu}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${location.pathname === '/mypage' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            <UserIcon size={20} />
            <span>마이페이지 & 노트</span>
          </Link>
        </div>
      </div>

      {/* Backdrop */}
      {menuOpen && (
        <div 
          onClick={closeMenu} 
          className="absolute inset-0 bg-black/20 z-30 transition-opacity"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 w-full relative z-0 overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  );
}
