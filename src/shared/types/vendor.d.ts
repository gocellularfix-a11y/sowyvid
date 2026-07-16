// Ambient declarations for untyped ffmpeg binary-locator packages.
declare module 'ffprobe-static' {
  const ffprobe: { path: string }
  export default ffprobe
}
declare module 'ffmpeg-static' {
  const ffmpegPath: string
  export default ffmpegPath
}
