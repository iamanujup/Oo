// api/index.js — Merged API for UPSSSC_WALA_Study
// Handles: /api/save-score (POST), /api/leaderboard (GET)

import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
let cachedClient = null;

async function connectDB() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000
  });
  await client.connect();
  cachedClient = client;
  return client;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const pathname = (req.url || '').split('?')[0];
  const query = req.query || {};

  const isSaveScore = pathname.includes('save-score') || query.action === 'save';
  const isLeaderboard = pathname.includes('leaderboard') || query.action === 'leaderboard';

  try {
    if (!uri) {
      return res.status(500).json({ 
        error: 'MONGODB_URI not configured',
        hint: 'Add MONGODB_URI in Vercel Environment Variables'
      });
    }

    const client = await connectDB();
    const db = client.db('upsssc_study');
    const collection = db.collection('scores');

    // ============ SAVE SCORE ============
    if (isSaveScore && req.method === 'POST') {
      const { name, score, right, wrong, total, percent, category } = req.body || {};

      if (!name || typeof score !== 'number' || isNaN(score)) {
        return res.status(400).json({ error: 'Invalid data: name and score required' });
      }

      if (score < -100 || score > 1000) {
        return res.status(400).json({ error: 'Score out of range' });
      }

      const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
                 req.headers['x-real-ip'] || 'unknown';

      const doc = {
        name: String(name).trim().slice(0, 50),
        score: parseFloat(score.toFixed(2)),
        right: parseInt(right) || 0,
        wrong: parseInt(wrong) || 0,
        total: parseInt(total) || 0,
        percent: parseFloat(percent) || 0,
        category: String(category || 'all').slice(0, 10),
        ip: ip,
        createdAt: new Date(),
        dateIST: new Date().toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      };

      const result = await collection.insertOne(doc);

      return res.status(200).json({
        success: true,
        id: result.insertedId,
        message: 'Score saved successfully'
      });
    }

    // ============ LEADERBOARD ============
    if (isLeaderboard || req.method === 'GET') {
      const category = query.category || 'all';
      const period = query.period || 'all';
      const limit = query.limit || 100;

      const filter = {};
      if (category && category !== 'all') filter.category = category;

      if (period === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        filter.createdAt = { $gte: today };
      } else if (period === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        filter.createdAt = { $gte: weekAgo };
      } else if (period === 'month') {
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        filter.createdAt = { $gte: monthAgo };
      }

      const scores = await collection
        .find(filter)
        .sort({ score: -1, percent: -1, createdAt: 1 })
        .limit(Math.min(parseInt(limit) || 100, 500))
        .toArray();

      const ranked = scores.map((s, i) => ({
        rank: i + 1,
        name: s.name,
        score: s.score,
        right: s.right,
        wrong: s.wrong,
        total: s.total,
        percent: s.percent,
        category: s.category,
        date: s.dateIST,
        createdAt: s.createdAt
      }));

      const totalStudents = await collection.countDocuments(filter);
      const topScore = ranked[0]?.score || 0;
      const avgScore = ranked.length
        ? parseFloat((ranked.reduce((a, b) => a + b.score, 0) / ranked.length).toFixed(2))
        : 0;

      return res.status(200).json({
        success: true,
        leaderboard: ranked,
        stats: { totalStudents, topScore, avgScore, shown: ranked.length },
        filter: { category, period }
      });
    }

    // ============ DEFAULT ============
    return res.status(200).json({
      success: true,
      message: 'UPSSSC_WALA_Study API',
      endpoints: {
        saveScore: 'POST /api/save-score',
        leaderboard: 'GET /api/leaderboard'
      }
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ 
      error: 'Server error', 
      details: error.message 
    });
  }
        }
