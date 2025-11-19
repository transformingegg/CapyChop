import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// API Routes (import after dotenv is loaded)
let generateStarClaimSignature;

// Dynamically import signer after env is loaded
(async () => {
  const signerModule = await import('./server/signer.js');
  generateStarClaimSignature = signerModule.generateStarClaimSignature;
})();

// Endpoint: Request signature to claim stars
app.post('/api/claim-stars', async (req, res) => {
  if (!generateStarClaimSignature) {
    return res.status(503).json({ error: 'Server initializing, try again' });
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
    
    // Use timestamp + random for unique nonce that will never repeat
    const nonce = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    const signatureData = await generateStarClaimSignature(
      walletAddress,
      starsEarned,
      nonce
    );
    
    console.log(`✍️  Signed claim for ${walletAddress}: ${starsEarned} stars`);
    
    res.json(signatureData);
  } catch (error) {
    console.error('Signing error:', error);
    res.status(500).json({ error: 'Failed to generate signature' });
  }
});

// Endpoint: Get Chops reward data for a user
app.get('/api/get-chops-reward', async (req, res) => {
  try {
    const { address, epoch } = req.query;
    
    if (!address || !epoch) {
      return res.status(400).json({ error: 'Missing address or epoch' });
    }
    
    let rewardData;
    
    // In production (Vercel), fetch from Blob Storage
    if (process.env.VERCEL) {
      const blobUrl = `https://blob.vercel-storage.com/epoch-${epoch}-rewards.json`;
      
      try {
        const response = await fetch(blobUrl);
        if (!response.ok) {
          return res.status(404).json({ error: 'No rewards found for this epoch' });
        }
        rewardData = await response.json();
      } catch (error) {
        console.error('Error fetching from blob:', error);
        return res.status(404).json({ error: 'No rewards found for this epoch' });
      }
    } else {
      // In development, read from local filesystem
      const rewardFile = path.join(__dirname, `epoch-${epoch}-rewards.json`);
      
      if (!fs.existsSync(rewardFile)) {
        return res.status(404).json({ error: 'No rewards found for this epoch' });
      }
      
      rewardData = JSON.parse(fs.readFileSync(rewardFile, 'utf8'));
    }
    
    // Find the user's reward
    const userReward = rewardData.rewards.find(
      r => r.address.toLowerCase() === address.toLowerCase()
    );
    
    if (!userReward) {
      return res.status(404).json({ error: 'No reward found for this address' });
    }
    
    res.json(userReward);
  } catch (error) {
    console.error('Error fetching reward:', error);
    res.status(500).json({ error: 'Failed to fetch reward data' });
  }
});

// Check if we have a built dist folder (production) or use dev mode
const distPath = path.join(__dirname, 'dist');
const publicPath = path.join(__dirname, 'public');
const useDistFolder = fs.existsSync(distPath);

if (useDistFolder) {
  // Production: serve built files from dist
  console.log('📦 Serving production build from dist/');
  app.use(express.static(distPath));
  
  // Also serve public assets
  app.use('/public', express.static(publicPath));
  
  // Fallback to index.html for SPA routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Development fallback: serve public folder
  console.log('🔧 Development mode: serving public/ folder');
  app.use(express.static(publicPath));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// Dynamically load API routes from api/ directory (for local development)
async function loadApiRoutes() {
  const apiDir = path.join(__dirname, 'api');
  
  try {
    const files = fs.readdirSync(apiDir).filter(file => file.endsWith('.js'));
    
    for (const file of files) {
      const routeName = file.replace('.js', '');
      const routePath = `/api/${routeName}`;
      
      try {
        const routeModule = await import(`./api/${file}`);
        const handler = routeModule.default;
        
        if (typeof handler === 'function') {
          app.post(routePath, handler);
          console.log(`📡 Loaded API route: ${routePath}`);
        }
      } catch (error) {
        console.error(`❌ Failed to load API route ${routePath}:`, error.message);
      }
    }
  } catch (error) {
    console.error('❌ Failed to load API routes:', error.message);
  }
}

// Load API routes
await loadApiRoutes();

app.listen(PORT, () => {
  console.log(`🎮 CapyChop server listening on http://localhost:${PORT}`);
  console.log(`📂 Mode: ${useDistFolder ? 'Production (dist/)' : 'Development (public/)'}`);
});

export default app;
