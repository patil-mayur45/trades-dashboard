import { config } from '../config.js';

const CLIENTS = [
  'Rahul Sharma', 'Amit Verma', 'Priya Nair', 'Sneha Kulkarni', 'Vikram Singh', 'Anjali Mehta',
  'Rohan Desai', 'Neha Gupta', 'Karan Malhotra', 'Pooja Iyer', 'Arjun Reddy', 'Divya Joshi',
  'Siddharth Rao', 'Kavya Menon', 'Manish Agarwal', 'Ritu Bansal', 'Aditya Patil', 'Meera Shah',
  'Nikhil Jain', 'Ishita Banerjee', 'Varun Kapoor', 'Shreya Pillai', 'Harsh Vora', 'Tanvi Choudhary',
  'Gaurav Saxena', 'Ananya Das', 'Yash Thakur', 'Simran Kaur', 'Deepak Naidu', 'Pallavi Ghosh',
];

// [symbol, approximate base price in INR]
const SYMBOLS = [
  ['RELIANCE', 2900], ['TCS', 3900], ['INFY', 1850], ['HDFCBANK', 1650], ['ICICIBANK', 1250],
  ['SBIN', 820], ['BHARTIARTL', 1600], ['ITC', 470], ['LT', 3600], ['AXISBANK', 1180],
  ['KOTAKBANK', 1750], ['WIPRO', 560], ['MARUTI', 12500], ['TATAMOTORS', 950], ['SUNPHARMA', 1700],
  ['HINDUNILVR', 2450], ['ASIANPAINT', 2900], ['BAJFINANCE', 7200], ['TITAN', 3400], ['ADANIPORTS', 1400],
];

const EPOCH = Date.parse('2026-11-02T03:45:00Z');
const SECONDS_BETWEEN_TRADES = 9;
const serverStartedAt = Date.now();

// Small deterministic PRNG: the same index always produces the same trade,
// so repeated pulls return identical records (this is what proves de-duplication works).
function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTrade(index) {
  const rnd = mulberry32((index + 1) * 2654435761);
  const [symbol, base] = SYMBOLS[Math.floor(rnd() * SYMBOLS.length)];
  const client = CLIENTS[Math.floor(rnd() * CLIENTS.length)];
  const quantity = (1 + Math.floor(rnd() * 50)) * 10; // 10 .. 500
  const price = Math.round(base * (1 + (rnd() - 0.5) * 0.04) * 100) / 100;
  return {
    tradeId: `TR${String(index + 1).padStart(5, '0')}`,
    client,
    symbol,
    quantity,
    price,
    timestamp: new Date(EPOCH + index * SECONDS_BETWEEN_TRADES * 1000).toISOString(),
  };
}

/** The mock exchange keeps trading while the server is up, so later pulls find new records. */
export function currentTotal() {
  const minutes = (Date.now() - serverStartedAt) / 60_000;
  return config.bse.totalTrades + Math.floor(minutes * config.bse.growthPerMinute);
}

export function tradesSlice(start, count) {
  const out = [];
  for (let i = start; i < start + count; i += 1) out.push(generateTrade(i));
  return out;
}
