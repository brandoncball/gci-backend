const https = require('https');

function fetchUrl(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...headers
      }
    };
    let data = '';
    https.get(options, r => {
      r.on('data', chunk => data += chunk);
      r.on('end', () => resolve({ status: r.statusCode, data }));
    }).on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

  try {
    const { data: html } = await fetchUrl(`https://www.youtube.com/watch?v=${videoId}`);

    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!playerMatch) return res.status(500).json({ error: 'Could not parse YouTube page', videoId });

    let playerData;
    try { playerData = JSON.parse(playerMatch[1]); }
    catch(e) { return res.status(500).json({ error: 'Could not parse player data', videoId }); }

    const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captions || captions.length === 0)
      return res.status(500).json({ error: 'No captions available for this video', videoId });

    const track = captions.find(t => t.languageCode === 'en' || t.languageCode === 'en-US')
      || captions.find(t => t.languageCode?.startsWith('en'))
      || captions[0];

    const { data: captionRaw } = await fetchUrl(track.baseUrl + '&fmt=json3');

    let captionData;
    try { captionData = JSON.parse(captionRaw); }
    catch(e) { return res.status(500).json({ error: 'Could not parse caption data', videoId }); }

    if (!captionData.events) return res.status(500).json({ error: 'No caption events found', videoId });

    const text = captionData.events
      .filter(e => e.segs)
      .map(e => e.segs.map(s => s.utf8 || '').join(''))
      .join(' ')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return res.status(200).json({
      transcript: text,
      wordCount: text.split(' ').length,
      language: track.languageCode
    });

  } catch(err) {
    return res.status(500).json({ error: 'Failed to fetch transcript', detail: err.message, videoId });
  }
};
