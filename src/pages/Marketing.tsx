import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Users, CheckCircle2, ChevronRight, Plus, PieChart as PieChartIcon, TrendingUp, X, Sparkles, Target, Share2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { getDisplayName } from '../lib/localProfile';

export default function Marketing() {
  const { user, storeName } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'insights' | 'marketing'>('insights');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [target, setTarget] = useState('');
  const [budget, setBudget] = useState(10000);
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [aiCopies, setAiCopies] = useState<string[]>([]);
  const [selectedCopyIndex, setSelectedCopyIndex] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [targetOptions, setTargetOptions] = useState<any[]>([
    { title: '최근 한 달간 뜸한 손님', desc: '재방문을 유도하기 좋은 타겟입니다.', count: 0 },
    { title: '단골 손님', desc: '신메뉴 반응을 테스트하기 좋은 타겟입니다.', count: 0 },
    { title: '주변 1km 내 신규 유저', desc: '매장을 모르는 잠재 고객입니다.', count: 0 }
  ]);
  const [latestCampaign, setLatestCampaign] = useState<any>(null);

  const fetchLatestCampaign = async () => {
    if (!user) return;
    try {
      const { data: campaigns } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .eq('store_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (campaigns && campaigns.length > 0) {
        setLatestCampaign(campaigns[0]);
      }
    } catch (e) {
      console.error('Failed to fetch latest campaign', e);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3000);
    
    async function fetchData() {
      try {
        const { data: insightsData } = await supabase
          .from('insights')
          .select('*')
          .order('created_at', { ascending: false });
          
        if (insightsData) setTrends(insightsData);

        if (user) {
          // Fetch Customers (Targets)
          const { data: customers } = await supabase
            .from('customers')
            .select('*')
            .eq('store_id', user.id);
            
          if (customers && customers.length > 0) {
            setTargetOptions(customers.map(c => ({
              title: c.segment,
              desc: c.description || '',
              count: c.customer_count
            })));
          }

          // Fetch Latest Campaign for ROAS
          await fetchLatestCampaign();
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
        clearTimeout(timer);
      }
    }
    fetchData();
    
    return () => clearTimeout(timer);
  }, [user]);

  const roasData = latestCampaign ? [
    { name: '쿠폰 사용(전환)', value: latestCampaign.roas_percentage || 0, color: '#8b5cf6' },
    { name: '미사용', value: Math.max(0, 1000 - (latestCampaign.roas_percentage || 0)), color: '#e2e8f0' },
  ] : [
    { name: '캠페인 없음', value: 1, color: '#e2e8f0' }
  ];

  const displayRoasPercent = latestCampaign ? ((latestCampaign.roas_percentage || 0) / 10).toFixed(1) : 0;
  const displayBudget = latestCampaign ? latestCampaign.budget : 0;
  const displayExtraRevenue = latestCampaign ? (latestCampaign.budget * (latestCampaign.roas_percentage || 0) / 100) : 0;

  const handleNext = () => { if (step < 3) setStep(step + 1); };
  const handleSend = async () => { 
    if (user && target && budget > 0) {
      try {
        const finalCopy = aiCopies[selectedCopyIndex] || '기본 발송 문구';
        // 1. 마케팅 캠페인 저장
        await supabase.from('marketing_campaigns').insert({
          store_id: user.id,
          target_audience: target,
          budget: budget,
          roas_percentage: Math.floor(Math.random() * 300) + 100, // 시뮬레이션된 예상 ROAS
          ai_copy: finalCopy
        });

        // 2. 동네생활에 자동 글쓰기 연동
        await supabase.from('posts').insert({
          user_id: user.id,
          title: `🎉 [${target} 전용] 깜짝 이벤트 혜택!`,
          content: `${finalCopy}\n\n(※이 글은 마케팅 탭에서 자동 발행되었습니다.)`,
          author_type: 'owner',
          author_name: getDisplayName(user),
          author_store_name: storeName || '우리동네 카페',
          likes_count: 0
        });

        // 3. 발송 후 즉시 성과 차트 업데이트
        await fetchLatestCampaign();
      } catch (err) {
        console.error(err);
      }
    }
    setStep(4); 
  };
  const closeWizard = () => {
    setIsWizardOpen(false);
    setStep(1);
    setTarget('');
    setBudget(10000);
    setAiCopies([]);
    setSelectedCopyIndex(0);
  };
  
  const generateAiCopy = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('marketing-copy-bot', {
        body: { target, budget }
      });
      if (!error && data?.success && data?.copies) {
        setAiCopies(data.copies);
      } else {
        console.error(error || data?.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen relative overflow-hidden bg-slate-900">
      {/* 탭 네비게이션 (최상단) */}
      <div className="absolute top-0 left-0 right-0 z-20 px-5 pt-4 pb-2 bg-gradient-to-b from-slate-900/90 to-transparent backdrop-blur-sm">
        <div className="flex items-center bg-slate-800/80 p-1 rounded-2xl border border-slate-700/50 backdrop-blur-md">
          <button 
            onClick={() => setActiveTab('insights')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${activeTab === 'insights' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            <Sparkles size={16} className={activeTab === 'insights' ? 'text-violet-600' : ''} /> 오픈 트렌드
          </button>
          <button 
            onClick={() => setActiveTab('marketing')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${activeTab === 'marketing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            <Target size={16} className={activeTab === 'marketing' ? 'text-violet-600' : ''} /> 타겟 마케팅
          </button>
        </div>
      </div>

      {/* 탭 콘텐츠 영역 */}
      <AnimatePresence mode="wait">
        {activeTab === 'insights' ? (
          <motion.div 
            key="insights"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute inset-0 flex flex-col h-[100dvh]"
          >
            <div className="flex-1 overflow-y-auto snap-y snap-mandatory no-scrollbar pb-20 pt-16">
              {loading ? (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                </div>
              ) : trends.length === 0 ? (
                <div className="flex-1 flex items-center justify-center h-full flex-col text-slate-400">
                  <Sparkles size={48} className="mb-4 opacity-50" />
                  <p>아직 AI가 생성한 인사이트가 없습니다.</p>
                </div>
              ) : trends.map((trend) => (
                <div key={trend.id} className="w-full h-full snap-start snap-always relative flex flex-col justify-end">
                  <div className="absolute inset-0 z-0 bg-slate-800">
                    <img src={trend.image_url || "https://images.unsplash.com/photo-1542843137-87f188328908?q=80&w=600&auto=format&fit=crop"} alt={trend.title} className="w-full h-full object-cover opacity-60" />
                    <div className={`absolute inset-0 bg-gradient-to-t ${trend.color_theme || 'from-violet-600 to-indigo-800'} mix-blend-multiply opacity-80`} />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />
                  </div>
                  <div className="relative z-10 p-6 pb-8">
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, margin: "-20%" }} transition={{ duration: 0.5 }}>
                      <div className="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-bold mb-4 border border-white/30">
                        {trend.tag}
                      </div>
                      <h2 className="text-3xl font-bold text-white mb-4 leading-tight tracking-tight shadow-sm">
                        {trend.title}
                      </h2>
                      <p className="text-slate-300 text-[15px] leading-relaxed mb-6 font-medium">
                        {trend.description}
                      </p>
                      <div className="flex gap-3">
                        <button onClick={() => setActiveTab('marketing')} className="flex-1 bg-white text-slate-900 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl hover:scale-[1.02] active:scale-95 transition-transform">
                          이 내용으로 타겟 마케팅하기 <ChevronRight size={18} />
                        </button>
                        <button className="w-14 h-14 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-2xl flex items-center justify-center active:scale-95 transition-transform shadow-xl">
                          <Share2 size={20} />
                        </button>
                      </div>
                    </motion.div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="marketing"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="absolute inset-0 bg-slate-50 flex flex-col overflow-y-auto pb-24 pt-20 px-5"
          >
            {/* 타겟 마케팅 대시보드 */}
            <div className="flex flex-col gap-5">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center">
                <h2 className="text-sm font-bold text-slate-800 w-full flex items-center gap-2 mb-2">
                  <PieChartIcon size={18} className="text-violet-600" /> 최근 캠페인 성과 (전환율)
                </h2>
                <div className="w-full h-[180px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={roasData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                        {roasData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-slate-800">{displayRoasPercent}%</span>
                    <span className="text-[10px] text-slate-400">전환율</span>
                  </div>
                </div>
                
                <div className="w-full bg-violet-50 rounded-xl p-4 flex items-start gap-3 mt-2">
                  <div className="bg-violet-100 text-violet-600 p-2 rounded-lg"><TrendingUp size={20} /></div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 leading-tight">광고비 {(displayBudget/10000).toLocaleString()}만원 대비<br/><span className="text-violet-600">{displayExtraRevenue.toLocaleString()}원</span>의 추가 매출 발생!</p>
                    <p className="text-xs text-slate-500 mt-1">ROAS: {latestCampaign ? latestCampaign.roas_percentage : 0}%</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setIsWizardOpen(true)}
                className="w-full bg-violet-600 hover:bg-violet-700 active:scale-95 transition-all text-white font-bold text-lg py-4 rounded-2xl shadow-lg shadow-violet-200 flex items-center justify-center gap-2"
              >
                <Plus size={24} /> 새 타겟팅 광고 시작하기
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 마법사 UI 모달 형태 */}
      <AnimatePresence>
        {isWizardOpen && (
          <motion.div 
            initial={{ opacity: 0, y: "100%" }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-50 bg-white flex flex-col"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white pt-safe">
              <h2 className="font-bold text-lg text-slate-800">새 광고 만들기</h2>
              <button onClick={closeWizard} className="text-slate-400 hover:text-slate-800 p-2 bg-slate-50 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 pb-24 flex flex-col">
              {/* Progress Wizard */}
              {step < 4 && (
                <div className="flex items-center justify-between mb-8 relative px-4 mt-2">
                  <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-slate-100 -z-10 -translate-y-1/2"></div>
                  <div className={`absolute top-1/2 left-4 h-0.5 bg-violet-600 -z-10 -translate-y-1/2 transition-all duration-500`} style={{ width: `calc(${(step - 1) * 50}% - 16px)` }}></div>
                  
                  {[1, 2, 3].map((num) => (
                    <div key={num} className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${step >= num ? 'bg-violet-600 text-white shadow-md shadow-violet-200 scale-110' : 'bg-white text-slate-300 border-2 border-slate-100'}`}>
                      {num}
                    </div>
                  ))}
                </div>
              )}

              {/* Wizard Content */}
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col">
                    <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center"><Users size={16}/></div> 
                      누구에게 광고할까요?
                    </h2>
                    <div className="grid gap-4 flex-1">
                      {targetOptions.map((item) => (
                        <button 
                          key={item.title} 
                          onClick={() => { setTarget(item.title); handleNext(); }}
                          className="bg-white p-5 rounded-2xl border-2 border-slate-100 hover:border-violet-600 shadow-sm text-left transition-all active:scale-95 group flex flex-col"
                        >
                          <div className="flex justify-between items-center w-full mb-1">
                            <span className="font-bold text-slate-800 text-[15px] group-hover:text-violet-700">{item.title}</span>
                            <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-md group-hover:bg-violet-100 group-hover:text-violet-600">{item.count}명</span>
                          </div>
                          <span className="text-sm text-slate-500">{item.desc}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col">
                    <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center">💰</div> 
                      일 예산을 설정해주세요
                    </h2>
                    
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6">
                      <div className="text-center mb-8">
                        <p className="text-slate-500 text-sm font-medium mb-1">하루에 최대</p>
                        <p className="text-4xl font-bold text-violet-600">{budget.toLocaleString()}원</p>
                      </div>
                      
                      <input 
                        type="range" 
                        min="5000" 
                        max="50000" 
                        step="5000"
                        value={budget} 
                        onChange={(e) => setBudget(Number(e.target.value))}
                        className="w-full accent-violet-600 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer mb-6"
                      />
                      
                      <div className="bg-slate-50 rounded-2xl p-4 flex justify-between items-center">
                        <span className="text-sm text-slate-600 font-medium">예상 도달 인원</span>
                        <span className="font-bold text-slate-800">{Math.floor(budget / 100)}명 ~ {Math.floor(budget / 50)}명</span>
                      </div>
                    </div>
                    
                    <div className="mt-auto">
                      <button 
                        onClick={handleNext}
                        className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-transform"
                      >
                        다음 단계로
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col">
                    <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center"><Send size={16}/></div> 
                      최종 배포 전 확인
                    </h2>
                    
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6 flex-1 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-violet-500 to-indigo-500"></div>
                      
                      <div className="mb-5 pb-5 border-b border-slate-100 border-dashed">
                        <p className="text-xs text-slate-400 font-medium mb-1">타겟 대상</p>
                        <p className="font-bold text-slate-800">{target}</p>
                      </div>
                      
                      <div className="mb-5 pb-5 border-b border-slate-100 border-dashed">
                        <p className="text-xs text-slate-400 font-medium mb-1">일 예산</p>
                        <p className="font-bold text-violet-600">{budget.toLocaleString()}원</p>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 relative">
                        <div className="absolute -top-3 left-4 bg-slate-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                          쿠폰 미리보기 (택 1)
                        </div>
                        
                        {aiCopies.length > 0 ? (
                          <div className="flex flex-col gap-2 mt-2">
                            {aiCopies.map((copy, idx) => (
                              <button 
                                key={idx}
                                onClick={() => setSelectedCopyIndex(idx)}
                                className={`text-left text-xs leading-relaxed p-3 rounded-xl border transition-all ${selectedCopyIndex === idx ? 'bg-violet-50 border-violet-500 text-violet-800 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300'}`}
                              >
                                {copy}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 text-center p-6 bg-white rounded-xl border border-slate-200">
                            {isGenerating ? (
                              <div className="flex flex-col items-center gap-3">
                                <div className="w-6 h-6 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
                                <span className="text-xs font-bold text-violet-600">AI가 매력적인 문구를 작성하고 있어요...</span>
                              </div>
                            ) : (
                              <button 
                                onClick={generateAiCopy}
                                className="bg-violet-100 text-violet-700 font-bold px-4 py-2 rounded-xl text-sm flex items-center justify-center gap-2 mx-auto hover:bg-violet-200 transition-colors"
                              >
                                <Sparkles size={16} /> AI 광고 문구 3개 추천받기
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <button 
                      onClick={handleSend}
                      className="w-full bg-violet-600 text-white font-bold text-lg py-4 rounded-2xl shadow-lg shadow-violet-200 active:scale-95 transition-transform flex items-center justify-center gap-2"
                    >
                      <Send size={20} /> 광고 집행하기
                    </button>
                  </motion.div>
                )}

                {step === 4 && (
                  <motion.div key="step4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col items-center justify-center text-center">
                    <motion.div 
                      initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}
                      className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center text-white mb-6 shadow-lg shadow-emerald-200"
                    >
                      <CheckCircle2 size={48} />
                    </motion.div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">광고 집행 완료!</h2>
                    <p className="text-slate-500 mb-8 max-w-[250px] font-medium leading-relaxed">
                      설정하신 타겟에게 쿠폰 배포가 시작되었습니다. 성과는 대시보드에서 실시간으로 확인하세요!
                    </p>
                    
                    <button 
                      onClick={closeWizard}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold active:scale-95 transition-transform shadow-lg"
                    >
                      대시보드로 돌아가기
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
