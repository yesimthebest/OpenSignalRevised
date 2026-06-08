import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Store, User, ArrowRight } from 'lucide-react';
import { writeLocalProfile } from '../lib/localProfile';

export default function Onboarding() {
  const { user, setUserRole, setStoreName, setStoreRegion, setStoreIndustry } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  const [step, setStep] = useState<'role_selection' | 'store_input'>('store_input');
  const [storeNameInput, setStoreNameInput] = useState('');
  const [storeRegionInput, setStoreRegionInput] = useState('');
  const [storeIndustryInput, setStoreIndustryInput] = useState('');

  const handleSelectRole = async (role: 'customer') => {
    submitRole(role, null, null, null);
  };

  const handleOwnerNext = () => {
    setStep('store_input');
  };

  const submitRole = async (role: 'owner' | 'customer', storeName: string | null, storeRegion: string | null, storeIndustry: string | null) => {
    if (!user) return;
    setIsSubmitting(true);
    setErrorMessage('');
    
    try {
      writeLocalProfile({
        role,
        storeName,
        storeRegion,
        storeIndustry,
      });

      const { error } = await supabase.from('profiles').upsert([
        { id: user.id, role: role, store_name: storeName, store_region: storeRegion, store_industry: storeIndustry }
      ]);
      if (error) console.warn('Profile sync skipped:', error);
      
      setStoreName(storeName);
      setStoreRegion(storeRegion);
      setStoreIndustry(storeIndustry);
      setUserRole(role);
    } catch (error: any) {
      console.error('Error saving role:', error);
      setErrorMessage(`오류: ${error.message || '알 수 없는 오류가 발생했습니다.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen items-center justify-center p-6">
      <AnimatePresence mode="wait">
        {step === 'role_selection' ? (
          <motion.div 
            key="role_selection"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-8 text-center"
          >
            <h1 className="text-2xl font-bold text-slate-800 mb-2">환영합니다! 🎉</h1>
            <p className="text-slate-500 mb-8 text-sm">어떤 목적으로 내:일을 찾아주셨나요?</p>

            <div className="flex flex-col gap-4">
              <button 
                onClick={handleOwnerNext}
                className="flex items-center gap-4 p-5 border-2 border-violet-100 rounded-2xl hover:border-violet-500 hover:bg-violet-50 transition-colors text-left group"
              >
                <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-full flex items-center justify-center group-hover:bg-violet-500 group-hover:text-white transition-colors">
                  <Store size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">사장님입니다</h3>
                  <p className="text-xs text-slate-500">매장 운영, 마케팅, 수요 예측</p>
                </div>
              </button>

              <button 
                onClick={() => handleSelectRole('customer')}
                disabled={isSubmitting}
                className="flex items-center gap-4 p-5 border-2 border-emerald-100 rounded-2xl hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-left group disabled:opacity-50"
              >
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">손님입니다</h3>
                  <p className="text-xs text-slate-500">동네 혜택, 단골 매장 소식</p>
                </div>
              </button>
            </div>
            
            {errorMessage && (
              <div className="mt-6 p-4 bg-rose-50 text-rose-600 text-sm font-medium rounded-xl text-left break-words">
                {errorMessage}
              </div>
            )}

            <button 
              onClick={() => setStep('store_input')}
              className="mt-6 text-sm text-slate-400 underline hover:text-slate-600"
            >
              가게 정보 입력하기
            </button>
          </motion.div>
        ) : (
          <motion.div 
            key="store_input"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-8"
          >
            <h1 className="text-2xl font-bold text-slate-800 mb-2">사장님, 반가워요!</h1>
            <p className="text-slate-500 mb-8 text-sm">운영 중이신 매장 이름을 알려주세요.</p>

            <div className="mb-4">
              <label className="block text-sm font-bold text-slate-700 mb-2">가게 이름</label>
              <input 
                type="text" 
                value={storeNameInput}
                onChange={(e) => setStoreNameInput(e.target.value)}
                placeholder="예: 스타벅스 홍대점" 
                className="w-full bg-slate-50 border border-slate-200 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800"
                autoFocus
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-bold text-slate-700 mb-2">가게 지역</label>
              <input 
                type="text" 
                value={storeRegionInput}
                onChange={(e) => setStoreRegionInput(e.target.value)}
                placeholder="예: 서울 강남구, 경기 성남시" 
                className="w-full bg-slate-50 border border-slate-200 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">업종</label>
              <input 
                type="text" 
                value={storeIndustryInput}
                onChange={(e) => setStoreIndustryInput(e.target.value)}
                placeholder="예: 카페, 빵집, 미용실" 
                className="w-full bg-slate-50 border border-slate-200 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800"
              />
            </div>

            {errorMessage && (
              <div className="mb-6 p-4 bg-rose-50 text-rose-600 text-sm font-medium rounded-xl text-left break-words">
                {errorMessage}
              </div>
            )}

            <button 
              onClick={() => submitRole('owner', storeNameInput, storeRegionInput, storeIndustryInput)}
              disabled={isSubmitting || !storeNameInput.trim() || !storeRegionInput.trim() || !storeIndustryInput.trim()}
              className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 rounded-xl disabled:opacity-50 disabled:bg-slate-300 transition-colors"
            >
              {isSubmitting ? '설정 중...' : '시작하기'} <ArrowRight size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
