// YouTube Transcript helper
// Wrapper to handle different export patterns

interface TranscriptSegment {
  text: string
  offset: number
  duration: number
}

const youtubeTranscript = require('youtube-transcript')

export async function getTranscript(videoId: string): Promise<TranscriptSegment[]> {
  if (typeof youtubeTranscript.fetchTranscript === 'function') {
    return youtubeTranscript.fetchTranscript(videoId)
  }
  if (typeof youtubeTranscript.default === 'function') {
    return youtubeTranscript.default(videoId)
  }
  return youtubeTranscript.YoutubeTranscript.fetchTranscript(videoId)
}
