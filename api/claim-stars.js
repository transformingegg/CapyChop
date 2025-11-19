import { generateStarClaimSignature } from '../server/signer.js';

let nonceCounter = 1;

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { walletAddress, starsEarned } = req.body;
    
    // Validation
    if (!walletAddress || !starsEarned || starsEarned <= 0) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    
    // TODO: Add actual game validation here
    // - Verify user session
    // - Check game score from database/session
    // - Prevent abuse
    
    const nonce = nonceCounter++;
    const signatureData = generateStarClaimSignature(
      walletAddress,
      starsEarned,
      nonce
    );
    
    console.log(`✍️  Signed claim for ${walletAddress}: ${starsEarned} stars`);
    
    res.status(200).json(signatureData);
  } catch (error) {
    console.error('Signing error:', error);
    res.status(500).json({ error: 'Failed to generate signature' });
  }
}
