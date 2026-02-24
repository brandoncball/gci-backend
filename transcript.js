const { YoutubeTranscript } = require('youtube-transcript');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    const text = transcript.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim();
    res.status(200).json({ transcript: text, wordCount: text.split(' ').length });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch transcript. The video may have captions disabled.', detail: err.message });
  }
};
