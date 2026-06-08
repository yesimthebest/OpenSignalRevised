import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Store, LogOut, Settings as SettingsIcon, Repeat, User, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { getDisplayName, readLocalProfile, writeLocalProfile } from '../lib/localProfile';

export default function My() {
  const { user, userRole, storeName, storeRegion, storeIndustry, setUserRole, setStoreName, setStoreRegion, setStoreIndustry } = useAuthStore();
  const [isSwitching, setIsSwitching] = useState(false);
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [storeNameInput, setStoreNameInput] = useState('');

  const [isEditStoreModalOpen, setIsEditStoreModalOpen] = useState(false);
  const [editStoreNameInput, setEditStoreNameInput] = useState('');
  const [editStoreRegionInput, setEditStoreRegionInput] = useState('');
  const [editStoreIndustryInput, setEditStoreIndustryInput] = useState('');
  const [isUpdatingStore, setIsUpdatingStore] = useState(false);

  const openEditModal = () => {
    setEditStoreNameInput(storeName || '');
    setEditStoreRegionInput(storeRegion || '');
    setEditStoreIndustryInput(storeIndustry || '');
    setIsEditStoreModalOpen(true);
  };

  const handleUpdateStoreInfo = async () => {
    if (!user) return;
    setIsUpdatingStore(true);
    try {
      const nextProfile = {
        ...readLocalProfile(),
        role: userRole,
        storeName: editStoreNameInput,
        storeRegion: editStoreRegionInput,
        storeIndustry: editStoreIndustryInput,
      };
      writeLocalProfile(nextProfile);

      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        role: userRole,
        store_name: editStoreNameInput,
        store_region: editStoreRegionInput,
        store_industry: editStoreIndustryInput
      });
      
      if (error) console.warn('Profile sync skipped:', error);
      
      setStoreName(editStoreNameInput);
      setStoreRegion(editStoreRegionInput);
      setStoreIndustry(editStoreIndustryInput);
      setIsEditStoreModalOpen(false);
      alert('가게 정보가 성공적으로 수정되었습니다.');
    } catch (e: any) {
      console.error(e);
      alert('수정 실패: ' + e.message);
    } finally {
      setIsUpdatingStore(false);
    }
  };

  const handleLogout = async () => {
    localStorage.clear();
    sessionStorage.clear();
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const handleSwitchRole = async (targetRole: 'owner' | 'customer', targetStoreName: string | null = null) => {
    if (!user) return;
    setIsSwitching(true);
    
    try {
      const nextProfile = {
        ...readLocalProfile(),
        role: targetRole,
        storeName: targetStoreName || storeName,
      };
      writeLocalProfile(nextProfile);

      const { error } = await supabase.from('profiles').upsert({ 
        id: user.id,
        role: targetRole,
        store_name: nextProfile.storeName,
        store_region: nextProfile.storeRegion,
        store_industry: nextProfile.storeIndustry,
      });
      
      if (error) console.warn('Profile sync skipped:', error);
      
      setUserRole(targetRole);
      if (targetStoreName) setStoreName(targetStoreName);
      setIsStoreModalOpen(false);
    } catch (error) {
      console.error('Error switching role:', error);
      alert('역할 전환 중 오류가 발생했습니다.');
    } finally {
      setIsSwitching(false);
    }
  };

  const onRoleToggleClick = () => {
    if (userRole === 'owner') {
      // 사장님 -> 손님 전환 시 즉각 전환
      if (confirm('손님 뷰로 전환하시겠습니까?')) {
        handleSwitchRole('customer');
      }
    } else {
      // 손님 -> 사장님 전환 시
      if (storeName) {
        // 이미 가게 이름이 있으면 즉시 전환
        handleSwitchRole('owner');
      } else {
        // 가게 이름이 없으면 모달 호출
        setIsStoreModalOpen(true);
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex-1 flex flex-col bg-slate-50 min-h-screen pb-24 relative"
    >
      <div className="bg-white p-6 shadow-sm mb-2 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {user?.user_metadata?.avatar_url ? (
            <img src={user.user_metadata.avatar_url} alt="Profile" className="w-16 h-16 rounded-full border border-slate-200" />
          ) : (
            <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center text-violet-600">
              {userRole === 'owner' ? <Store size={32} /> : <User size={32} />}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${userRole === 'owner' ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'}`}>
                {userRole === 'owner' ? '사장님' : '손님'}
              </span>
              {userRole === 'owner' && storeName && (
                <span className="text-xs font-semibold text-slate-500">{storeName}</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-800">{getDisplayName(user)}</h1>
            <p className="text-sm text-slate-500">로그인 없이 이용 중</p>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-sm flex flex-col">
        <button 
          onClick={onRoleToggleClick}
          disabled={isSwitching}
          className="flex items-center justify-between p-4 border-b border-slate-100 active:bg-slate-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <Repeat className="text-slate-400" size={24} />
            <span className="font-medium text-slate-700">
              {userRole === 'owner' ? '손님 뷰로 전환하기' : '사장님 뷰로 전환하기'}
            </span>
          </div>
          <span className="text-xs text-slate-400">
            {isSwitching ? '전환 중...' : '클릭'}
          </span>
        </button>
        <button className="flex items-center gap-3 p-4 border-b border-slate-100 active:bg-slate-50 transition-colors text-left">
          <SettingsIcon className="text-slate-400" size={24} />
          <span className="font-medium text-slate-700">앱 설정</span>
        </button>
        {userRole === 'owner' && (
          <button 
            onClick={openEditModal}
            className="flex items-center gap-3 p-4 border-b border-slate-100 active:bg-slate-50 transition-colors text-left"
          >
            <Store className="text-slate-400" size={24} />
            <span className="font-medium text-slate-700">가게 정보 수정</span>
          </button>
        )}
        <button onClick={handleLogout} className="flex items-center gap-3 p-4 active:bg-slate-50 transition-colors text-left">
          <LogOut className="text-rose-400" size={24} />
          <span className="font-medium text-rose-500">처음부터 다시 시작</span>
        </button>
      </div>

      {/* 가게 이름 입력 모달 */}
      <AnimatePresence>
        {isStoreModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsStoreModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-[320px] bg-white rounded-3xl shadow-2xl p-6"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <Store size={20} className="text-violet-600" /> 매장 이름 등록
                </h3>
                <button onClick={() => setIsStoreModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-4">사장님 뷰를 이용하시려면 운영 중인 매장 이름이 필요합니다.</p>
              <input 
                type="text" 
                value={storeNameInput}
                onChange={(e) => setStoreNameInput(e.target.value)}
                placeholder="예: 스타벅스 홍대점" 
                className="w-full bg-slate-50 border border-slate-200 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800 mb-4 text-sm"
                autoFocus
              />
              <button 
                onClick={() => handleSwitchRole('owner', storeNameInput)}
                disabled={isSwitching || !storeNameInput.trim()}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 rounded-xl disabled:opacity-50 transition-colors"
              >
                {isSwitching ? '등록 중...' : '사장님으로 전환'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 가게 정보 수정 모달 */}
      <AnimatePresence>
        {isEditStoreModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsEditStoreModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-[320px] bg-white rounded-3xl shadow-2xl p-6"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <Store size={20} className="text-violet-600" /> 가게 정보 수정
                </h3>
                <button onClick={() => setIsEditStoreModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
              
              <div className="mb-3">
                <label className="block text-xs font-bold text-slate-700 mb-1">가게 이름</label>
                <input 
                  type="text" 
                  value={editStoreNameInput}
                  onChange={(e) => setEditStoreNameInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800 text-sm"
                />
              </div>

              <div className="mb-3">
                <label className="block text-xs font-bold text-slate-700 mb-1">가게 지역 (예: 서울 강남구)</label>
                <input 
                  type="text" 
                  value={editStoreRegionInput}
                  onChange={(e) => setEditStoreRegionInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800 text-sm"
                />
              </div>

              <div className="mb-5">
                <label className="block text-xs font-bold text-slate-700 mb-1">가게 업종 (예: 카페)</label>
                <input 
                  type="text" 
                  value={editStoreIndustryInput}
                  onChange={(e) => setEditStoreIndustryInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800 text-sm"
                />
              </div>

              <button 
                onClick={handleUpdateStoreInfo}
                disabled={isUpdatingStore || !editStoreNameInput.trim() || !editStoreRegionInput.trim() || !editStoreIndustryInput.trim()}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 rounded-xl disabled:opacity-50 transition-colors"
              >
                {isUpdatingStore ? '저장 중...' : '정보 저장하기'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
