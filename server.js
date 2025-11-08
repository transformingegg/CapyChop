const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve all static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for SPA-style routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎮 CapyChop Node server listening on http://localhost:${PORT}`);
  console.log('📂 Serving static assets from: public/');
});

module.exports = app;
