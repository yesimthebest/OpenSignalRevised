import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CloudRain, TrendingUp, ChevronRight, Sun, Cloud, Snowflake, X, ReceiptText, Circle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import {
  getNextCleanupDateLabel,
  getWeekRange,
  isMissingTableError,
  proofTaskTitles,
  readStoredExpenses,
  readStoredProofItems,
  type ExpenseRecord,
  type WeeklyProofChecklist,
} from '../lib/proofRoutine';

const defaultChartData = [
  { time: '월', visitors: 110 },
  { time: '화', visitors: 95 },
  { time: '수', visitors: 120 },
  { time: '목', visitors: 145 }, 
  { time: '금', visitors: 280 }, 
  { time: '토', visitors: 310 },
  { time: '일', visitors: 250 },
];

type DailyBusinessLog = {
  id: string;
  log_date: string;
  total_sales_amount: number;
  customer_count: number;
  weather: string;
  special_event_memo: string | null;
  business_memo: string | null;
  source: 'manual' | 'pos' | 'card_import';
};

type TomorrowAction = {
  id: string;
  title: string;
  reason: string;
  confidence: 'High' | 'Medium' | 'Low';
};

const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: getLocalDateString(start),
    end: getLocalDateString(end),
  };
};

const formatWon = (amount: number) => `${amount.toLocaleString()}원`;

const getTomorrowDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
};

const getTomorrowActionStorageKey = (storeId: string, date: string) => `openSignal.tomorrowActions.${storeId}.${date}`;

const readCompletedTomorrowActions = (storeId: string, date: string) => {
  try {
    return JSON.parse(localStorage.getItem(getTomorrowActionStorageKey(storeId, date)) || '[]') as string[];
  } catch {
    return [];
  }
};

const writeCompletedTomorrowActions = (storeId: string, date: string, actionIds: string[]) => {
  localStorage.setItem(getTomorrowActionStorageKey(storeId, date), JSON.stringify(actionIds));
};

const getDemoLogStorageKey = (storeId: string) => `openSignal.dailyBusinessLogs.${storeId}`;

const readDemoLogs = (storeId: string) => {
  try {
    return JSON.parse(localStorage.getItem(getDemoLogStorageKey(storeId)) || '[]') as DailyBusinessLog[];
  } catch {
    return [];
  }
};

const isMissingDailyLogsTable = (error: any) =>
  error?.message?.includes('daily_business_logs') ||
  error?.message?.includes('schema cache') ||
  error?.code === 'PGRST205';

export default function Home() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [expectedVisitors, setExpectedVisitors] = useState<number | string>('-');
  const [weatherCond, setWeatherCond] = useState('맑음');
  const [eventFactors, setEventFactors] = useState('특이사항 없음');
  const [eventFactorsDetail, setEventFactorsDetail] = useState('');
  const [showInsightModal, setShowInsightModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<any[]>([]);
  const [weeklyChartData, setWeeklyChartData] = useState(defaultChartData);
  const [weeklyWeatherData, setWeeklyWeatherData] = useState<{date: string, dow: string, condition: string}[]>([]);
  const [isWeatherModalOpen, setIsWeatherModalOpen] = useState(false);
  const [businessLogs, setBusinessLogs] = useState<DailyBusinessLog[]>([]);
  const [expenseRecords, setExpenseRecords] = useState<ExpenseRecord[]>([]);
  const [proofSummary, setProofSummary] = useState({
    completionRate: 0,
    missingExpenseCount: 0,
    nextCleanupDate: getNextCleanupDateLabel(),
  });
  const tomorrowDate = getLocalDateString(getTomorrowDate());
  const [completedTomorrowActions, setCompletedTomorrowActions] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    setCompletedTomorrowActions(readCompletedTomorrowActions(user.id, tomorrowDate));
  }, [user?.id, tomorrowDate]);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3000);

    async function fetchData() {
      if (!user) return;
      const storeId = user.id;

      try {
        setLoading(true);

        // 1. 하루 1번만 실시간 데이터 갱신 (캐싱 로직)
        let shouldInvoke = true;
        const { data: latestForecast, error: checkErr } = await supabase
          .from('forecasts')
          .select('created_at')
          .eq('store_id', storeId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!checkErr && latestForecast?.created_at) {
          const createdAt = new Date(latestForecast.created_at);
          const now = new Date();
          // 오늘 날짜에 이미 생성된 데이터가 있다면 API 호출 생략 (크레딧 절약)
          if (createdAt.toDateString() === now.toDateString()) {
            shouldInvoke = false;
          }
        }

        if (shouldInvoke) {
          await supabase.functions.invoke('daily-insight-bot', {
            body: { store_id: storeId }
          });
        }

        // 2. Fetch latest forecast (내일 데이터)
        const { data: forecastData, error: fError } = await supabase
          .from('forecasts')
          .select('*')
          .eq('store_id', storeId)
          .order('target_date', { ascending: true }) // 다가오는 날짜 순
          .limit(1); // 내일(0번째)

        if (!fError && forecastData && forecastData.length > 0) {
          const tomorrow = forecastData[0]; // 0번째가 내일
          setExpectedVisitors(tomorrow.expected_visitors);
          setWeatherCond(tomorrow.weather_condition);
          setEventFactors(tomorrow.event_factors || '특이사항 없음');
          setEventFactorsDetail(tomorrow.event_factors_detail || '상세 정보가 제공되지 않았습니다.');
        }

        // 3. Fetch NEXT 7 days forecasts for the chart and weather modal
        const { data: chartData, error: chartError } = await supabase
          .from('forecasts')
          .select('target_date, expected_visitors, weather_condition')
          .eq('store_id', storeId)
          .order('target_date', { ascending: true }) // 미래 날짜 순서대로 (오늘 -> 미래)
          .limit(7);
          
        if (!chartError && chartData && chartData.length > 0) {
          // 요일 변환 함수
          const getDayName = (dateStr: string) => {
            const days = ['일', '월', '화', '수', '목', '금', '토'];
            return days[new Date(dateStr).getDay()];
          };
          
          const formattedChartData = chartData.map(item => ({
            time: getDayName(item.target_date),
            visitors: item.expected_visitors
          }));
          
          const formattedWeatherData = chartData.map(item => ({
            date: item.target_date,
            dow: getDayName(item.target_date),
            condition: item.weather_condition || '맑음'
          }));

          setWeeklyChartData(formattedChartData);
          setWeeklyWeatherData(formattedWeatherData);
        }

        // 3. Fetch recent insights for bottom section
        const { data: insightsData, error: iError } = await supabase
          .from('insights')
          .select('*')
          .eq('store_id', storeId)
          .order('created_at', { ascending: false })
          .limit(2);

        if (!iError && insightsData) {
          setInsights(insightsData);
        }

        const { start, end } = getMonthRange();
        const { data: logData, error: logError } = await supabase
          .from('daily_business_logs')
          .select('id, log_date, total_sales_amount, customer_count, weather, special_event_memo, business_memo, source')
          .eq('store_id', storeId)
          .gte('log_date', start)
          .lte('log_date', end)
          .order('log_date', { ascending: false });

        if (logError && isMissingDailyLogsTable(logError)) {
          const logs = readDemoLogs(storeId);
          setBusinessLogs(logs);

        } else if (!logError && logData) {
          const logs = logData as DailyBusinessLog[];
          setBusinessLogs(logs);
        }

        const weekRange = getWeekRange();
        const { data: proofData, error: proofError } = await supabase
          .from('weekly_proof_checklists')
          .select('id, week_start, task_title, is_completed')
          .eq('store_id', storeId)
          .eq('week_start', weekRange.start);

        const proofItems = proofError && isMissingTableError(proofError)
          ? readStoredProofItems(storeId, weekRange.start)
          : ((proofData || proofTaskTitles.map((taskTitle) => ({
              id: `${weekRange.start}-${taskTitle}`,
              week_start: weekRange.start,
              task_title: taskTitle,
              is_completed: false,
            }))) as WeeklyProofChecklist[]);

        const { data: expenseData, error: expenseError } = await supabase
          .from('expenses')
          .select('id, expense_date, category, amount, vendor, memo, receipt_status, recurring_template_id')
          .eq('store_id', storeId)
          .gte('expense_date', start)
          .lte('expense_date', end);

        const weeklyExpenses = expenseError && isMissingTableError(expenseError)
          ? readStoredExpenses(storeId).filter((expense) => expense.expense_date >= weekRange.start && expense.expense_date <= weekRange.end)
          : ((expenseData || []) as ExpenseRecord[]).filter((expense) => expense.expense_date >= weekRange.start && expense.expense_date <= weekRange.end);
        const monthlyExpenses = expenseError && isMissingTableError(expenseError)
          ? readStoredExpenses(storeId).filter((expense) => expense.expense_date >= start && expense.expense_date <= end)
          : ((expenseData || []) as ExpenseRecord[]);
        setExpenseRecords(monthlyExpenses);
        const completedProofCount = proofItems.filter((item) => item.is_completed).length;
        setProofSummary({
          completionRate: proofItems.length > 0 ? Math.round((completedProofCount / proofItems.length) * 100) : 0,
          missingExpenseCount: weeklyExpenses.filter((expense) => expense.receipt_status === 'missing' || expense.receipt_status === 'pending').length,
          nextCleanupDate: getNextCleanupDateLabel(),
        });
      } catch (err) {
        console.error("데이터 로드 실패:", err);
      } finally {
        setLoading(false);
        clearTimeout(timer);
      }
    }

    if (user) {
      fetchData();
    }
  }, [user]);

  const getWeatherIcon = (cond: string) => {
    if (cond.includes('비')) return <CloudRain size={16} className="text-blue-500" />;
    if (cond.includes('눈')) return <Snowflake size={16} className="text-blue-300" />;
    if (cond.includes('구름') || cond.includes('흐림')) return <Cloud size={16} className="text-slate-500" />;
    return <Sun size={16} className="text-orange-500" />;
  };

  const monthlySalesTotal = businessLogs.reduce((sum, log) => sum + (log.total_sales_amount || 0), 0);
  const monthlyCustomerTotal = businessLogs.reduce((sum, log) => sum + (log.customer_count || 0), 0);
  const monthlyExpenseTotal = expenseRecords.reduce((sum, expense) => sum + (expense.amount || 0), 0);
  const averageTicket = monthlyCustomerTotal > 0 ? Math.round(monthlySalesTotal / monthlyCustomerTotal) : null;
  const latestLog = businessLogs[0];
  const memoText = `${latestLog?.special_event_memo || ''} ${latestLog?.business_memo || ''} ${latestLog?.weather || ''}`;
  const recentLogs = businessLogs.slice(0, 7);
  const recentAverageSales = recentLogs.length > 0
    ? Math.round(recentLogs.reduce((sum, log) => sum + log.total_sales_amount, 0) / recentLogs.length)
    : 0;
  const tomorrowDayLabel = dayLabels[getTomorrowDate().getDay()];

  const tomorrowActions = (() => {
    if (!latestLog) {
      return [
        {
          id: 'record-first-log',
          title: '오늘 매출과 메모 먼저 남기기',
          reason: '최근 기록이 아직 없어 내일 추천 정확도가 낮아요.',
          confidence: 'Low' as const,
        },
        {
          id: 'check-tomorrow-weather',
          title: '내일 날씨에 맞는 대표 메뉴 고르기',
          reason: `내일 날씨가 ${weatherCond}로 잡혀 있어 날씨 기준 준비부터 할 수 있어요.`,
          confidence: 'Low' as const,
        },
      ];
    }

    const actions: TomorrowAction[] = [];
    const addAction = (action: TomorrowAction) => {
      if (!actions.some((item) => item.id === action.id)) {
        actions.push(action);
      }
    };
    const hasRainSignal = memoText.includes('비') || latestLog.weather === '비' || weatherCond.includes('비');
    const hasStockoutSignal = memoText.includes('품절') || memoText.includes('재고') || memoText.includes('소진');
    const hasStaffSignal = memoText.includes('알바') || memoText.includes('직원') || memoText.includes('결근') || memoText.includes('단체');
    const hasEventSignal = memoText.includes('학교') || memoText.includes('축제') || memoText.includes('행사') || memoText.includes('시험');
    const latestSalesGap = recentAverageSales > 0
      ? Math.round(((latestLog.total_sales_amount - recentAverageSales) / recentAverageSales) * 100)
      : 0;

    if (hasRainSignal) {
      addAction({
        id: 'rain-menu-focus',
        title: '비 오는 날 잘 팔리는 메뉴 강조',
        reason: `내일 날씨가 ${weatherCond}이고 최근 기록에도 비 영향이 보여요.`,
        confidence: weatherCond.includes('비') ? 'High' : 'Medium',
      });
    }

    if (hasStockoutSignal) {
      addAction({
        id: 'stockout-menu-front',
        title: '재고 소진 메뉴 전면 배치',
        reason: '최근 메모에 품절이나 재고 소진 신호가 있어요.',
        confidence: 'High',
      });
    }

    if (hasStaffSignal || latestSalesGap >= 15) {
      addAction({
        id: 'extra-staff-check',
        title: '알바 1명 추가 고려',
        reason: hasStaffSignal
          ? '최근 메모에 인력이나 단체 손님 이슈가 남아 있어요.'
          : `최근 평균보다 매출이 ${latestSalesGap}% 높아 바쁜 흐름일 수 있어요.`,
        confidence: hasStaffSignal ? 'Medium' : 'Low',
      });
    }

    if (hasEventSignal) {
      addAction({
        id: 'event-best-menu-front',
        title: '잘 팔린 메뉴를 계산대 근처에 배치',
        reason: '최근 메모에 학교, 행사, 시험 같은 외부 요인이 기록됐어요.',
        confidence: 'Medium',
      });
    }

    if (recentAverageSales > 0 && latestSalesGap <= -15) {
      addAction({
        id: 'reduce-order-ten',
        title: '발주량 10% 줄이기',
        reason: `최근 평균보다 마지막 매출이 ${Math.abs(latestSalesGap)}% 낮았어요.`,
        confidence: recentLogs.length >= 5 ? 'Medium' : 'Low',
      });
    }

    if ((tomorrowDayLabel === '금' || tomorrowDayLabel === '토') && !hasRainSignal) {
      addAction({
        id: 'weekend-prep',
        title: '인기 메뉴 재료를 조금 넉넉히 준비',
        reason: `내일은 ${tomorrowDayLabel}요일이라 평일보다 주문이 몰릴 수 있어요.`,
        confidence: 'Medium',
      });
    }

    if (actions.length < 2) {
      addAction({
        id: 'memo-based-menu-check',
        title: '마감 메모 기준으로 메뉴판 순서 점검',
        reason: latestLog.business_memo || latestLog.special_event_memo
          ? '최근 메모가 있어 내일 준비 항목을 좁혀볼 수 있어요.'
          : '최근 매출 기록은 있지만 특이사항 메모가 적어 추천 근거가 아직 적어요.',
        confidence: latestLog.business_memo || latestLog.special_event_memo ? 'Medium' : 'Low',
      });
    }

    if (actions.length < 2) {
      addAction({
        id: 'customer-count-check',
        title: '손님 수와 객단가 같이 확인',
        reason: latestLog.customer_count > 0
          ? '최근 손님 수가 있어 내일 마감 때 객단가 변화를 바로 볼 수 있어요.'
          : '손님 수 기록이 비어 있어 매출 변화의 이유를 나누기 어려워요.',
        confidence: latestLog.customer_count > 0 ? 'Medium' : 'Low',
      });
    }

    return actions.slice(0, 3);
  })();

  const toggleTomorrowAction = (actionId: string) => {
    if (!user) return;
    const nextCompletedActions = completedTomorrowActions.includes(actionId)
      ? completedTomorrowActions.filter((id) => id !== actionId)
      : [...completedTomorrowActions, actionId];

    setCompletedTomorrowActions(nextCompletedActions);
    writeCompletedTomorrowActions(user.id, tomorrowDate, nextCompletedActions);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex-1 flex flex-col p-5 pb-24 h-full min-h-screen"
    >
      {/* Header */}
      <header className="mb-6 mt-2">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold text-slate-800">오픈시그널</h1>
          <button 
            onClick={() => setIsWeatherModalOpen(true)}
            className="flex items-center gap-1 bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {getWeatherIcon(weatherCond)}
            <span>내일 {weatherCond}</span>
          </button>
        </div>
        <div className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingUp size={80} />
          </div>
          <p className="text-violet-100 font-medium mb-1 flex items-center gap-2">
            내일 예상 방문객은
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-4xl font-bold tracking-tight">{expectedVisitors.toLocaleString()}</h2>
            <span className="text-xl font-medium text-violet-200">명 입니다</span>
          </div>
          <div className="mt-4 pt-4 border-t border-white/20 flex flex-col gap-2">
            {eventFactors !== '특이사항 없음' && (
              <button 
                onClick={() => setShowInsightModal(true)}
                className="w-full text-left text-sm font-medium bg-white/20 px-3 py-2 rounded-xl flex items-center gap-2 shadow-sm backdrop-blur-sm hover:bg-white/30 transition-colors active:scale-[0.98]"
              >
                <span className="text-yellow-300 flex-shrink-0">✨ AI 인사이트</span>
                <span className="truncate">{eventFactors}</span>
              </button>
            )}
            {weatherCond.includes('비') && (
              <div className="text-xs font-medium bg-rose-500/30 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm backdrop-blur-sm">
                <CloudRain size={14} className="text-rose-200" /> 
                내일 우천 시 객수 감소 가능성 있음 (배달 집중 추천)
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Demand Forecast Chart */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            향후 일주일 예상 방문객 추이
          </h3>
          <div className="group relative">
            <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold cursor-help hover:bg-slate-300 transition-colors">
              ?
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <p className="font-semibold mb-1">방문객 예측 기준</p>
              <p className="text-slate-300">오픈시그널 AI가 사장님의 <span className="text-violet-300">업종, 가게 위치(지역), 그리고 향후 7일간의 날씨 예보</span> 데이터를 종합적으로 분석하여 예상 방문객 수를 논리적으로 추정합니다.</p>
              <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 mb-3 h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: '#64748b', fontWeight: 600 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                labelStyle={{ color: '#64748b', fontWeight: 700, marginBottom: '4px' }}
                itemStyle={{ color: '#8b5cf6', fontWeight: 700 }}
              />
              <Area type="monotone" dataKey="visitors" stroke="#8b5cf6" strokeWidth={4} fillOpacity={1} fill="url(#colorVisitors)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">내일 행동 추천</h2>
            <p className="text-xs text-slate-500 mt-1">최근 매출, 요일, 날씨, 메모를 바탕으로 골랐어요.</p>
          </div>
          <span className="text-xs font-semibold text-slate-400">{tomorrowDayLabel}요일</span>
        </div>
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
          {tomorrowActions.map((action, index) => (
            <div key={action.id} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-sm font-bold leading-relaxed ${completedTomorrowActions.includes(action.id) ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                      {action.title}
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">{action.reason}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleTomorrowAction(action.id)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      completedTomorrowActions.includes(action.id)
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-white text-slate-400 border border-slate-200'
                    }`}
                    aria-label={completedTomorrowActions.includes(action.id) ? '추천 완료 취소' : '추천 완료 표시'}
                  >
                    {completedTomorrowActions.includes(action.id) ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </button>
                </div>
                <p className="text-[11px] font-bold text-slate-400 mt-2">확신도 {action.confidence}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-800">이번 달 요약</h2>
          <span className="text-xs font-semibold text-slate-400">기록 {businessLogs.length}일</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <p className="text-xs font-bold text-slate-500 mb-2">누적 매출</p>
            <p className="text-lg font-bold text-slate-800">{formatWon(monthlySalesTotal)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <p className="text-xs font-bold text-slate-500 mb-2">평균 객단가</p>
            <p className="text-lg font-bold text-slate-800">
              {averageTicket ? formatWon(averageTicket) : '손님 수 기록이 필요해요'}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <p className="text-xs font-bold text-slate-500 mb-2">누적 지출</p>
            <p className="text-lg font-bold text-slate-800">{formatWon(monthlyExpenseTotal)}</p>
            <p className="text-[11px] font-medium text-slate-400 mt-1">지출 입력 전</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <p className="text-xs font-bold text-slate-500 mb-2">마진 추정</p>
            <p className="text-lg font-bold text-slate-800">{formatWon(monthlySalesTotal - monthlyExpenseTotal)}</p>
            <p className="text-[11px] font-medium text-slate-400 mt-1">지출 미입력 기준</p>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ReceiptText size={20} className="text-emerald-600" />
                이번 주 증빙 정리 상태
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                누락되기 쉬운 지출과 증빙을 가볍게 확인해요.
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-emerald-600">{proofSummary.completionRate}%</p>
              <p className="text-[10px] text-slate-400 font-bold">완료율</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-2xl p-3">
              <p className="text-xs font-bold text-slate-500 mb-1">누락 가능 지출</p>
              <p className="text-lg font-bold text-slate-800">{proofSummary.missingExpenseCount}건</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-3">
              <p className="text-xs font-bold text-slate-500 mb-1">다음 정리 추천일</p>
              <p className="text-lg font-bold text-slate-800">{proofSummary.nextCleanupDate}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trend Insights */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">요즘 뜨는 인사이트</h3>
          <button onClick={() => navigate('/marketing')} className="text-sm font-medium text-violet-600 flex items-center">
            전체보기 <ChevronRight size={16} />
          </button>
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x">
          {insights.length > 0 ? insights.map((insight) => (
            <div key={insight.id} className="min-w-[280px] bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100 flex flex-col snap-center">
                <div className="h-32 bg-slate-200 relative">
                  <div className="absolute inset-0 bg-black/20 z-10" />
                  <img 
                    src={insight.image_url} 
                    alt="" 
                    className="w-full h-full object-cover" 
                    onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1550505096-17b1287c8051?q=80&w=600&auto=format&fit=crop'; }}
                  />
                  <div className="absolute top-3 left-3 z-20 bg-black/60 backdrop-blur-md text-white text-xs font-bold px-2 py-1 rounded-md">
                    {insight.tag}
                  </div>
                </div>
              <div className="p-4 flex-1 flex flex-col">
                <h4 className="font-bold text-slate-800 mb-1 leading-tight">{insight.title}</h4>
                <p className="text-xs text-slate-500 line-clamp-2 mt-auto">{insight.description}</p>
              </div>
            </div>
          )) : (
            <div className="w-full bg-slate-100 rounded-2xl p-6 text-center text-slate-500 text-sm">
              AI가 트렌드를 수집하고 있어요...
            </div>
          )}
        </div>
      </section>
      <AnimatePresence>
        {isWeatherModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pb-20 sm:pb-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsWeatherModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="relative w-full max-w-[400px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                    <CloudRain size={20} className="text-violet-500" /> 
                    주간 날씨 흐름 (예측 포함)
                  </h3>
                  <button onClick={() => setIsWeatherModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="flex flex-col gap-3">
                  {weeklyWeatherData.length > 0 ? (
                    weeklyWeatherData.map((w, idx) => {
                      const isTomorrow = idx === 0; // API가 이제 내일부터 7일을 반환하므로 0번째가 내일
                      return (
                        <div key={idx} className={`flex items-center justify-between p-3 rounded-2xl ${isTomorrow ? 'bg-violet-50 border border-violet-100' : 'bg-slate-50'}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isTomorrow ? 'bg-violet-100' : 'bg-white shadow-sm'}`}>
                              {getWeatherIcon(w.condition)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-800 flex items-center gap-2">
                                {w.dow}요일 {isTomorrow && <span className="text-[10px] bg-violet-600 text-white px-1.5 py-0.5 rounded-md font-bold">내일</span>}
                              </div>
                              <div className="text-xs text-slate-500">{w.date}</div>
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-slate-700">
                            {w.condition}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-center text-sm text-slate-500 py-4">날씨 정보를 불러오는 중입니다.</div>
                  )}
                </div>
                
                <p className="text-[10px] text-slate-400 mt-4 text-center">
                  * 미래의 날씨 및 예상 방문객은 AI를 통해 분석된 결과입니다. (제공: OpenWeatherMap, OpenAI)
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInsightModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowInsightModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-white rounded-[2rem] w-full max-w-md relative z-10 overflow-hidden shadow-2xl"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <span className="text-yellow-500">✨</span> 상세 인사이트
                  </h3>
                  <button 
                    onClick={() => setShowInsightModal(false)}
                    className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div className="bg-violet-50 p-4 rounded-2xl mb-4">
                  <p className="font-semibold text-violet-800 mb-2">{eventFactors}</p>
                  <p className="text-slate-700 text-sm leading-relaxed">{eventFactorsDetail}</p>
                </div>
                
                <p className="text-xs text-slate-400 text-center">
                  * 본 분석은 OpenAI 모델을 통해 생성되었습니다.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
