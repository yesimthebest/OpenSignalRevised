import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default {
  fetch: async (req: Request) => {
    // CORS 처리
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      // 바디에서 store_id (선택) 읽기
      let storeId = null;
      try {
        const body = await req.json();
        storeId = body?.store_id;
      } catch (e) {
        // json 파싱 에러(바디가 없을 때)는 무시
      }

      // 환경변수 로드
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const weatherKey = Deno.env.get('WEATHER_API_KEY');
      const openAiKey = Deno.env.get('OPENAI_API_KEY');
      
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // 사장님 프로필 조회 (storeId가 있으면 해당 사장님만, 없으면 전체)
      let query = supabase.from('profiles').select('id, store_region, store_industry').eq('role', 'owner');
      if (storeId) {
        query = query.eq('id', storeId);
      }
      const { data: owners, error: ownersError } = await query;
        
      if (ownersError || !owners) throw new Error("사장님 정보를 불러오는데 실패했습니다.");

      const results = [];

      for (const owner of owners) {
        const region = owner.store_region || '서울';
        const industry = owner.store_industry || '카페';
        
        let lat = 37.5665;
        let lon = 126.9780;

        // 1) OpenWeatherMap Geocoding API로 위경도 찾기
        if (weatherKey) {
          try {
            const cityQuery = region.split(' ')[0] || 'Seoul';
            const geoRes = await fetch(`http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cityQuery)}&limit=1&appid=${weatherKey}`);
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              if (geoData && geoData.length > 0) {
                lat = geoData[0].lat;
                lon = geoData[0].lon;
              }
            }
          } catch (e) {
            console.error("OpenWeatherMap Geocoding failed", e);
          }
        }

        // 2) OpenWeatherMap 5-day Forecast 가져오기
        let forecastList: string[] = [];
        let tomorrowWeather = '맑음';
        if (weatherKey) {
          try {
            const wRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${weatherKey}&lang=kr&units=metric`);
            if (wRes.ok) {
              const wData = await wRes.json();
              // 매일 낮 12시 즈음의 데이터를 하루 대표 날씨로 사용 (대략 8칸 간격)
              const dailyData = wData.list.filter((_: any, i: number) => i % 8 === 0).slice(0, 5);
              forecastList = dailyData.map((d: any) => d.weather[0]?.description || '맑음');
              if (forecastList.length > 1) {
                tomorrowWeather = forecastList[1];
              } else if (forecastList.length > 0) {
                tomorrowWeather = forecastList[0];
              }
            }
          } catch (e) {
            console.error("OpenWeatherMap Forecast failed", e);
          }
        }

        // 앞으로 7일(내일부터 시작) 날짜 배열 생성
        const daysArr = ['일', '월', '화', '수', '목', '금', '토'];
        const targetDatesList: { date: string, dow: string }[] = [];
        for(let i=1; i<=7; i++) {
          const d = new Date();
          // 한국 시간(KST) 보정 (+9시간) 후 날짜 구하기
          d.setHours(d.getHours() + 9);
          d.setDate(d.getDate() + i);
          targetDatesList.push({
            date: d.toISOString().split('T')[0],
            dow: daysArr[d.getDay()]
          });
        }

        // 3) OpenAI에게 미래 7일 예측 요청
        let insights: any[] = [];
        let eventFactors = "특이사항 없음";
        let aiForecasts: any[] = [];

        // 2.5) 최근 7일치 평균 방문객(customer_count) 계산
        let avgVisitorsInfo = "";
        const { data: recentLogs, error: recentLogsErr } = await supabase
          .from('daily_business_logs')
          .select('customer_count')
          .eq('store_id', owner.id)
          .order('log_date', { ascending: false })
          .limit(7);
          
        if (!recentLogsErr && recentLogs && recentLogs.length > 0) {
          const totalCustomers = recentLogs.reduce((acc, log) => acc + (log.customer_count || 0), 0);
          const avgCustomers = Math.round(totalCustomers / recentLogs.length);
          avgVisitorsInfo = `\n[중요 데이터] 최근 이 매장의 일평균 실제 방문객 수는 약 ${avgCustomers}명입니다. 이 실제 수치를 기준점(Base)으로 삼아, 요일 특성과 내일 날씨에 따른 증감을 계산하여 방문객 수를 현실적으로 추정해주세요. (절대 터무니없는 숫자를 제시하지 마세요)`;
        } else {
          avgVisitorsInfo = `\n[참고] 아직 매장의 최근 방문객 데이터가 없습니다. 해당 지역(${region})과 업종(${industry})의 평균적인 방문객 수를 임의로 가정하여 논리적으로 추정해주세요.`;
        }

        if (openAiKey) {
          const datesText = targetDatesList.map(w => `${w.date}(${w.dow})`).join(', ');
          const weatherText = forecastList.length > 0 ? forecastList.join(', ') : '알 수 없음';

          const prompt = `
당신은 지역 기반 자영업자(사장님)를 위한 AI 비서입니다.
현재 매장 정보:
- 지역: ${region}
- 업종: ${industry}

향후 5일간 예상 날씨(OpenWeatherMap 기준): ${weatherText}
향후 7일 날짜 목록 (내일부터 시작): ${datesText}

위 날짜 목록에 해당하는 '내일부터 7일간'의 날씨를 OpenWeatherMap 데이터를 참고하여 예측하고, 요일별 특성(주말/평일), 업종 특성을 종합하여 향후 7일간의 일일 예상 방문객 수(명)를 현실적으로 추정해주세요. (랜덤한 값이 아닌 논리적인 추정치)${avgVisitorsInfo}

또한 내일 날씨(${tomorrowWeather})에 완벽하게 맞춤화된 실용적인 마케팅 인사이트 2개와 내일 예상되는 특이사항 1줄(event_factors), 그리고 그 특이사항에 대한 상세 설명 3줄(event_factors_detail)을 작성해주세요.
(주의: 특정 실시간 지역 행사나 축제를 임의로 지어내지 마세요. 대신 '${region}' 지역의 일반적인 상권 특성(예: 오피스 상권, 대학가, 주거지 등)과 보편적인 계절적 요인(예: 가정의 달, 장마철 등)만을 활용하여 분석하세요. 절대로 '이전 데이터입니다' 같은 문구 사용 금지)

주의: 아래 JSON의 값들은 단지 '형식'을 보여주기 위한 가짜 예시입니다. 절대 예시 텍스트를 그대로 복사하지 말고, 실제 내일 날씨(${tomorrowWeather})와 상황에 맞게 100% 새롭고 논리적인 내용을 직접 작성하세요!

결과는 반드시 아래 JSON 형식으로 반환하세요:
{
  "event_factors": "[예시] 내일은 맑은 날씨와 주말 특수로 인해 유동인구가 증가할 것입니다.",
  "event_factors_detail": "[예시] 맑은 주말에는 가족 단위 방문객이 20% 늘어납니다. 야외 테라스 좌석을 정비하고, 테이크아웃 전용 할인 이벤트를 입구에 비치하여 지나가는 사람들의 발길을 사로잡으세요.",
  "forecasts": [
    { "target_date": "2026-05-30", "expected_visitors": 150, "weather_condition": "맑음" },
    ... (위 7일 날짜 목록에 대한 총 7일치 미래 데이터)
  ],
  "insights": [
    {
      "tag": "#날씨맞춤",
      "title": "내일 날씨(${tomorrowWeather}) 맞춤 프로모션",
      "description": "[예시] 내일 날씨에 어울리는 대표 메뉴를 매장 앞 배너에 홍보해보세요.",
      "image_url": "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?q=80&w=600&auto=format&fit=crop",
      "color_theme": "from-blue-600 to-indigo-800"
    }
  ]
}
`;
          try {
            const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAiKey}`
              },
              body: JSON.stringify({
                model: "gpt-3.5-turbo",
                response_format: { type: "json_object" },
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
              })
            });

            if (aiRes.ok) {
              const aiData = await aiRes.json();
              const cleanJson = aiData.choices[0].message.content.trim();
              const parsed = JSON.parse(cleanJson);
              
              insights = parsed.insights || [];
              eventFactors = parsed.event_factors || "특이사항 없음";
              const eventFactorsDetail = parsed.event_factors_detail || "추가 상세 정보가 없습니다.";
              aiForecasts = parsed.forecasts || [];
              
              // DB 삽입용으로 이벤트 팩터 상세 정보를 eventFactors 문자열에 저장해두거나, (이미 forecasts 테이블에 저장할 것이므로 여기선 별도 처리 불필요)
              // forecasts 배열에 담아줍시다.
              aiForecasts = aiForecasts.map((f: any) => ({
                ...f,
                event_factors: eventFactors,
                event_factors_detail: eventFactorsDetail
              }));
            } else {
              const errData = await aiRes.json();
              console.error("OpenAI API 응답 에러:", errData);
              eventFactors = `OpenAI API 오류: ${errData.error?.message?.substring(0, 30)}...`;
              aiForecasts = []; // 강제로 폴백 타게 만듬
            }
          } catch (e: any) {
            console.error("OpenAI API 네트워크/파싱 에러:", e);
            eventFactors = `OpenAI 연동 실패: ${e.message.substring(0, 30)}`;
          }
        }

        // AI 응답이 실패하거나 키가 없을 경우 폴백 로직
        if (aiForecasts.length === 0) {
          aiForecasts = targetDatesList.map((w, idx) => ({
            target_date: w.date,
            expected_visitors: Math.floor(Math.random() * 50) + 100,
            weather_condition: forecastList[idx] || tomorrowWeather,
            event_factors: eventFactors !== "특이사항 없음" ? eventFactors : "API 키 미설정 또는 호출 대기중",
            event_factors_detail: "API 호출이 실패하여 상세 정보를 제공할 수 없습니다."
          }));
          insights = [{
            tag: '#알림',
            title: `AI API 연결 필요`,
            description: `OpenAI API가 연결되지 않아 임의의 기본 수치를 제공합니다.`,
            image_url: 'https://images.unsplash.com/photo-1550505096-17b1287c8051?q=80&w=600&auto=format&fit=crop',
            color_theme: 'from-amber-500 to-orange-600'
          }];
          
          if (eventFactors === "특이사항 없음") {
            eventFactors = "API 키 미설정 또는 호출 대기중";
          }
        }

        // 4) DB 저장 (기존 해당 유저의 모든 예측 및 인사이트 데이터 완전 삭제 후 재삽입 - Mock 데이터 청소 목적)
        await supabase.from('forecasts').delete().eq('store_id', owner.id);
        await supabase.from('insights').delete().eq('store_id', owner.id);

        const insertForecasts = aiForecasts.map(f => ({
          store_id: owner.id,
          target_date: f.target_date,
          expected_visitors: f.expected_visitors,
          weather_condition: f.weather_condition,
          event_factors: f.event_factors || eventFactors,
          event_factors_detail: f.event_factors_detail || null
        }));

        await supabase.from('forecasts').insert(insertForecasts);
        
        const insertInsights = insights.map((ins: any) => ({
          store_id: owner.id,
          tag: ins.tag,
          title: ins.title,
          description: ins.description,
          image_url: ins.image_url,
          color_theme: ins.color_theme
        }));

        if (insertInsights.length > 0) {
          await supabase.from('insights').insert(insertInsights);
        }
        
        results.push({ region, industry, forecasts_count: insertForecasts.length, insights_count: insertInsights.length, eventFactors });
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "성공적으로 미래 7일 예측 및 인사이트 생성을 마쳤습니다.",
          results: results
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );

    } catch (error: any) {
      console.error(error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { 
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
  }
};
