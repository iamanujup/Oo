// api/save-score.js
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
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, score, right, wrong, total, percent, category } = req.body;

    // Validation
    if (!name || typeof score !== 'number' || isNaN(score)) {
      return res.status(400).json({ error: 'Invalid data: name and score required' });
    }

    if (score < -100 || score > 1000) {
      return res.status(400).json({ error: 'Score out of range' });
    }

    const client = await connectDB();
    const db = client.db('upsssc_study');
    const collection = db.collection('scores');

    // Get client IP for anti-spam
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
               req.headers['x-real-ip'] || 
               'unknown';

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
  } catch (error) {
    console.error('Save score error:', error);
    return res.status(500).json({ 
      error: 'Server error', 
      details: error.message 
    });
  }
}
