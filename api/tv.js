// Vercel Serverless Function (Node 20, FRA region)
// Безопасный тест-ордер в Binance: /api/tv (POST из TradingView) или ручной GET-тест ?test=1
const crypto = require('crypto');

module.exports = async (req, res) => {
  try {
    // Ручной тест из браузера:
    // GET /api/tv?test=1&secret=...&symbol=ETHUSDT&side=BUY&qty=12
    if (req.method === 'GET') {
      const u = new URL(req.url, `http://${req.headers.host}`);
      if (u.searchParams.get('test') === '1') {
        const secret = u.searchParams.get('secret') || '';
        if (secret !== process.env.WEBHOOK_SECRET) {
          return json(res, { ok: false, error: 'bad secret' }, 401);
        }
        const symbol = (u.searchParams.get('symbol') || 'ETHUSDT').split(':').pop().toUpperCase();
        const side   = (u.searchParams.get('side')   || 'BUY').toUpperCase();
        const quote  = Number(u.searchParams.get('qty') || '12');
        const r = await binanceTest(symbol, side, quote);
        return json(res, r, r.status === 200 ? 200 : 400);
      }
      return json(res, { ok: true, msg: 'Vercel alive (use POST from TradingView or GET ?test=1&...)' });
    }

    if (req.method !== 'POST') return json(res, { ok: false, error: 'use POST' }, 405);

    const data = await readJson(req);
    if ((data.secret || '') !== process.env.WEBHOOK_SECRET) {
      return json(res, { ok: false, error: 'bad secret' }, 401);
    }

    const symbol = String(data.symbol || 'ETHUSDT').split(':').pop().toUpperCase();
    const side   = String(data.side || data.action || 'BUY').toUpperCase();
    const quote  = Number(data.qty || data.quote || 12);

    const r = await binanceTest(symbol, side, quote);
    return json(res, r, r.status === 200 ? 200 : 400);

  } catch (e) {
    return json(res, { ok: false, error: String(e) }, 500);
  }
};

function sign(qs) {
  return crypto.createHmac('sha256', process.env.BINANCE_API_SECRET)
    .update(qs).digest('hex');
}

async function binanceTest(symbol, side, quote) {
  if (!['BUY','SELL'].includes(side)) return { ok:false, error:'bad side', status:0, body:'' };
  if (!(quote > 0))                  return { ok:false, error:'bad qty',  status:0, body:'' };

  const ts = Date.now();
  const q  = `symbol=${symbol}&side=${side}&type=MARKET&quoteOrderQty=${quote}&timestamp=${ts}&recvWindow=5000`;
  const sig = sign(q);
  const url = `https://api.binance.com/api/v3/order/test?${q}&signature=${sig}`;

  const r = await fetch(url, { method:'POST', headers:{ 'X-MBX-APIKEY': process.env.BINANCE_API_KEY } });
  const body = await r.text();

  return { ok:true, status:r.status, body, symbol, side, quote };
}

async function readJson(req) {
  if (req.body) {
    try { return typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return {}; }
  }
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function json(res, obj, status=200) {
  res.status(status).setHeader('content-type', 'application/json');
  res.send(JSON.stringify(obj));
}
