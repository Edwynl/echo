// Type declarations

declare module 'youtube-transcript' {
  interface TranscriptSegment {
    text: string
    offset: number
    duration: number
  }

  export function getTranscript(videoId: string): Promise<TranscriptSegment[]>
  export default getTranscript
}
