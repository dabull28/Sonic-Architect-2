import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import youtubedl from "youtube-dl-exec";
import fetch from "node-fetch";
import ytSearch from "yt-search";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const spotifyInfo = require("spotify-url-info")(fetch);
const { getPreview } = spotifyInfo;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Route to extract audio from YouTube or Spotify
  app.get("/api/extract-audio", async (req, res) => {
    const { url } = req.query;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      let videoUrl = url;
      let isSpotify = false;

      // Handle Spotify links
      if (url.includes("spotify.com")) {
        isSpotify = true;
        try {
          const preview = await getPreview(url);
          const query = `${preview.title} ${preview.artist} audio`;
          const searchResults = await ytSearch(query);
          const video = searchResults.videos[0];
          if (!video) {
            throw new Error("Could not find a matching video on YouTube for this Spotify track.");
          }
          videoUrl = video.url;
        } catch (err: any) {
          console.error("Spotify extraction error:", err);
          return res.status(500).json({ error: "Failed to extract info from Spotify link: " + err.message });
        }
      }

      console.log(`Extracting audio from: ${videoUrl}`);

      // Extraction function with retry logic
      const extractWithRetry = async (targetUrl: string, attempt = 0): Promise<any> => {
        const configs = [
          { client: 'tv,web_embedded', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
          { client: 'android,web_embedded', ua: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36' },
          { client: 'ios,web_embedded', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' }
        ];

        if (attempt >= configs.length) {
          // If all direct clients fail and it's not already a search result, try searching for the video title
          if (!isSpotify && attempt === configs.length) {
            console.log("Direct extraction failed, attempting search fallback...");
            try {
              const videoId = targetUrl.split('v=')[1]?.split('&')[0] || targetUrl.split('/').pop();
              if (videoId) {
                const searchMeta = await ytSearch({ videoId });
                if (searchMeta && searchMeta.title) {
                  const fallbackQuery = `${searchMeta.title} audio`;
                  const fallbackResults = await ytSearch(fallbackQuery);
                  const fallbackVideo = fallbackResults.videos.find(v => v.videoId !== videoId);
                  if (fallbackVideo) {
                    console.log(`Found fallback video: ${fallbackVideo.url}`);
                    return extractWithRetry(fallbackVideo.url, 0);
                  }
                }
              }
            } catch (searchErr) {
              console.error("Search fallback failed:", searchErr);
            }
          }
          throw new Error("All extraction attempts failed due to YouTube bot detection. Please try uploading the file directly.");
        }

        const config = configs[attempt];
        try {
          return await youtubedl(targetUrl, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            format: 'bestaudio/best',
            forceIpv4: true,
            extractorArgs: `youtube:player_client=${config.client}`,
            userAgent: config.ua,
            referer: 'https://www.youtube.com/',
          } as any);
        } catch (err: any) {
          console.warn(`Attempt ${attempt} failed with client ${config.client}:`, err.message);
          return extractWithRetry(targetUrl, attempt + 1);
        }
      };

      const info = await extractWithRetry(videoUrl) as any;

      if (!info || !info.url) {
        throw new Error("Could not extract audio URL from YouTube.");
      }

      // Fetch the actual audio stream from the extracted URL
      const audioResponse = await fetch(info.url);
      
      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio stream: ${audioResponse.statusText}`);
      }

      // Set headers for audio streaming
      res.setHeader("Content-Type", audioResponse.headers.get("Content-Type") || "audio/mpeg");
      res.setHeader("Content-Disposition", `attachment; filename="audio.mp3"`);

      // Pipe the audio stream to the response
      audioResponse.body.pipe(res);

    } catch (err: any) {
      console.error("Extraction error:", err);
      res.status(500).json({ error: err.message || "Failed to extract audio" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
