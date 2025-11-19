export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { address, epoch } = req.query;

    if (!address || !epoch) {
      return res.status(400).json({ error: 'Missing address or epoch' });
    }

    // Fetch from Vercel Blob Storage
    const blobUrl = `https://z3p2lhzjl2zlx7er.public.blob.vercel-storage.com/epoch-${epoch}-rewards.json`;

    try {
      const response = await fetch(blobUrl);
      if (!response.ok) {
        return res.status(404).json({ error: 'No rewards found for this epoch' });
      }
      const rewardData = await response.json();

      // Find the user's reward
      const userReward = rewardData.rewards.find(
        r => r.address.toLowerCase() === address.toLowerCase()
      );

      if (!userReward) {
        return res.status(404).json({ error: 'No reward found for this address' });
      }

      res.json(userReward);
    } catch (error) {
      console.error('Error fetching from blob:', error);
      return res.status(404).json({ error: 'No rewards found for this epoch' });
    }
  } catch (error) {
    console.error('Error fetching reward:', error);
    res.status(500).json({ error: 'Failed to fetch reward data' });
  }
}