// api/engine.js - Vercel 다이렉트 엔진 (구글 브릿지 폐기, 직접 통신)
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
    // CORS 설정 (안전빵)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        let bodyData = req.body;
        if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {} }
        
        const { action, appKey, appSecret, token } = bodyData || {};

        // 🟢 뉴스 요청 처리
        if (action === 'news') {
            return res.status(200).json({ 
                news: [{ title: "[시스템] Vercel 다이렉트 엔진 가동 중 🚀 (해외 IP 뚫림)", publisher: "Core System", time: new Date().toLocaleTimeString('ko-KR') }] 
            });
        }

        // 🟢 종목 스캔 요청 처리
        if (action !== 'full_scan') return res.status(200).json({ backend_msg: "대기 중", prices: [] });

        if (!appKey || !appSecret) {
            return res.status(200).json({ backend_msg: "키를 입력해주세요.", prices: [] });
        }

        let activeToken = token;
        let isNewToken = false;

        // 1. 한투 토큰 발급 (토큰이 없거나 만료되었을 때만)
        if (!activeToken) {
            const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
            });
            const tData = await tRes.json();
            
            if (tData.access_token) {
                activeToken = tData.access_token;
                isNewToken = true;
            } else {
                return res.status(200).json({ backend_msg: "로그인 실패 (키 확인 필요)", prices: [], error: true });
            }
        }

        // 2. 한투 VIP 랭킹 데이터 직접 타격
        const rankUrl = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=0000&FID_COND_SCR_DIV_CODE=20173&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=";
        const rankRes = await fetch(rankUrl, {
            method: 'GET',
            headers: { 
                "authorization": `Bearer ${activeToken}`, 
                "appkey": appKey, 
                "appsecret": appSecret, 
                "tr_id": "HHKST01010300",
                "custtype": "P" 
            }
        });
        
        const rData = await rankRes.json();
        
        if (rData.rt_cd === '0' && rData.output) {
            let prices = rData.output.slice(0, 100).map((item, i) => ({
                sectorId: (i % 15) + 1, 
                c: item.mksc_shrn_iscd, 
                n: item.hts_kor_isnm,
                price: item.stck_prpr, 
                diff: item.prdy_ctrt, 
                v: Math.floor(item.acml_tr_pbmn/100000000), 
                signal: Number(item.prdy_ctrt) > 3.5 ? "BUY" : "WAIT",
                i: "0", f: "0", p: "0"
            }));
            return res.status(200).json({ backend_msg: "✅ 다이렉트 엔진 정상 가동", prices, token: isNewToken ? activeToken : null });
        } else {
            // 한투 서버가 토큰 만료 에러를 내뱉으면 프론트에 리셋하라고 알려줌
            return res.status(200).json({ backend_msg: `데이터 지연: ${rData.msg1 || '응답 오류'}`, prices: [], reset_token: true });
        }

    } catch (e) {
        return res.status(500).json({ backend_msg: "서버 통신 오류", prices: [] });
    }
}
