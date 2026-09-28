// api/leaderboard.js
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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const client = await connectDB();
    const db = client.db('upsssc_study');
    const collection = db.collection('scores');

    const { 
      category = 'all', 
      period = 'all', 
      limit = 100 
    } = req.query;

    // Build filter
    const filter = {};
    if (category && category !== 'all') filter.category = category;

    // Time filter
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

    // Fetch top scores
    const scores = await collection
      .find(filter)
      .sort({ score: -1, percent: -1, createdAt: 1 })
      .limit(Math.min(parseInt(limit) || 100, 500))
      .toArray();

    // Add ranks
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

    // Stats
    const totalStudents = await collection.countDocuments(filter);
    const topScore = ranked[0]?.score || 0;
    const avgScore = ranked.length
      ? parseFloat((ranked.reduce((a, b) => a + b.score, 0) / ranked.length).toFixed(2))
      : 0;

    return res.status(200).json({
      success: true,
      leaderboard: ranked,
      stats: {
        totalStudents,
        topScore,
        avgScore,
        shown: ranked.length
      },
      filter: { category, period }
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return res.status(500).json({ 
      error: 'Server error', 
      details: error.message 
    });
  }
}
