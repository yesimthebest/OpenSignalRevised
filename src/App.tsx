import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Home as HomeIcon, Users, BarChart3, Settings, User } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import Home from './pages/Home';
import Community from './pages/Community';
import Marketing from './pages/Marketing';
import Manage from './pages/Manage';
import My from './pages/My';
import Pricing from './pages/Pricing';
import ScrollToTop from './components/ScrollToTop';
function BottomNav({ isOwner }: { isOwner: boolean }) {
  const location = useLocation();
  const navItems = isOwner ? [
    { path: '/', label: '홈', icon: HomeIcon },
    { path: '/community', label: '동네생활', icon: Users },
    { path: '/marketing', label: '마케팅', icon: BarChart3 },
    { path: '/manage', label: '운영', icon: Settings },
    { path: '/my', label: '마이', icon: User },
  ] : [
    { path: '/', label: '홈', icon: HomeIcon },
    { path: '/community', label: '동네생활', icon: Users },
    { path: '/my', label: '마이', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white border-t border-slate-200 pb-safe pt-2 px-4 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-50">
      <ul className="flex justify-between items-center mb-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <li key={item.path} className="flex-1">
              <Link 
                to={item.path} 
                className="flex flex-col items-center gap-1 p-2 w-full touch-manipulation no-underline"
              >
                <div className={`relative p-1 rounded-full transition-colors ${isActive ? 'text-violet-600' : 'text-slate-400'}`}>
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                  {isActive && (
                    <motion.div 
                      layoutId="nav-pill" 
                      className="absolute inset-0 bg-violet-100 rounded-full -z-10"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </div>
                <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-violet-600' : 'text-slate-400'}`}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store/authStore';
import Onboarding from './pages/Onboarding';
import CustomerHome from './pages/CustomerHome';
import { createLocalGuestUser, getOrCreateGuestNickname, readLocalProfile } from './lib/localProfile';

function App() {
  const { user, userRole, setSession, setUser, setUserRole, setStoreName, setStoreRegion, setStoreIndustry } = useAuthStore();
  const [isAppLoading, setIsAppLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const initializeAuth = async () => {
      try {
        let { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!session?.user) {
          const nickname = getOrCreateGuestNickname();
          try {
            const { data, error: anonymousError } = await supabase.auth.signInAnonymously({
              options: {
                data: { full_name: nickname },
              },
            });
            if (anonymousError) {
              console.warn('Anonymous auth unavailable, using local guest user:', anonymousError.message);
              session = null;
              if (isMounted) {
                setSession(null);
                setUser(createLocalGuestUser());
              }
            } else {
              session = data.session;
            }
          } catch (anonymousError: any) {
            console.warn('Anonymous auth unavailable, using local guest user:', anonymousError?.message || anonymousError);
            session = null;
            if (isMounted) {
              setSession(null);
              setUser(createLocalGuestUser());
            }
          }
        }
        
        if (isMounted) {
          setSession(session);
          setUser(session?.user || useAuthStore.getState().user || null);
        }
        
        const activeUser = session?.user || useAuthStore.getState().user;

        if (activeUser) {
          const localProfile = readLocalProfile();
          if (localProfile.role) {
            setUserRole(localProfile.role);
            setStoreName(localProfile.storeName);
            setStoreRegion(localProfile.storeRegion);
            setStoreIndustry(localProfile.storeIndustry);
            return;
          }

          const { data, error: profileError } = await supabase
            .from('profiles')
            .select('role, store_name, store_region, store_industry')
            .eq('id', activeUser.id)
            .single();
            
          if (isMounted) {
            if (!profileError && data) {
              setUserRole(data.role);
              setStoreName(data.store_name);
              setStoreRegion(data.store_region);
              setStoreIndustry(data.store_industry);
            } else {
              setUserRole(null);
              setStoreName(null);
              setStoreRegion(null);
              setStoreIndustry(null);
            }
          }
        } else if (isMounted) {
          setUserRole(null);
          setStoreName(null);
          setStoreRegion(null);
          setStoreIndustry(null);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
      } finally {
        // StrictMode 등에서 isMounted가 false가 되더라도
        // 무조건 한 번은 로딩을 해제하여 무한 로딩을 방지합니다.
        setIsAppLoading(false);
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(session);
        setUser(session?.user || null);
        
        if (session?.user) {
          supabase.from('profiles').select('role, store_name, store_region, store_industry').eq('id', session.user.id).single()
            .then(({ data, error }) => {
              if (isMounted && !error && data) {
                setUserRole(data.role);
                setStoreName(data.store_name);
                setStoreRegion(data.store_region);
                setStoreIndustry(data.store_industry);
              }
            });
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setUserRole(null);
        setStoreName(null);
        setStoreRegion(null);
        setStoreIndustry(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [setSession, setUser, setUserRole, setStoreName, setStoreRegion, setStoreIndustry]);

  if (isAppLoading) {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 min-h-screen items-center justify-center">
        <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-500 font-medium">내:일 시작하는 중...</p>
      </div>
    );
  }

  if (!user || !userRole) {
    return <Onboarding />;
  }

  const isOwner = userRole === 'owner';

  return (
    <Router>
      <ScrollToTop />
      <main className="flex-1 flex flex-col relative w-full h-full bg-slate-50 overflow-y-auto no-scrollbar pb-20">
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={isOwner ? <Home /> : <CustomerHome />} />
            <Route path="/community" element={<Community />} />
            {isOwner && <Route path="/pricing" element={<Pricing />} />}
            {isOwner && <Route path="/marketing" element={<Marketing />} />}
            {isOwner && <Route path="/manage" element={<Manage />} />}
            <Route path="/my" element={<My />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
        <BottomNav isOwner={isOwner} />
      </main>
    </Router>
  );
}

export default App;
