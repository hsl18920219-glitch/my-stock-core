const https = require('https');

let cachedToken = null;
let tokenExpireTime = 0;

// 토큰 발급 함수
async function getAccessToken(appKey, appSecret) {
    if (cachedToken && Date.now() < tokenExpireTime) return cachedToken;

    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret });
        const options = {
            hostname: 'openapi.koreainvestment.com', port: 9443, path: '/oauth2/tokenP', method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                const resData = JSON.parse(body);
                if (resData.access_token) {
                    cachedToken = resData.access_token;
                    tokenExpireTime = Date.now() + (resData.expires_in - 60) * 1000;
                    resolve(cachedToken);
                } else reject(new Error(resData.msg1 || "토큰 발급 실패"));
            });
        });
        req.on('error', reject); req.write(data); req.end();
    });
}

exports.handler = async function (event) {
    try {
        const body = JSON.parse(event.body || "{}");
        const { action, appKey, appSecret, codes } = body;

        if (action === 'login') {
            await getAccessToken(appKey, appSecret);
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

        const token = await getAccessToken(appKey, appSecret);
        const results = await Promise.all(codes.map(code => {
            return new Promise((resolve) => {
                const options = {
                    hostname: 'openapi.koreainvestment.com', port: 9443,
                    path: `/uapi/domestic-stock/v1/quotations/inquire-price?fid_cond_mrkt_div_code=J&fid_input_iscd=${code}`,
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${token}`, 'appkey': appKey, 'appsecret': appSecret, 'tr_id': 'FHKST01010100' }
                };
                https.get(options, (res) => {
                    let body = '';
                    res.on('data', (chunk) => body += chunk);
                    res.on('end', () => {
                        const d = JSON.parse(body);
                        resolve({ code, name: d.output.hts_kor_isnm, price: d.output.stck_prpr, diff: d.output.prdy_ctrt, i: d.output.orgn_ntby_qty, f: d.output.frgn_ntby_qty });
                    });
                }).on('error', () => resolve({ code, price: 0, diff: 0, signal: 'ERR' }));
            });
        }));

        return { statusCode: 200, body: JSON.stringify({ success: true, prices: results }) };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ success: false, message: err.message }) };
    }
};