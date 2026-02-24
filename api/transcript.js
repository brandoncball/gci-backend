const { YoutubeTranscript } = require('youtube-transcript');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

  // Method 1: youtube-transcript library (tries en, then auto-generated)
  const langs = ['en', 'en-US', 'en-GB'];
  for (const lang of langs) {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      const text = transcript.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim();
      if (text.length > 100) {
        return res.status(200).json({ transcript: text, wordCount: text.split(' ').length, method: `lang:${lang}` });
      }
    } catch(e) {}
  }

  // Method 2: try without specifying language (gets whatever is available)
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: null });
    const text = transcript.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 100) {
      return res.status(200).json({ transcript: text, wordCount: text.split(' ').length, method: 'auto' });
    }
  } catch(e) {}

  // Method 3: scrape YouTube page for caption track URL
  try {
    const https = require('https');
    const pageHtml = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'www.youtube.com',
        path: `/watch?v=${videoId}`,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      };
      let data = '';
      https.get(options, r => {
        r.on('data', chunk => data += chunk);
        r.on('end', () => resolve(data));
      }).on('error', reject);
    });

    const match = pageHtml.match(/"captionTracks":\s*(\[.*?\])/);
    if (match) {
      const tracks = JSON.parse(match[1].replace(/\\u0026/g, '&'));
      const track = tracks.find(t => t.languageCode === 'en' || t.languageCode === 'en-US') || tracks[0];
      if (track && track.baseUrl) {
        const captionXml = await new Promise((resolve, reject) => {
          const url = new URL(track.baseUrl + '&fmt=json3');
          let data = '';
          https.get({ hostname: url.hostname, path: url.pathname + url.search, headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
            r.on('data', chunk => data += chunk);
            r.on('end', () => resolve(data));
          }).on('error', reject);
        });
        const captionData = JSON.parse(captionXml);
        if (captionData.events) {
          const text = captionData.events
            .filter(e => e.segs)
            .map(e => e.segs.map(s => s.utf8).join(''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (text.length > 100) {
            return res.status(200).json({ transcript: text, wordCount: text.split(' ').length, method: 'scrape' });
          }
        }
      }
    }
  } catch(e) {}

  return res.status(500).json({ 
    error: 'Could not fetch transcript. The video may not have captions available.',
    videoId 
  });
};
