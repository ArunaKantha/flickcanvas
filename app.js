const express = require("express");
const path = require("path");
const axios = require("axios");
const fs = require("fs");
const multer = require("multer");
const { spawnSync } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const FormData = require("form-data");
const { issueSignedToken, presignUrl } = require("@vercel/blob");
const sharp = require("sharp");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
// ===============================
// Pinterest OAuth - Step 3
// ===============================

app.get("/auth/pinterest", (req, res) => {
  const clientId = process.env.PINTEREST_APP_ID;

  const redirectUri =
  process.env.PINTEREST_REDIRECT_URI ||
  "https://flickcanvas.vercel.app/auth/pinterest/callback";

  const scope =
  "boards:read boards:write pins:read pins:write user_accounts:read";

  const pinterestAuthUrl =
    "https://www.pinterest.com/oauth/" +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=flickcanvas_pinterest`;

  res.redirect(pinterestAuthUrl);
});
// ===============================
// Pinterest OAuth Callback - Step 4
// ===============================

app.get("/auth/pinterest/callback", async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("Pinterest authorization code not found.");
    }

    const clientId = process.env.PINTEREST_APP_ID;
    const clientSecret = process.env.PINTEREST_APP_SECRET;

    const redirectUri =
  process.env.PINTEREST_REDIRECT_URI ||
  "https://flickcanvas.vercel.app/auth/pinterest/callback";

    const tokenResponse = await axios.post(
      "https://api.pinterest.com/v5/oauth/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      }),
      {
        auth: {
          username: clientId,
          password: clientSecret,
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
  

    const accessToken = tokenResponse.data.access_token;
        res.send(`
      <h1>🎉 Pinterest OAuth Successful!</h1>
      <p>Pinterest authorization was successful.</p>
      <p>Access token received successfully.</p>
    `);

  } catch (error) {
    console.error(
      "PINTEREST OAUTH ERROR:",
      error.response?.data || error.message
    );

    res.status(500).send("Pinterest OAuth failed.");
  }
});
// ===============================
// Pinterest Sandbox Dynamic TMDB Test Pin
// ===============================

app.get("/api/pinterest/test-movie", async (req, res) => {
  try {
    const accessToken = process.env.PINTEREST_ACCESS_TOKEN;

    if (!accessToken) {
      return res.status(500).send("PINTEREST_ACCESS_TOKEN is missing.");
    }

    const boardId = "1138073837026954410";

    // Get a real movie from TMDB trending
    const trendingResponse = await axios.get(
      `${TMDB_BASE_URL}/trending/movie/day`,
      {
        params: {
          api_key: process.env.TMDB_API_KEY
        }
      }
    );

    const movie = trendingResponse.data.results?.[0];

    if (!movie) {
      return res.status(404).send("No trending movie found.");
    }

    if (!movie.poster_path) {
      return res.status(404).send("Selected movie has no poster.");
    }

    const posterUrl =
      `${IMAGE_BASE_URL}${movie.poster_path}`;

    const siteUrl =
      (process.env.SITE_URL ||
        "https://flickcanvas.vercel.app").replace(/\/$/, "");

    const movieLink =
      `${siteUrl}/movie/${movie.id}`;

    const rating =
      Number(movie.vote_average || 0).toFixed(1);

    const description =
      `🎬 ${movie.title}

⭐ Rating: ${rating}/10

📅 Release Date: ${movie.release_date || "N/A"}

Discover more details, trailers and movie information on FLICKCANVAS.`;

    const pinResponse = await axios.post(
      "https://api-sandbox.pinterest.com/v5/pins",
      {
        board_id: boardId,

        title: `🎬 ${movie.title}`,

        description: description,

        media_source: {
          source_type: "image_url",
          url: posterUrl
        },

        link: movieLink
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(
      "PINTEREST SANDBOX TMDB PIN CREATED:",
      pinResponse.data
    );

    res.send(`
      <h1>🎉 Pinterest Sandbox Movie Pin Created!</h1>

      <p><strong>Movie:</strong> ${movie.title}</p>

      <p><strong>Rating:</strong> ${rating}/10</p>

      <p><strong>Board ID:</strong> ${boardId}</p>

      <p><strong>Pin ID:</strong> ${pinResponse.data.id}</p>

      <p>
        <strong>Movie URL:</strong>
        <a href="${movieLink}" target="_blank">
          ${movieLink}
        </a>
      </p>

      <p>✅ TMDB movie + poster + FLICKCANVAS link were sent to Pinterest Sandbox.</p>
    `);

  } catch (error) {
    console.error(
      "PINTEREST SANDBOX TMDB ERROR:",
      error.response?.data || error.message
    );

    res.status(500).send(
      `Pinterest Sandbox TMDB test failed: ${
        error.response?.data?.message ||
        error.message
      }`
    );
  }
});
// =========================
// REEL 7-DAY POST HISTORY
// Protected endpoint
// =========================

app.get("/api/reels/recent-posts", async (req, res) => {

  const authorization =
    req.get("authorization") || "";

  const bearerSecret =
    authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

  const cronSecret =
    process.env.CRON_SECRET ||
    process.env.FACEBOOK_CRON_SECRET;

  if (
    !cronSecret ||
    bearerSecret !== cronSecret
  ) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  try {

    const recentTexts = [];

    const sevenDaysAgo = new Date(
      Date.now() -
      7 * 24 * 60 * 60 * 1000
    );


    // =========================
    // FACEBOOK POSTS
    // =========================

    const pageId =
      process.env.FACEBOOK_PAGE_ID;

    const pageAccessToken =
      process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    const facebookGraphVersion =
      process.env.FACEBOOK_GRAPH_VERSION ||
      "v26.0";


    if (
      pageId &&
      pageAccessToken
    ) {

      try {

        const postsResponse =
          await axios.get(
            `https://graph.facebook.com/${facebookGraphVersion}/${pageId}/posts`,
            {
              params: {
                fields:
                  "id,message,created_time",

                limit: 100,

                access_token:
                  pageAccessToken
              }
            }
          );


        const posts =
          postsResponse.data.data || [];


        for (const post of posts) {

          if (
            !post.message ||
            !post.created_time
          ) {
            continue;
          }


          const postDate =
            new Date(
              post.created_time
            );


          if (
            postDate >= sevenDaysAgo
          ) {

            recentTexts.push(
              post.message
            );

          }

        }

      } catch (error) {

        console.error(
          "FACEBOOK HISTORY ERROR:",
          error.response?.data ||
          error.message
        );

      }


      // =========================
      // FACEBOOK VIDEOS / REELS
      // =========================

      try {

        const videosResponse =
          await axios.get(
            `https://graph.facebook.com/${facebookGraphVersion}/${pageId}/videos`,
            {
              params: {
                fields:
                  "id,title,description,created_time",

                limit: 100,

                access_token:
                  pageAccessToken
              }
            }
          );


        const videos =
          videosResponse.data.data || [];


        for (const video of videos) {

          if (!video.created_time) {
            continue;
          }


          const videoDate =
            new Date(
              video.created_time
            );


          if (
            videoDate < sevenDaysAgo
          ) {
            continue;
          }


          const videoText =
            `${video.title || ""} ${video.description || ""}`
              .trim();


          if (videoText) {

            recentTexts.push(
              videoText
            );

          }

        }

      } catch (error) {

        console.error(
          "FACEBOOK VIDEO HISTORY ERROR:",
          error.response?.data ||
          error.message
        );

      }

    }


    // =========================
    // INSTAGRAM POSTS / REELS
    // =========================

    const instagramAccountId =
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

    const instagramAccessToken =
      process.env.INSTAGRAM_ACCESS_TOKEN;

    const instagramGraphVersion =
      process.env.INSTAGRAM_GRAPH_VERSION ||
      "v26.0";


    if (
      instagramAccountId &&
      instagramAccessToken
    ) {

      try {

        const instagramResponse =
          await axios.get(
            `https://graph.facebook.com/${instagramGraphVersion}/${instagramAccountId}/media`,
            {
              params: {
                fields:
                  "id,caption,timestamp,media_type",

                limit: 100,

                access_token:
                  instagramAccessToken
              }
            }
          );


        const media =
          instagramResponse.data.data || [];


        for (const item of media) {

          if (
            !item.caption ||
            !item.timestamp
          ) {
            continue;
          }


          const mediaDate =
            new Date(
              item.timestamp
            );


          if (
            mediaDate >= sevenDaysAgo
          ) {

            recentTexts.push(
              item.caption
            );

          }

        }

      } catch (error) {

        console.error(
          "INSTAGRAM HISTORY ERROR:",
          error.response?.data ||
          error.message
        );

      }

    }


    // remove identical entries
    const uniqueTexts =
      [...new Set(recentTexts)];


    return res.json({
      success: true,
      days: 7,
      count: uniqueTexts.length,
      texts: uniqueTexts
    });


  } catch (error) {

    console.error(
      "RECENT POST HISTORY ERROR:",
      error.response?.data ||
      error.message
    );


    return res.status(500).json({
      success: false,
      error:
        error.response?.data ||
        error.message
    });

  }

});
   // =========================
// FACEBOOK + INSTAGRAM
// REEL AUTO POST
// =========================

app.get("/api/reels/auto-post", async (req, res) => {

  const authorization =
    req.get("authorization") || "";

  const bearerSecret =
    authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

  const manualSecret =
    req.query.secret || "";

  const cronSecret =
    process.env.CRON_SECRET ||
    process.env.FACEBOOK_CRON_SECRET;

  const isVercelCron =
    req.headers["x-vercel-cron"] === "1";


  if (
    !isVercelCron &&
    (
      !cronSecret ||
      (
        bearerSecret !== cronSecret &&
        manualSecret !== cronSecret
      )
    )
  ) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }


  try {

    // =========================
    // VIDEO URL
    // =========================

    const siteUrl = (
      process.env.SITE_URL ||
      "https://flickcanvas.vercel.app"
    ).replace(/\/$/, "");


    


    // =========================
    // READ REEL MOVIE METADATA
    // =========================

    const reelMetaPath =
      path.join(
        __dirname,
        "public",
        "auto-reel-meta.json"
      );


    if (!fs.existsSync(reelMetaPath)) {
      return res.status(500).json({
        success: false,
        error:
          "auto-reel-meta.json not found"
      });
    }


    const movieData =
      JSON.parse(
        fs.readFileSync(
          reelMetaPath,
          "utf8"
        )
      );
// =========================
// UNIQUE REEL VIDEO URL
// =========================

const videoFile =
  movieData.videoFile;

if (!videoFile) {
  return res.status(500).json({
    success: false,
    error:
      "Reel video filename missing from metadata"
  });
}

const videoUrl =
  `${siteUrl}/${videoFile}`;

console.log(
  `Reel video URL: ${videoUrl}`
);

    const movieId =
      movieData.movieId;

    const movieTitle =
      movieData.title;

    const rating =
      movieData.rating;


    if (
      !movieId ||
      !movieTitle
    ) {
      return res.status(500).json({
        success: false,
        error:
          "Invalid Reel movie metadata"
      });
    }


    // =========================
    // FLICKCANVAS MOVIE LINK
    // =========================

    const movieLink =
      `${siteUrl}/movie/${movieId}`;
// =========================
// FINAL 7-DAY DUPLICATE SAFETY CHECK
// =========================

const recentResponse =
  await axios.get(
    `${siteUrl}/api/reels/recent-posts`,
    {
      headers: {
        Authorization:
          `Bearer ${cronSecret}`
      }
    }
  );

const recentTexts =
  recentResponse.data?.texts;

if (!Array.isArray(recentTexts)) {
  throw new Error(
    "Could not verify Reel duplicate history"
  );
}

const normalizedMovieTitle =
  String(movieTitle || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const alreadyUsedRecently =
  recentTexts.some(text => {

    const normalizedText =
      String(text || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    return normalizedText.includes(
      normalizedMovieTitle
    );
  });

if (alreadyUsedRecently) {

  console.log(
    `Reel auto-post skipped - 7-day duplicate: ${movieTitle}`
  );

  return res.json({
    success: true,
    skipped: true,
    reason:
      "This movie was already used in a Facebook or Instagram post/Reel within the last 7 days",

    movie: {
      id: movieId,
      title: movieTitle,
      rating,
      link: movieLink
    }
  });
}

    // =========================
    // CAPTION
    // =========================

    const title =
      `${movieTitle} | FLICKCANVAS`;


    const caption =
`🎬 ${movieTitle}

⭐ Rating: ${rating}/10

🎥 Watch the trailer and view movie details:
${movieLink}

📌 Follow FLICKCANVAS for trending movies, trailers and movie recommendations!

#FLICKCANVAS #FLICKCANVASReel #Movies #MovieReels #MovieRecommendations`;


    console.log(
      `Reel movie: ${movieTitle}`
    );

    console.log(
      `Reel movie link: ${movieLink}`
    );


    let facebook = null;
    let instagram = null;


    // =========================
    // FACEBOOK REEL
    // =========================

    try {

      facebook =
        await publishFacebookReel({
          videoUrl,
          title,
          description: caption
        });


    } catch (facebookError) {

      console.error(
        "FACEBOOK REEL ERROR:",
        facebookError.response?.data ||
        facebookError.message
      );


      facebook = {
        success: false,
        error:
          facebookError.response?.data ||
          facebookError.message
      };

    }


    // =========================
    // INSTAGRAM REEL
    // =========================

    try {

      instagram =
        await publishInstagramReel({
          videoUrl,
          caption
        });


      // =========================
      // INSTAGRAM FIRST COMMENT
      // =========================

      if (
        instagram?.success &&
        instagram?.mediaId
      ) {

        try {

          const instagramAccessToken =
            process.env.INSTAGRAM_ACCESS_TOKEN;

          const instagramGraphVersion =
            process.env.INSTAGRAM_GRAPH_VERSION ||
            "v26.0";


          const commentMessage =
`🎬 Watch the trailer & view more details:

${movieLink}`;


          await axios.post(
            `https://graph.facebook.com/${instagramGraphVersion}/${instagram.mediaId}/comments`,
            null,
            {
              params: {
                message: commentMessage,
                access_token:
                  instagramAccessToken
              }
            }
          );


          console.log(
            `Instagram Reel first comment posted: ${movieTitle}`
          );


        } catch (commentError) {

          console.error(
            "INSTAGRAM REEL COMMENT ERROR:",
            commentError.response?.data ||
            commentError.message
          );

        }

      }


    } catch (instagramError) {

      console.error(
        "INSTAGRAM REEL ERROR:",
        instagramError.response?.data ||
        instagramError.message
      );


      instagram = {
        success: false,
        error:
          instagramError.response?.data ||
          instagramError.message
      };

    }


    // =========================
    // RESPONSE
    // =========================

    return res.json({
      success: true,

      movie: {
        id: movieId,
        title: movieTitle,
        rating,
        link: movieLink
      },

      videoUrl,

      facebook,
      instagram
    });


  } catch (error) {

    console.error(
      "REEL AUTO POST ERROR:",
      error.response?.data ||
      error.message
    );


    return res.status(500).json({
      success: false,
      error:
        error.response?.data ||
        error.message
    });

  }

});
// =========================
// GEMINI AI MOVIE ARTICLE
// =========================

async function generateMovieArticle(movie) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.log(
      "Gemini API key missing - using TMDB overview"
    );

    return (
      movie.overview ||
      "Discover this movie on FLICKCANVAS."
    );
  }

  try {
    const prompt = `
Write a short, engaging movie article in English about "${movie.title}".

Movie information:
Title: ${movie.title}
TMDB Overview: ${movie.overview || "N/A"}
Rating: ${Number(movie.vote_average || 0).toFixed(1)}/10

Requirements:
- Write exactly 3 to 5 sentences.
- Make the article specific to this movie.
- Do not simply copy the TMDB overview.
- Rewrite the information naturally in your own words.
- Mention the movie's story, atmosphere, themes, or what makes it interesting.
- Do not reveal major spoilers.
- Do not use a heading.
- Do not use hashtags.
- Do not mention TMDB or AI.
- Keep it suitable for a Facebook and Instagram movie post.
`;

    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        model: "gemini-3.6-flash",
        input: prompt
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        }
      }
    );

    // =========================
    // GET TEXT FROM GEMINI
    // =========================

    let article = "";

    // SDK-style response fallback
    if (
      typeof response.data?.output_text === "string"
    ) {
      article = response.data.output_text.trim();
    }

    // REST Interactions API response
    if (!article && Array.isArray(response.data?.steps)) {

      for (const step of response.data.steps) {

        if (
          step.type === "model_output" &&
          Array.isArray(step.content)
        ) {

          const textParts = step.content
            .filter(
              part =>
                part.type === "text" &&
                typeof part.text === "string"
            )
            .map(part => part.text.trim())
            .filter(Boolean);

          if (textParts.length) {
            article = textParts.join("\n").trim();
          }
        }
      }
    }

    if (!article) {
      console.error(
        "GEMINI RAW RESPONSE:",
        JSON.stringify(response.data)
      );

      throw new Error(
        "Gemini returned an empty article"
      );
    }

    console.log(
      `Gemini article generated successfully: ${movie.title}`
    );

    return article;

  } catch (error) {

    console.error(
      "GEMINI ARTICLE ERROR:",
      error.response?.data ||
      error.message
    );

    // If Gemini fails, use TMDB overview
    return (
      movie.overview ||
      "Discover this movie on FLICKCANVAS."
    );
  }
}
// =========================
// GEMINI AI REEL VIDEO PROMPT
// =========================

async function generateReelVideoPrompt(movie) {
  const apiKey = process.env.GEMINI_API_KEY;

  const fallbackPrompt = `
Create a cinematic vertical 9:16 video inspired by the mood and genre of a movie.

Movie title: ${movie.title}
Overview: ${movie.overview || "N/A"}

Create an original cinematic scene.
Do not recreate copyrighted characters, actors, costumes, logos, or exact movie scenes.
Use realistic lighting, cinematic camera movement, strong atmosphere and detailed environments.
No text, no subtitles, no logos, no watermark.
Duration: 8 seconds.
Vertical 9:16.
  `.trim();

  if (!apiKey) {
    return fallbackPrompt;
  }

  try {
    const prompt = `
Create ONE ready-to-copy AI video generation prompt for a short cinematic vertical Reel.

Movie information:
Title: ${movie.title}
Genres: ${
      Array.isArray(movie.genres)
        ? movie.genres.map(g => g.name).join(", ")
        : "N/A"
    }
Overview: ${movie.overview || "N/A"}

Requirements:
- 8 second video.
- Vertical 9:16.
- Photorealistic cinematic quality.
- Create a completely original scene inspired only by the movie's mood, genre and atmosphere.
- Include at most one fictional adult character.
- The character must be completely original and must not resemble any real actor, celebrity, public figure, or existing movie character.
- Do NOT reproduce copyrighted characters, actors, costumes, logos, locations or exact scenes.
- Do not include copyrighted costumes, signature props, masks, logos, or recognizable franchise elements.
- Use only generic clothing and original visual design.
- Avoid exact scenes from the movie.
- Use slow natural camera movement.
- Strong opening visual in the first second.
- Realistic lighting and environmental motion.
- No children.
- No gore.
- No dialogue.
- No text.
- No subtitles.
- No logos.
- No watermark.
- Return only the final AI video prompt.
`;

    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        model: "gemini-3.6-flash",
        input: prompt
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        }
      }
    );

    let generatedPrompt = "";

    if (typeof response.data?.output_text === "string") {
      generatedPrompt = response.data.output_text.trim();
    }

    if (
      !generatedPrompt &&
      Array.isArray(response.data?.steps)
    ) {
      for (const step of response.data.steps) {
        if (
          step.type === "model_output" &&
          Array.isArray(step.content)
        ) {
          const textParts = step.content
            .filter(
              part =>
                part.type === "text" &&
                typeof part.text === "string"
            )
            .map(part => part.text.trim())
            .filter(Boolean);

          if (textParts.length) {
            generatedPrompt = textParts.join("\n").trim();
            break;
          }
        }
      }
    }

    if (!generatedPrompt) {
      throw new Error("Gemini returned an empty Reel prompt");
    }

    return generatedPrompt;

  } catch (error) {
    console.error(
      "GEMINI REEL PROMPT ERROR:",
      error.response?.data || error.message
    );

    return fallbackPrompt;
  }
}
function getReelFontPath() {
  const bundledFont = path.join(
    __dirname,
    "node_modules",
    "dejavu-fonts-ttf",
    "ttf",
    "DejaVuSans.ttf"
  );

  const candidates = [
    bundledFont,
    "C:\\Windows\\Fonts\\arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"
  ];

  for (const fontPath of candidates) {
    if (fs.existsSync(fontPath)) {
      console.log("FFMPEG FONT FOUND:", fontPath);
      return fontPath;
    }
  }

  console.log("FFMPEG FONT NOT FOUND");
  return "";
}

function escapeFFmpegPath(filePath) {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}
function escapeSvgText(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapReelTitle(title, maxLength = 22) {
  const words = String(title || "").split(/\s+/);

  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current
      ? `${current} ${word}`
      : word;

    if (
      next.length > maxLength &&
      current
    ) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 2);
}

async function createReelCardImages({
  movieTitle,
  rating,
  outputDir
}) {
  const introCardPath = path.join(
    outputDir,
    `reel-intro-${Date.now()}.png`
  );

  const outroCardPath = path.join(
    outputDir,
    `reel-outro-${Date.now()}.png`
  );

  const introSvg = `
    <svg width="720" height="1280"
         xmlns="http://www.w3.org/2000/svg">

      <rect width="720"
            height="1280"
            fill="#080808"/>

      <text
        x="360"
        y="610"
        text-anchor="middle"
        fill="#ffffff"
        font-family="Arial, DejaVu Sans, sans-serif"
        font-size="58"
        font-weight="700">
        FLICKCANVAS
      </text>

      <text
        x="360"
        y="675"
        text-anchor="middle"
        fill="#b8b8b8"
        font-family="Arial, DejaVu Sans, sans-serif"
        font-size="27">
        MOVIE REEL
      </text>

    </svg>
  `;

  const titleLines = wrapReelTitle(movieTitle);

  const titleSvgLines = titleLines
    .map(
      (line, index) => `
        <text
          x="360"
          y="${470 + index * 58}"
          text-anchor="middle"
          fill="#ffffff"
          font-family="Arial, DejaVu Sans, sans-serif"
          font-size="43"
          font-weight="700">
          ${escapeSvgText(line)}
        </text>
      `
    )
    .join("");

  const outroSvg = `
    <svg width="720" height="1280"
         xmlns="http://www.w3.org/2000/svg">

      <rect width="720"
            height="1280"
            fill="#080808"/>

      ${titleSvgLines}

      <text
        x="360"
        y="555"
        text-anchor="middle"
        fill="#ffffff"
        font-family="Arial, DejaVu Sans, sans-serif"
        font-size="31"
        font-weight="600">
        RATING ${escapeSvgText(String(rating))}/10
      </text>

      <text
        x="360"
        y="690"
        text-anchor="middle"
        fill="#ffffff"
        font-family="Arial, DejaVu Sans, sans-serif"
        font-size="32"
        font-weight="700">
        WATCH TRAILER &amp; DETAILS
      </text>

      <text
        x="360"
        y="760"
        text-anchor="middle"
        fill="#b8b8b8"
        font-family="Arial, DejaVu Sans, sans-serif"
        font-size="25">
        FLICKCANVAS
      </text>

    </svg>
  `;

  await fs.promises.mkdir(outputDir, { recursive: true });

  await sharp(Buffer.from(introSvg))
    .png()
    .toFile(introCardPath);

  await sharp(Buffer.from(outroSvg))
    .png()
    .toFile(outroCardPath);

  return {
    introCardPath,
    outroCardPath
  };
}
async function getBlobPut() {
  const { put } = await import("@vercel/blob");
  return put;
}
// =========================
// EJS SETUP
// =========================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// =========================
// MIDDLEWARE
// =========================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
const reelUploadDir =
  process.env.VERCEL
    ? path.join("/tmp", "reel-uploads")
    : path.join(
        __dirname,
        "public",
        "reel-uploads"
      );

fs.mkdirSync(reelUploadDir, {
  recursive: true
});

const reelUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, reelUploadDir);
    },

    filename: function (req, file, cb) {
      const ext =
        path.extname(file.originalname) || ".mp4";

      cb(
        null,
        `manual-reel-${Date.now()}${ext}`
      );
    }
  }),

  limits: {
    fileSize: 100 * 1024 * 1024
  }
});
// =========================
// TMDB CONFIG
// =========================
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Poster image:
// https://image.tmdb.org/t/p/w500/POSTER_PATH
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

// Backdrop image:
// https://image.tmdb.org/t/p/original/BACKDROP_PATH
const BACKDROP_BASE_URL = "https://image.tmdb.org/t/p/original";
// =========================
// PRIVATE REEL STUDIO
// =========================

function checkReelStudioSecret(req, res, next) {
  const studioSecret = process.env.REEL_STUDIO_SECRET;

  const suppliedSecret =
    req.query.key ||
    req.body?.key ||
    "";

  if (
    !studioSecret ||
    suppliedSecret !== studioSecret
  ) {
    return res.status(401).send("Unauthorized");
  }

  next();
}


// =========================
// REEL STUDIO PAGE
// =========================

app.get(
  "/reel-studio",
  checkReelStudioSecret,
  async (req, res) => {
    try {
      const trendingResponse = await axios.get(
        `${TMDB_BASE_URL}/trending/movie/day`,
        {
          params: {
            api_key: process.env.TMDB_API_KEY,
            language: "en-US"
          }
        }
      );

      const movies = (
        trendingResponse.data.results || []
      )
        .filter(
          movie =>
            movie.id &&
            movie.title &&
            movie.poster_path
        )
        .slice(0, 12);

      res.render("reel-studio", {
  movies,
  selectedMovie: null,
  videoPrompt: "",
  imageBase: IMAGE_BASE_URL,
  key: req.query.key,
  searchQuery: ""
});

    } catch (error) {
      console.error(
        "REEL STUDIO ERROR:",
        error.response?.data || error.message
      );

      res.status(500).send(
        "Could not load Reel Studio."
      );
    }
  }
);

app.get(
  "/reel-studio/search",
  checkReelStudioSecret,
  async (req, res) => {
    try {
      const query = String(req.query.q || "").trim();

      if (!query) {
        return res.redirect(
          `/reel-studio?key=${encodeURIComponent(req.query.key || "")}`
        );
      }

      const searchResponse = await axios.get(
        `${TMDB_BASE_URL}/search/movie`,
        {
          params: {
            api_key: process.env.TMDB_API_KEY,
            language: "en-US",
            query,
            page: 1,
            include_adult: false
          }
        }
      );

      const movies = (
        searchResponse.data.results || []
      )
        .filter(
          movie =>
            movie.id &&
            movie.title &&
            movie.poster_path
        )
        .slice(0, 12);

      res.render("reel-studio", {
        movies,
        selectedMovie: null,
        videoPrompt: "",
        imageBase: IMAGE_BASE_URL,
        key: req.query.key,
        searchQuery: query
      });

    } catch (error) {
      console.error(
        "REEL STUDIO SEARCH ERROR:",
        error.response?.data || error.message
      );

      res.status(500).send(
        "Could not search movies."
      );
    }
  }
);
app.post(
  "/reel-studio/blob-upload",
  checkReelStudioSecret,
  async (req, res) => {
    try {
      const pathname = String(
        req.body.pathname || ""
      ).trim();

      if (!pathname) {
        return res.status(400).json({
          error: "Blob pathname is missing."
        });
      }

      // Only allow Reel Studio video uploads
      if (
        !pathname.startsWith("reel-uploads/") ||
        pathname.includes("..")
      ) {
        return res.status(400).json({
          error: "Invalid Blob pathname."
        });
      }

      const validUntil =
        Date.now() + 15 * 60 * 1000;

      const token = await issueSignedToken({
        pathname,
        operations: ["put"],
        validUntil
      });

      const { presignedUrl } =
        await presignUrl(
          token,
          {
            pathname,
            operation: "put",
            validUntil
          }
        );

      // This store is Public, so after upload
      // the URL without signing query parameters
      // is the permanent public Blob URL.
      const blobUrl =
        presignedUrl.split("?")[0];

      return res.json({
        success: true,
        presignedUrl,
        blobUrl
      });

    } catch (error) {
      console.error(
        "BLOB SIGNED URL ERROR:",
        error.response?.data ||
        error.message ||
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          "Could not create Blob upload URL."
      });
    }
  }
);
// =========================
// SELECT MOVIE + GENERATE PROMPT
// =========================

app.post(
  "/reel-studio/generate",
  checkReelStudioSecret,
  async (req, res) => {
    try {
      const movieId = req.body.movieId;

      if (!movieId) {
        return res.status(400).send(
          "Movie ID is required."
        );
      }

      const movieResponse = await axios.get(
        `${TMDB_BASE_URL}/movie/${movieId}`,
        {
          params: {
            api_key: process.env.TMDB_API_KEY,
            language: "en-US"
          }
        }
      );

      const selectedMovie =
        movieResponse.data;

      const trendingResponse =
        await axios.get(
          `${TMDB_BASE_URL}/trending/movie/day`,
          {
            params: {
              api_key:
                process.env.TMDB_API_KEY,
              language: "en-US"
            }
          }
        );

      const movies = (
        trendingResponse.data.results || []
      )
        .filter(
          movie =>
            movie.id &&
            movie.title &&
            movie.poster_path
        )
        .slice(0, 12);

      const videoPrompt =
        await generateReelVideoPrompt(
          selectedMovie
        );

      res.render("reel-studio", {
  movies,
  selectedMovie,
  videoPrompt,
  imageBase: IMAGE_BASE_URL,
  key: req.body.key,
  searchQuery: ""
});

    } catch (error) {
      console.error(
        "REEL PROMPT GENERATION ERROR:",
        error.response?.data || error.message
      );

      res.status(500).send(
        "Could not generate AI video prompt."
      );
    }
  }
);
app.post(
  "/reel-studio/upload",
  checkReelStudioSecret,
  reelUpload.single("video"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).send(
          "Video file is required."
        );
      }

      const movieId = req.body.movieId;

      const movieResponse = await axios.get(
        `${TMDB_BASE_URL}/movie/${movieId}`,
        {
          params: {
            api_key: process.env.TMDB_API_KEY,
            language: "en-US"
          }
        }
      );

      const selectedMovie =
        movieResponse.data;

      const uploadedVideoUrl =
        `/reel-uploads/${req.file.filename}`;
      const uploadedVideoFile =
  req.file.filename;
      res.render("reel-studio-uploaded", {
  selectedMovie,
  uploadedVideoUrl,
  uploadedVideoFile,
  imageBase: IMAGE_BASE_URL,
  key:
    req.query.key ||
    req.body.key
});

    } catch (error) {
      console.error(
        "REEL VIDEO UPLOAD ERROR:",
        error.response?.data ||
        error.message
      );

      res.status(500).send(
        "Could not upload Reel video."
      );
    }
  }
);
app.post(
  "/reel-studio/uploaded-blob",
  checkReelStudioSecret,
  async (req, res) => {
    try {
      const movieId = String(req.body.movieId || "").trim();
      const videoUrl = String(req.body.videoUrl || "").trim();

      if (!movieId || !videoUrl) {
        return res.status(400).send(
          "Movie ID or uploaded video URL is missing."
        );
      }

      let parsedUrl;

      try {
        parsedUrl = new URL(videoUrl);
      } catch {
        return res.status(400).send(
          "Invalid uploaded video URL."
        );
      }

      if (
        parsedUrl.protocol !== "https:" ||
        !parsedUrl.hostname.endsWith(
          ".blob.vercel-storage.com"
        )
      ) {
        return res.status(400).send(
          "Invalid Vercel Blob video URL."
        );
      }

      const movieResponse = await axios.get(
        `${TMDB_BASE_URL}/movie/${movieId}`,
        {
          params: {
            api_key: process.env.TMDB_API_KEY,
            language: "en-US"
          }
        }
      );

      const movie = movieResponse.data;

      const rating = Number(
        movie.vote_average || 0
      ).toFixed(1);

      return res.render("reel-studio-uploaded", {
        movie,
        rating,
        videoUrl,
        videoFile: "",
        key: req.query.key
      });

    } catch (error) {
      console.error(
        "REEL BLOB PREVIEW ERROR:",
        error.response?.data || error.message
      );

      return res.status(500).send(
        "Could not open uploaded Reel preview."
      );
    }
  }
);
// =========================
// CREATE FINAL MANUAL REEL
// =========================

app.post(
  "/reel-studio/create-final",
  checkReelStudioSecret,
  async (req, res) => {
    try {
      const movieId = String(
  req.body.movieId || ""
).trim();

const videoFile = path.basename(
  req.body.videoFile || ""
);

const videoUrl = String(
  req.body.videoUrl || ""
).trim();

if (!movieId) {
  return res.status(400).send(
    "Movie ID is missing."
  );
}

let inputPath;

// =========================
// BLOB VIDEO INPUT
// =========================
if (videoUrl) {
  let parsedUrl;

  try {
    parsedUrl = new URL(videoUrl);
  } catch {
    return res.status(400).send(
      "Invalid Blob video URL."
    );
  }

  if (
    parsedUrl.protocol !== "https:" ||
    !parsedUrl.hostname.endsWith(
      ".blob.vercel-storage.com"
    )
  ) {
    return res.status(400).send(
      "Invalid Vercel Blob video URL."
    );
  }

  const tempInputDir = process.env.VERCEL
    ? "/tmp"
    : reelUploadDir;

  fs.mkdirSync(
    tempInputDir,
    { recursive: true }
  );

  inputPath = path.join(
    tempInputDir,
    `blob-input-${movieId}-${Date.now()}.mp4`
  );

  const videoResponse = await axios.get(
    videoUrl,
    {
      responseType: "arraybuffer",
      timeout: 120000
    }
  );

  fs.writeFileSync(
    inputPath,
    Buffer.from(videoResponse.data)
  );

  console.log(
    "BLOB VIDEO DOWNLOADED:",
    inputPath
  );

} else if (videoFile) {

  inputPath = path.join(
    reelUploadDir,
    videoFile
  );

  if (!fs.existsSync(inputPath)) {
    return res.status(404).send(
      "Uploaded AI video not found."
    );
  }

} else {
  return res.status(400).send(
    "Uploaded video is missing."
  );
}

      // Get full movie details
      const movieResponse = await axios.get(
        `${TMDB_BASE_URL}/movie/${movieId}`,
        {
          params: {
            api_key:
              process.env.TMDB_API_KEY,
            language: "en-US"
          }
        }
      );

      const movie =
        movieResponse.data;

      const rating =
        Number(
          movie.vote_average || 0
        ).toFixed(1);

      // =========================
      // OUTPUT DIRECTORY
      // =========================

      const outputDir =
  process.env.VERCEL
    ? path.join("/tmp", "reel-output")
    : path.join(
        __dirname,
        "public",
        "reel-output"
      );

      fs.mkdirSync(outputDir, {
        recursive: true
      });

      const outputFile =
        `final-reel-${movie.id}-${Date.now()}.mp4`;

      const outputPath =
        path.join(
          outputDir,
          outputFile
        );

      

      // =========================
      // VIDEO FILTER
      // =========================
      const { introCardPath, outroCardPath } =
  await createReelCardImages({
    movieTitle: movie.title,
    rating,
    outputDir
  });
      const filter = [

  // Intro card PNG - 2 sec
  `[1:v]` +
  `scale=720:1280,` +
  `setsar=1,` +
  `fps=30,` +
  `trim=duration=2,` +
  `setpts=PTS-STARTPTS` +
  `[intro]`,

  // AI clip - exactly 8 sec
  `[0:v]` +
  `scale=720:1280:` +
  `force_original_aspect_ratio=increase,` +
  `crop=720:1280,` +
  `setsar=1,` +
  `fps=30,` +
  `tpad=stop_mode=clone:stop_duration=8,` +
  `trim=duration=8,` +
  `setpts=PTS-STARTPTS` +
  `[clip]`,

  // Outro card PNG - 5 sec
  `[2:v]` +
  `scale=720:1280,` +
  `setsar=1,` +
  `fps=30,` +
  `trim=duration=5,` +
  `setpts=PTS-STARTPTS` +
  `[outro]`,

  // 2 + 8 + 5 = 15 sec
  `[intro][clip][outro]` +
  `concat=n=3:v=1:a=0,` +
  `format=yuv420p` +
  `[v]`

].join(";");

      // =========================
      // RUN FFMPEG
      // =========================

      const args = [
  "-y",

  // AI video
  "-i",
  inputPath,

  // Intro card PNG
  "-loop",
  "1",
  "-t",
  "2",
  "-i",
  introCardPath,

  // Outro card PNG
  "-loop",
  "1",
  "-t",
  "5",
  "-i",
  outroCardPath,

  "-filter_complex",
  filter,

  "-map",
  "[v]",

  "-t",
  "15",

  "-r",
  "30",

  "-c:v",
  "libx264",

  "-preset",
  "medium",

  "-crf",
  "21",

  "-pix_fmt",
  "yuv420p",

  "-an",

  "-movflags",
  "+faststart",

  outputPath
];

      console.log(
        `Creating manual final Reel: ${movie.title}`
      );

      const result =
        spawnSync(
          ffmpegPath,
          args,
          {
            encoding: "utf8"
          }
        );

      if (result.status !== 0) {
        console.error(
          "FFMPEG STDERR:",
          result.stderr
        );

        throw new Error(
          "Final Reel FFmpeg generation failed"
        );
      }

      console.log(
        `FINAL REEL CREATED: ${outputFile}`
      );

      const put = await getBlobPut();

const finalVideoBuffer =
  fs.readFileSync(outputPath);

const finalBlob = await put(
  `reels/${outputFile}`,
  finalVideoBuffer,
  {
    access: "public",
    addRandomSuffix: false,
    contentType: "video/mp4",
    oidcToken: process.env.VERCEL_OIDC_TOKEN,
    storeId: process.env.BLOB_STORE_ID
  }
);

const finalVideoUrl =
  finalBlob.url;

      res.render(
        "reel-studio-final",
        {
          movie,
          rating,
          finalVideoUrl,
          finalVideoFile:
            outputFile,
          key:
            req.query.key ||
            req.body.key
        }
      );

    } catch (error) {
      console.error(
        "FINAL REEL ERROR:",
        error.response?.data ||
        error.message
      );

      res.status(500).send(
        `Could not create final Reel: ${
          error.message
        }`
      );
    }
  }
);
// =========================
// REEL STUDIO - PUBLISH ALL
// =========================

app.post(
  "/reel-studio/publish-all",
  checkReelStudioSecret,
  async (req, res) => {
    try {
      const movieId = req.body.movieId;
      const finalVideoFile =
        path.basename(req.body.finalVideoFile || "");

      if (!movieId || !finalVideoFile) {
        return res.status(400).send(
          "Movie ID or final Reel file is missing."
        );
      }

      const finalVideoPath = path.join(
        __dirname,
        "public",
        "reel-output",
        finalVideoFile
      );

      if (!fs.existsSync(finalVideoPath)) {
        return res.status(404).send(
          "Final Reel video not found."
        );
      }

      const movieResponse = await axios.get(
        `${TMDB_BASE_URL}/movie/${movieId}`,
        {
          params: {
            api_key: process.env.TMDB_API_KEY,
            language: "en-US"
          }
        }
      );

      const movie =
        movieResponse.data;

      const rating =
        Number(movie.vote_average || 0).toFixed(1);

      const siteUrl = (
        process.env.SITE_URL ||
        "https://flickcanvas.vercel.app"
      ).replace(/\/$/, "");

      const movieLink =
        `${siteUrl}/movie/${movie.id}`;

      const finalVideoUrl =
  req.body.finalVideoUrl;
if (
  !finalVideoUrl ||
  !finalVideoUrl.startsWith("https://")
) {
  return res.status(400).send(
    "Public final Reel URL is missing."
  );
}
      const posterUrl =
        movie.poster_path
          ? `${IMAGE_BASE_URL}${movie.poster_path}`
          : "";

      const title =
        `${movie.title} | FLICKCANVAS`;

      const caption =
`🎬 ${movie.title}

⭐ Rating: ${rating}/10

🎥 Watch trailer and movie details:
${movieLink}

📌 Follow FLICKCANVAS for more movie reels and recommendations!

#FLICKCANVAS #MovieReels #Movies #MovieRecommendations`;

      let facebook = null;
      let instagram = null;
      let pinterest = null;

      // =========================
      // FACEBOOK
      // =========================

      try {
        facebook =
          await publishFacebookReel({
            videoUrl: finalVideoUrl,
            title,
            description: caption
          });
      } catch (error) {
        facebook = {
          success: false,
          error:
            error.response?.data ||
            error.message
        };
      }

      // =========================
      // INSTAGRAM
      // =========================

      try {
        instagram =
          await publishInstagramReel({
            videoUrl: finalVideoUrl,
            caption
          });

        if (
          instagram?.success &&
          instagram?.mediaId
        ) {
          try {
            const instagramAccessToken =
              process.env.INSTAGRAM_ACCESS_TOKEN;

            const instagramGraphVersion =
              process.env.INSTAGRAM_GRAPH_VERSION ||
              "v26.0";

            await axios.post(
              `https://graph.facebook.com/${instagramGraphVersion}/${instagram.mediaId}/comments`,
              null,
              {
                params: {
                  message:
                    `🎬 Watch trailer & movie details:\n\n${movieLink}`,
                  access_token:
                    instagramAccessToken
                }
              }
            );
          } catch (commentError) {
            console.error(
              "INSTAGRAM COMMENT ERROR:",
              commentError.response?.data ||
              commentError.message
            );
          }
        }

      } catch (error) {
        instagram = {
          success: false,
          error:
            error.response?.data ||
            error.message
        };
      }

      // =========================
      // PINTEREST
      // =========================

      try {
        pinterest =
          await publishPinterestVideoPin({
            videoPath: finalVideoPath,
            coverImageUrl: posterUrl,
            title: `🎬 ${movie.title}`,
            description:
`⭐ Rating: ${rating}/10

🎥 Watch trailer and movie details on FLICKCANVAS.

#FLICKCANVAS #Movies #MovieReels`,
            link: movieLink
          });

      } catch (error) {
        pinterest = {
          success: false,
          error:
            error.response?.data ||
            error.message
        };
      }

      res.render(
        "reel-studio-published",
        {
          movie,
          facebook,
          instagram,
          pinterest,
          key:
            req.query.key ||
            req.body.key
        }
      );

    } catch (error) {
      console.error(
        "REEL STUDIO PUBLISH ALL ERROR:",
        error.response?.data ||
        error.message
      );

      res.status(500).send(
        `Publish failed: ${error.message}`
      );
    }
  }
);
// =========================
// HOME PAGE
// =========================
app.get("/", async (req, res) => {
  try {
    const [popular, trending, nowPlaying] = await Promise.all([
      axios.get(`${TMDB_BASE_URL}/movie/popular`, {
        params: {
          api_key: process.env.TMDB_API_KEY,
          language: "en-US",
          page: 1
        }
      }),

      axios.get(`${TMDB_BASE_URL}/trending/movie/week`, {
        params: {
          api_key: process.env.TMDB_API_KEY,
          language: "en-US"
        }
      }),

      axios.get(`${TMDB_BASE_URL}/movie/now_playing`, {
        params: {
          api_key: process.env.TMDB_API_KEY,
          language: "en-US",
          page: 1
        }
      })
    ]);

    res.render("index", {
      popular: popular.data.results || [],
      trending: trending.data.results || [],
      nowPlaying: nowPlaying.data.results || [],
      imageBase: IMAGE_BASE_URL,
      searchQuery: null
    });

  } catch (error) {
    console.error(
      "HOME ERROR:",
      error.response?.data || error.message
    );

    res.status(500).render("index", {
      popular: [],
      trending: [],
      nowPlaying: [],
      imageBase: IMAGE_BASE_URL,
      searchQuery: null
    });
  }
});

// =========================
// SEARCH
// =========================
app.get("/search", async (req, res) => {
  const query = req.query.q;

  // Empty search
  if (!query || !query.trim()) {
    return res.redirect("/");
  }

  try {
    const response = await axios.get(
      `${TMDB_BASE_URL}/search/movie`,
      {
        params: {
          api_key: process.env.TMDB_API_KEY,
          query: query.trim(),
          language: "en-US",
          page: 1,
          include_adult: false
        }
      }
    );

    res.render("index", {
      popular: [],
      trending: response.data.results || [],
      nowPlaying: [],
      imageBase: IMAGE_BASE_URL,
      searchQuery: query
    });

  } catch (error) {
    console.error(
      "SEARCH ERROR:",
      error.response?.data || error.message
    );

    res.redirect("/");
  }
});
// =========================
// DYNAMIC SITEMAP
// =========================

app.get("/sitemap.xml", async (req, res) => {
  try {
    const requests = [];

    // Popular movies - pages 1 to 3
    for (let page = 1; page <= 3; page++) {
      requests.push(
        axios.get(`${TMDB_BASE_URL}/movie/popular`, {
          params: {
            api_key: process.env.TMDB_API_KEY,
            language: "en-US",
            page
          }
        })
      );
    }

    // Trending movies - weekly
    requests.push(
      axios.get(`${TMDB_BASE_URL}/trending/movie/week`, {
        params: {
          api_key: process.env.TMDB_API_KEY,
          language: "en-US"
        }
      })
    );

    // Now playing movies - pages 1 to 3
    for (let page = 1; page <= 3; page++) {
      requests.push(
        axios.get(`${TMDB_BASE_URL}/movie/now_playing`, {
          params: {
            api_key: process.env.TMDB_API_KEY,
            language: "en-US",
            page
          }
        })
      );
    }

    const responses = await Promise.all(requests);

    const movies = responses.flatMap(
      response => response.data.results || []
    );

    // Remove duplicate movie IDs
    const uniqueMovies = Array.from(
      new Map(movies.map(movie => [movie.id, movie])).values()
    );

    const urls = [
      "https://flickcanvas.vercel.app/",
      ...uniqueMovies.map(
        movie => `https://flickcanvas.vercel.app/movie/${movie.id}`
      )
    ];

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `
  <url>
    <loc>${url}</loc>
  </url>`).join("")}
</urlset>`;

    res.set("Content-Type", "application/xml");
    res.send(sitemap);

  } catch (error) {
    console.error(
      "SITEMAP ERROR:",
      error.response?.data || error.message
    );

    res.status(500).send("Sitemap generation failed");
  }
});

// =========================
// MOVIE DETAILS
// =========================
app.get("/movie/:id", async (req, res) => {
  const movieId = req.params.id;

  try {
    const response = await axios.get(
      `${TMDB_BASE_URL}/movie/${movieId}`,
      {
        params: {
          api_key: process.env.TMDB_API_KEY,
          language: "en-US",
          append_to_response: "credits,videos,recommendations"
        }
      }
    );

    const movie = response.data;

    // =========================
    // RELATED MOVIES
    // =========================
    const relatedMovies = (
      movie.recommendations?.results || []
    )
      .filter(
        item =>
          item.id &&
          item.title &&
          item.poster_path
      )
      .slice(0, 8);

    const providers = {
      watch: [],
      rent: [],
      buy: []
    };

    // =========================
    // WATCHMODE PROVIDERS
    // =========================
    if (process.env.WATCHMODE_API_KEY) {
      try {
        const watchmodeResponse = await axios.get(
          "https://api.watchmode.com/v1/search/",
          {
            params: {
              apiKey: process.env.WATCHMODE_API_KEY,
              search_field: "name",
              search_value: movie.title
            }
          }
        );

        const titles =
          watchmodeResponse.data.title_results || [];

        if (titles.length > 0) {
          const watchmodeId = titles[0].id;

          const sourcesResponse = await axios.get(
            `https://api.watchmode.com/v1/title/${watchmodeId}/sources/`,
            {
              params: {
                apiKey:
                  process.env.WATCHMODE_API_KEY,

                regions:
                  process.env.WATCHMODE_REGION ||
                  "US"
              }
            }
          );

          const sources =
            Array.isArray(sourcesResponse.data)
              ? sourcesResponse.data
              : [];

          const seen = new Set();

          function addProvider(group, source) {
            if (!source || !source.web_url) {
              return;
            }

            const key =
              `${source.name || "Provider"}|${source.web_url}`;

            if (
              seen.has(`${group}|${key}`)
            ) {
              return;
            }

            seen.add(
              `${group}|${key}`
            );

            providers[group].push({
              name:
                source.name ||
                "Official Provider",

              url:
                source.web_url,

              type:
                source.type || ""
            });
          }

          sources.forEach(source => {
            if (
              ["sub", "free"].includes(
                source.type
              )
            ) {
              addProvider(
                "watch",
                source
              );
            } else if (
              source.type === "rent"
            ) {
              addProvider(
                "rent",
                source
              );
            } else if (
              source.type === "purchase"
            ) {
              addProvider(
                "buy",
                source
              );
            }
          });
        }

      } catch (watchmodeError) {
        console.error(
          "WATCHMODE ERROR:",
          watchmodeError.response?.data ||
          watchmodeError.message
        );
      }
    }

    res.render("movie", {
      movie,
      imageBase:
        IMAGE_BASE_URL,
      backdropBase:
        BACKDROP_BASE_URL,
      providers,
      cast:
        movie.credits?.cast || [],
      crew:
        movie.credits?.crew || [],
      relatedMovies
    });

  } catch (error) {
    console.error(
      "MOVIE DETAILS ERROR:",
      error.response?.data ||
      error.message
    );

    res
      .status(404)
      .send("Movie not found");
  }
});



// =========================
// FACEBOOK AUTO POST
// =========================

app.get("/api/facebook/auto-post", async (req, res) => {
  const authorization = req.get("authorization") || "";

const bearerSecret = authorization.startsWith("Bearer ")
  ? authorization.slice(7)
  : "";

const manualSecret = req.query.secret || "";

const cronSecret =
  process.env.CRON_SECRET ||
  process.env.FACEBOOK_CRON_SECRET;

// Vercel Cron requests
const isVercelCron =
  req.headers["x-vercel-cron"] === "1";

if (
  !isVercelCron &&
  (!cronSecret ||
    (bearerSecret !== cronSecret &&
     manualSecret !== cronSecret))
) {
  return res.status(401).json({
    error: "Unauthorized"
  });
}

  try {
    // =========================
// MOVIE SELECTION
// =========================

// Vercel / GitHub Actions times:
// 14:00 UTC = 7:30 PM Sri Lanka → Trending #1
// 22:00 UTC = 3:30 AM Sri Lanka → Movie Pick

const currentUTCHour = new Date().getUTCHours();

const isMoviePick = currentUTCHour === 22;

let movie;

if (!isMoviePick) {

  // =========================
  // TRENDING MOVIE
  // Skip movies posted within last 7 days
  // =========================

  const trendingResponse = await axios.get(
    `${TMDB_BASE_URL}/trending/movie/day`,
    {
      params: {
        api_key: process.env.TMDB_API_KEY,
        language: "en-US"
      }
    }
  );

  const trendingMovies =
    (trendingResponse.data.results || [])
      .filter(item =>
        item.id &&
        item.title &&
        item.poster_path
      );

  if (!trendingMovies.length) {
    throw new Error("No trending movies found");
  }

  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  );

  // =========================
  // FACEBOOK HISTORY
  // =========================

  const pageId =
    process.env.FACEBOOK_PAGE_ID;

  const pageAccessToken =
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  const graphVersion =
    process.env.FACEBOOK_GRAPH_VERSION || "v26.0";

  let facebookPosts = [];

  if (pageId && pageAccessToken) {
    try {
      const postsResponse = await axios.get(
        `https://graph.facebook.com/${graphVersion}/${pageId}/posts`,
        {
          params: {
            fields: "id,message,created_time",
            limit: 100,
            access_token: pageAccessToken
          }
        }
      );

      facebookPosts =
        postsResponse.data.data || [];

    } catch (error) {
      console.error(
        "Could not read Facebook post history:",
        error.response?.data || error.message
      );
    }
  }

  // =========================
  // INSTAGRAM HISTORY
  // =========================

  const instagramAccountId =
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  const instagramAccessToken =
    process.env.INSTAGRAM_ACCESS_TOKEN;

  const instagramGraphVersion =
    process.env.INSTAGRAM_GRAPH_VERSION || "v26.0";

  let instagramMedia = [];

  if (
    instagramAccountId &&
    instagramAccessToken
  ) {
    try {
      const mediaResponse = await axios.get(
        `https://graph.facebook.com/${instagramGraphVersion}/${instagramAccountId}/media`,
        {
          params: {
            fields: "id,caption,timestamp,media_type",
            limit: 100,
            access_token: instagramAccessToken
          }
        }
      );

      instagramMedia =
        mediaResponse.data.data || [];

    } catch (error) {
      console.error(
        "Could not read Instagram post history:",
        error.response?.data || error.message
      );
    }
  }

  // =========================
  // CHECK LAST 7 DAYS
  // =========================

  function wasPostedWithin7Days(title) {

    const facebookDuplicate =
      facebookPosts.some(post => {

        if (
          !post.message ||
          !post.created_time
        ) {
          return false;
        }

        const postDate =
          new Date(post.created_time);

        return (
          postDate >= sevenDaysAgo &&
          post.message.includes("FLICKCANVAS") &&
          post.message.includes(title)
        );
      });

    const instagramDuplicate =
      instagramMedia.some(item => {

        if (
          !item.caption ||
          !item.timestamp
        ) {
          return false;
        }

        const postDate =
          new Date(item.timestamp);

        return (
          postDate >= sevenDaysAgo &&
          item.caption.includes("FLICKCANVAS") &&
          item.caption.includes(title)
        );
      });

    return (
      facebookDuplicate ||
      instagramDuplicate
    );
  }

  // =========================
  // SELECT FIRST AVAILABLE
  // TRENDING MOVIE
  // =========================

  movie = null;

  for (const candidate of trendingMovies) {

    if (wasPostedWithin7Days(candidate.title)) {
      console.log(
        `Trending duplicate skipped during selection: ${candidate.title}`
      );
      continue;
    }

    movie = candidate;

    console.log(
      `Trending movie selected: ${candidate.title}`
    );

    break;
  }

  if (!movie) {
    throw new Error(
      "All trending movies were posted within the last 7 days"
    );
  }

} else {

  // =========================
  // MOVIE PICK
  // Non-trending + 7-day cooldown
  // =========================

  // =========================
  // GET TRENDING MOVIES
  // =========================

  const trendingResponse = await axios.get(
    `${TMDB_BASE_URL}/trending/movie/day`,
    {
      params: {
        api_key: process.env.TMDB_API_KEY,
        language: "en-US"
      }
    }
  );

  const trendingMovies =
    (trendingResponse.data.results || [])
      .filter(item => item.id);

  const trendingIds =
    new Set(
      trendingMovies.map(item => item.id)
    );

  // =========================
  // GET FACEBOOK POSTS
  // =========================

  const pageId =
    process.env.FACEBOOK_PAGE_ID;

  const pageAccessToken =
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  const graphVersion =
    process.env.FACEBOOK_GRAPH_VERSION || "v26.0";

  const now = new Date();

  const sevenDaysAgo = new Date(
    now.getTime() -
    7 * 24 * 60 * 60 * 1000
  );

  let facebookPosts = [];

  if (pageId && pageAccessToken) {

    try {

      const postsResponse = await axios.get(
        `https://graph.facebook.com/${graphVersion}/${pageId}/posts`,
        {
          params: {
            fields: "id,message,created_time",
            limit: 100,
            access_token: pageAccessToken
          }
        }
      );

      facebookPosts =
        postsResponse.data.data || [];

    } catch (facebookHistoryError) {

      console.error(
        "Could not read Facebook post history:",
        facebookHistoryError.response?.data ||
        facebookHistoryError.message
      );
    }
  }

  // =========================
  // GET INSTAGRAM POSTS
  // =========================

  const instagramAccountId =
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  const instagramAccessToken =
    process.env.INSTAGRAM_ACCESS_TOKEN;

  const instagramGraphVersion =
    process.env.INSTAGRAM_GRAPH_VERSION || "v26.0";

  let instagramMedia = [];

  if (
    instagramAccountId &&
    instagramAccessToken
  ) {

    try {

      const mediaResponse = await axios.get(
        `https://graph.facebook.com/${instagramGraphVersion}/${instagramAccountId}/media`,
        {
          params: {
            fields: "id,caption,timestamp,media_type",
            limit: 100,
            access_token: instagramAccessToken
          }
        }
      );

      instagramMedia =
        mediaResponse.data.data || [];

    } catch (instagramHistoryError) {

      console.error(
        "Could not read Instagram post history:",
        instagramHistoryError.response?.data ||
        instagramHistoryError.message
      );
    }
  }

  // =========================
  // FIND MOVIES POSTED
  // WITHIN LAST 7 DAYS
  // =========================

  const recentlyPostedTitles =
    new Set();

  // Facebook
  for (const post of facebookPosts) {

    if (
      !post.message ||
      !post.created_time
    ) {
      continue;
    }

    const postDate =
      new Date(post.created_time);

    if (
      postDate >= sevenDaysAgo &&
      post.message.includes("FLICKCANVAS")
    ) {
      recentlyPostedTitles.add(
        post.message
      );
    }
  }

  // Instagram
  for (const item of instagramMedia) {

    if (
      !item.caption ||
      !item.timestamp
    ) {
      continue;
    }

    const postDate =
      new Date(item.timestamp);

    if (
      postDate >= sevenDaysAgo &&
      item.caption.includes("FLICKCANVAS")
    ) {
      recentlyPostedTitles.add(
        item.caption
      );
    }
  }

  // =========================
  // GET POPULAR MOVIES
  // =========================

  const popularMovies = [];

  for (let page = 1; page <= 3; page++) {

    const response = await axios.get(
      `${TMDB_BASE_URL}/movie/popular`,
      {
        params: {
          api_key: process.env.TMDB_API_KEY,
          language: "en-US",
          page
        }
      }
    );

    popularMovies.push(
      ...(response.data.results || [])
    );
  }

  // =========================
  // FILTER MOVIE PICK
  // =========================

  const candidates =
    popularMovies.filter(item => {

      if (
        !item.id ||
        !item.title ||
        !item.poster_path ||
        !item.overview
      ) {
        return false;
      }

      // Remove today's trending movies
      if (trendingIds.has(item.id)) {
        return false;
      }

      // Quality filter
      if (
        Number(item.vote_average || 0) < 6.5 ||
        Number(item.vote_count || 0) < 100
      ) {
        return false;
      }

      // Remove movies posted within 7 days
      for (const postText of recentlyPostedTitles) {

        if (
          postText.includes(item.title)
        ) {
          return false;
        }
      }

      return true;
    });

  if (!candidates.length) {
    throw new Error(
      "No suitable Movie Pick found after 7-day cooldown filter"
    );
  }

  // =========================
  // RANDOM MOVIE PICK
  // =========================

  movie =
    candidates[
      Math.floor(
        Math.random() * candidates.length
      )
    ];
}

// =========================
// FINAL MOVIE CHECK
// =========================

if (!movie) {
  throw new Error(
    "Movie selection failed"
  );
}




    const siteUrl = (
      process.env.SITE_URL ||
      "http://localhost:3000"
    ).replace(/\/$/, "");

    const link = `${siteUrl}/movie/${movie.id}`;

    // =========================
// CHECK FACEBOOK POSTS - 7 DAY COOLDOWN
// =========================

const pageId = process.env.FACEBOOK_PAGE_ID;
const pageAccessToken =
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

const graphVersion =
  process.env.FACEBOOK_GRAPH_VERSION || "v26.0";

// Current time
const now = new Date();

// 7 days ago
const sevenDaysAgo = new Date(
  now.getTime() - 7 * 24 * 60 * 60 * 1000
);

const postsResponse = await axios.get(
  `https://graph.facebook.com/${graphVersion}/${pageId}/posts`,
  {
    params: {
      fields: "id,message,created_time",
      limit: 100,
      access_token: pageAccessToken
    }
  }
);

const posts = postsResponse.data.data || [];

// =========================
// DUPLICATE CHECK - 7 DAYS
// =========================

const alreadyPostedWithin7Days = posts.some(post => {

  if (!post.message || !post.created_time) {
    return false;
  }

  const postDate = new Date(post.created_time);

  return (
    postDate >= sevenDaysAgo &&
    post.message.includes("FLICKCANVAS") &&
    post.message.includes(movie.title)
  );
});


// =========================
// CREATE FACEBOOK MESSAGE
// =========================

function formatReleaseDate(dateString) {
  if (!dateString) return "N/A";

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

const formattedDate = formatReleaseDate(movie.release_date);

const rating = movie.vote_average > 0
  ? Number(movie.vote_average).toFixed(1)
  : "N/A";

// TMDB poster image
const posterUrl = movie.poster_path
  ? `${IMAGE_BASE_URL}${movie.poster_path}`
  : null;
  // =========================
// ENGLISH MOVIE DESCRIPTION
// =========================

const genreMap = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western"
};

function getMoviePickDescription(movie) {
  const genres = (movie.genre_ids || [])
    .map(id => genreMap[id])
    .filter(Boolean);

  let intro =
    "🎬 A movie worth discovering for any film lover.";

  if (genres.includes("Action")) {
    intro =
      "🔥 An exciting choice for action movie fans.";
  } else if (genres.includes("Horror")) {
    intro =
      "👻 A chilling pick for fans of horror and suspense.";
  } else if (genres.includes("Thriller")) {
    intro =
      "😱 A gripping choice for anyone who enjoys suspense and tension.";
  } else if (genres.includes("Sci-Fi")) {
    intro =
      "🚀 A fascinating pick for fans of science fiction and unforgettable worlds.";
  } else if (genres.includes("Romance")) {
    intro =
      "❤️ A great choice for fans of romance and emotional stories.";
  } else if (genres.includes("Comedy")) {
    intro =
      "😂 A fun pick for anyone looking for an entertaining movie.";
  } else if (genres.includes("Drama")) {
    intro =
      "🎭 A compelling choice for fans of powerful character-driven stories.";
  } else if (genres.includes("Adventure")) {
    intro =
      "🌎 A thrilling pick for fans of adventure and exciting journeys.";
  } else if (genres.includes("Mystery")) {
    intro =
      "🕵️ A mysterious pick for anyone who enjoys puzzles and unexpected turns.";
  }

  const overview = String(movie.overview || "")
    .replace(/\s+/g, " ")
    .trim();

  let shortOverview = overview;

  if (shortOverview.length > 300) {
    shortOverview =
      shortOverview
        .slice(0, 297)
        .replace(/\s+\S*$/, "") + "...";
  }

  return `${intro}\n\n${shortOverview}`;
}

const movieDescription =
  await generateMovieArticle(movie);

const message = isMoviePick
  ? `🎬 FLICKCANVAS Movie Pick

${movie.title}

⭐ Rating: ${rating}${rating !== "N/A" ? "/10" : ""}

📅 Release Date: ${formattedDate}

${movieDescription}

💬 Have you watched this movie? What did you think? 👇

❤️ Like this post if you love discovering great movies.

📌 Follow FLICKCANVAS for more movie recommendations, trailers, and updates!

👇 Check the comments below for the movie link!

#FLICKCANVAS #MoviePick #Movies #MovieRecommendation #MovieLovers`
  : `🎬 FLICKCANVAS Movie of the Day

${movie.title}

⭐ Rating: ${rating}${rating !== "N/A" ? "/10" : ""}

📅 Release Date: ${formattedDate}

${movieDescription}

💬 Would you watch this movie? Tell us what you think! 👇

❤️ Like this post if you love discovering new movies.

📌 Follow FLICKCANVAS to discover more trending movies, trailers, and movie updates every day!

👇 Check the comments below for the movie link!

#FLICKCANVAS #MovieOfTheDay #Movies #MovieLovers #TrendingMovies`;

// =========================
// POST TO FACEBOOK
// =========================

let facebookResult = null;
const forceFacebookTest = false;

if (alreadyPostedWithin7Days && !forceFacebookTest) {
  facebookResult = {
    success: true,
    skipped: true,
    reason: "This movie was posted on Facebook within the last 7 days",
    movie: movie.title
  };

  console.log(
    `Facebook duplicate skipped: ${movie.title}`
  );
} else {
  const { postToFacebookPage } =
    require("./facebook");

  facebookResult = await postToFacebookPage({
    message,
    link,
    imageUrl: posterUrl
  });

  console.log(
    `Facebook posted successfully: ${movie.title}`
  );
}
// =========================
// INSTAGRAM AUTO POST
// =========================

let instagramResult = null;

try {
  const instagramAccountId =
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  const instagramAccessToken =
    process.env.INSTAGRAM_ACCESS_TOKEN;

  const instagramGraphVersion =
    process.env.INSTAGRAM_GRAPH_VERSION || "v26.0";

  if (!instagramAccountId || !instagramAccessToken) {
    console.log(
      "Instagram auto post skipped: Instagram credentials missing"
    );
  } else if (!posterUrl) {
    console.log(
      "Instagram auto post skipped: Movie has no poster"
    );
  } else {

    const instagramCaption = message;




    // =========================
// CHECK INSTAGRAM POSTS - 7 DAY COOLDOWN
// =========================

const mediaResponse = await axios.get(
  `https://graph.facebook.com/${instagramGraphVersion}/${instagramAccountId}/media`,
  {
    params: {
      fields: "id,caption,timestamp,media_type",
      limit: 100,
      access_token: instagramAccessToken
    }
  }
);

const instagramMedia =
  mediaResponse.data.data || [];

const now = new Date();

const sevenDaysAgo = new Date(
  now.getTime() - 7 * 24 * 60 * 60 * 1000
);

const alreadyPostedInstagram =
  instagramMedia.some(item => {

    if (!item.caption || !item.timestamp) {
      return false;
    }

    const postDate = new Date(item.timestamp);

    return (
      postDate >= sevenDaysAgo &&
      item.caption.includes("FLICKCANVAS") &&
      item.caption.includes(movie.title)
    );
  });

if (alreadyPostedInstagram) {

  instagramResult = {
    success: true,
    skipped: true,
    reason: "This movie was posted on Instagram within the last 7 days",
    movie: movie.title
  };

  console.log(
    `Instagram duplicate skipped: ${movie.title}`
  );

} else {

      // =========================
      // CREATE MEDIA CONTAINER
      // =========================

      const containerResponse = await axios.post(
        `https://graph.facebook.com/${instagramGraphVersion}/${instagramAccountId}/media`,
        null,
        {
          params: {
            image_url: posterUrl,
            caption: instagramCaption,
            access_token: instagramAccessToken
          }
        }
      );

      const creationId =
        containerResponse.data.id;

      if (!creationId) {
        throw new Error(
          "Instagram media container was not created"
        );
      }

      // =========================
      // WAIT FOR MEDIA PROCESSING
      // =========================

      let mediaReady = false;

      for (let attempt = 0; attempt < 10; attempt++) {

        await new Promise(resolve =>
          setTimeout(resolve, 3000)
        );

        const statusResponse = await axios.get(
          `https://graph.facebook.com/${instagramGraphVersion}/${creationId}`,
          {
            params: {
              fields: "status_code",
              access_token: instagramAccessToken
            }
          }
        );

        const status =
          statusResponse.data.status_code;

        console.log(
          `Instagram media status: ${status}`
        );

        if (status === "FINISHED") {
          mediaReady = true;
          break;
        }

        if (
          status === "ERROR" ||
          status === "EXPIRED"
        ) {
          throw new Error(
            `Instagram media processing failed: ${status}`
          );
        }
      }

      if (!mediaReady) {
        throw new Error(
          "Instagram media processing timeout"
        );
      }

      // =========================
      // PUBLISH INSTAGRAM POST
      // =========================

      const publishResponse = await axios.post(
        `https://graph.facebook.com/${instagramGraphVersion}/${instagramAccountId}/media_publish`,
        null,
        {
          params: {
            creation_id: creationId,
            access_token: instagramAccessToken
          }
        }
      );
      const instagramMediaId = publishResponse.data.id;

// =========================
// POST FIRST COMMENT
// =========================

const instagramComment =
  `🎬 Watch the Trailer & view more details:\n\n${link}`;

const commentResponse = await axios.post(
  `https://graph.facebook.com/${instagramGraphVersion}/${instagramMediaId}/comments`,
  null,
  {
    params: {
      message: instagramComment,
      access_token: instagramAccessToken
    }
  }
);

console.log(
  `Instagram first comment posted successfully: ${movie.title}`
);

      instagramResult = {
  success: true,
  skipped: false,
  movie: movie.title,
  instagramMediaId: instagramMediaId,
  instagramCommentId: commentResponse.data.id
};

      console.log(
        `Instagram posted successfully: ${movie.title}`
      );
    }
  }

} catch (instagramError) {

  console.error(
    "INSTAGRAM AUTO POST ERROR:",
    instagramError.response?.data ||
    instagramError.message
  );

  instagramResult = {
    success: false,
    error:
      instagramError.response?.data ||
      instagramError.message
  };
}
// =========================
// PINTEREST SANDBOX AUTO POST
// =========================

let pinterestResult = null;

try {
  const pinterestAccessToken =
    process.env.PINTEREST_ACCESS_TOKEN;

  const pinterestBoardId =
    "1138073837026954410";

  if (!pinterestAccessToken) {

    console.log(
      "Pinterest auto post skipped: Pinterest access token missing"
    );

    pinterestResult = {
      success: false,
      skipped: true,
      reason: "PINTEREST_ACCESS_TOKEN is missing"
    };

  } else if (!posterUrl) {

    console.log(
      "Pinterest auto post skipped: Movie has no poster"
    );

    pinterestResult = {
      success: false,
      skipped: true,
      reason: "Movie has no poster"
    };

  } else {

    const pinterestDescription =
      `🎬 ${movie.title}

⭐ Rating: ${rating}/10

📅 Release Date: ${formattedDate}

${movie.overview || "Discover this movie on FLICKCANVAS."}

🎥 Watch the trailer and view more details on FLICKCANVAS.

#FLICKCANVAS #Movies #MovieLovers #MovieRecommendation`;

    const pinterestResponse = await axios.post(
      "https://api-sandbox.pinterest.com/v5/pins",
      {
        board_id: pinterestBoardId,

        title: `🎬 ${movie.title}`,

        description: pinterestDescription,

        media_source: {
          source_type: "image_url",
          url: posterUrl
        },

        link: link
      },
      {
        headers: {
          Authorization:
            `Bearer ${pinterestAccessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(
      "PINTEREST SANDBOX AUTO POST CREATED:",
      pinterestResponse.data
    );

    pinterestResult = {
      success: true,
      skipped: false,
      movie: movie.title,
      pinterestPinId:
        pinterestResponse.data.id
    };

    console.log(
      `Pinterest Sandbox posted successfully: ${movie.title}`
    );
  }

} catch (pinterestError) {

  console.error(
    "PINTEREST SANDBOX AUTO POST ERROR:",
    pinterestError.response?.data ||
    pinterestError.message
  );

  pinterestResult = {
    success: false,
    error:
      pinterestError.response?.data ||
      pinterestError.message
  };
}

res.json({
  success: true,
  skipped: false,
  movie: movie.title,
  facebook: facebookResult,
  instagram: instagramResult,
  pinterest: pinterestResult
});

} catch (error) {
  console.error(
    "FACEBOOK AUTO POST ERROR:",
    error.response?.data || error.message
  );

  res.status(500).json({
    error: "Facebook post failed",
    details:
      error.response?.data || error.message
  });
}
});

// =========================
// FACEBOOK REEL PUBLISH
// =========================

async function publishFacebookReel({
  videoUrl,
  title,
  description
}) {
  const pageAccessToken =
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  const graphVersion =
    process.env.FACEBOOK_GRAPH_VERSION || "v26.0";

  if (!pageAccessToken) {
    throw new Error(
      "FACEBOOK_PAGE_ACCESS_TOKEN is missing"
    );
  }

  // STEP 1 - CREATE REEL UPLOAD SESSION
  const startResponse = await axios.post(
    `https://graph.facebook.com/${graphVersion}/me/video_reels`,
    null,
    {
      params: {
        access_token: pageAccessToken,
        upload_phase: "start"
      }
    }
  );

  const videoId =
    startResponse.data.video_id;

  const uploadUrl =
    startResponse.data.upload_url;

  if (!videoId || !uploadUrl) {
    throw new Error(
      "Facebook Reel upload session was not created"
    );
  }

  console.log(
    `Facebook Reel session created: ${videoId}`
  );

  // STEP 2 - FACEBOOK DOWNLOADS HOSTED VIDEO
  await axios.post(
    uploadUrl,
    null,
    {
      headers: {
        Authorization:
          `OAuth ${pageAccessToken}`,
        file_url: videoUrl
      }
    }
  );

  console.log(
    `Facebook Reel uploaded: ${videoId}`
  );

  // STEP 3 - PUBLISH
  const publishResponse = await axios.post(
    `https://graph.facebook.com/${graphVersion}/me/video_reels`,
    null,
    {
      params: {
        access_token: pageAccessToken,
        video_id: videoId,
        upload_phase: "finish",
        video_state: "PUBLISHED",
        title,
        description
      }
    }
  );

  console.log(
    `Facebook Reel publish requested: ${videoId}`
  );

  return {
    success: true,
    videoId,
    result: publishResponse.data
  };
}


// =========================
// INSTAGRAM REEL PUBLISH
// =========================

async function publishInstagramReel({
  videoUrl,
  caption
}) {
  const instagramAccountId =
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  const instagramAccessToken =
    process.env.INSTAGRAM_ACCESS_TOKEN;

  const graphVersion =
    process.env.INSTAGRAM_GRAPH_VERSION || "v26.0";

  if (
    !instagramAccountId ||
    !instagramAccessToken
  ) {
    throw new Error(
      "Instagram credentials are missing"
    );
  }

  // STEP 1 - CREATE REEL CONTAINER
  const containerResponse =
    await axios.post(
      `https://graph.facebook.com/${graphVersion}/${instagramAccountId}/media`,
      null,
      {
        params: {
          media_type: "REELS",
          video_url: videoUrl,
          caption,
          share_to_feed: true,
          access_token:
            instagramAccessToken
        }
      }
    );

  const creationId =
    containerResponse.data.id;

  if (!creationId) {
    throw new Error(
      "Instagram Reel container was not created"
    );
  }

  console.log(
    `Instagram Reel container created: ${creationId}`
  );

  // STEP 2 - WAIT UNTIL FINISHED
  let mediaReady = false;

  for (
    let attempt = 1;
    attempt <= 20;
    attempt++
  ) {
    await new Promise(resolve =>
      setTimeout(resolve, 5000)
    );

    const statusResponse =
      await axios.get(
        `https://graph.facebook.com/${graphVersion}/${creationId}`,
        {
          params: {
            fields: "status_code,status",
            access_token:
              instagramAccessToken
          }
        }
      );

    const status =
      statusResponse.data.status_code;

    console.log(
      `Instagram Reel status: ${status}`
    );

    if (status === "FINISHED") {
      mediaReady = true;
      break;
    }

    if (
      status === "ERROR" ||
      status === "EXPIRED"
    ) {
      throw new Error(
        `Instagram Reel processing failed: ${status}`
      );
    }
  }

  if (!mediaReady) {
    throw new Error(
      "Instagram Reel processing timeout"
    );
  }

  // STEP 3 - PUBLISH REEL
  const publishResponse =
    await axios.post(
      `https://graph.facebook.com/${graphVersion}/${instagramAccountId}/media_publish`,
      null,
      {
        params: {
          creation_id: creationId,
          access_token:
            instagramAccessToken
        }
      }
    );

  console.log(
    `Instagram Reel posted successfully: ${publishResponse.data.id}`
  );

  return {
    success: true,
    creationId,
    mediaId: publishResponse.data.id
  };
}
// =========================
// PINTEREST VIDEO PIN PUBLISH
// =========================

async function publishPinterestVideoPin({
  videoPath,
  coverImageUrl,
  title,
  description,
  link
}) {
  const accessToken =
    process.env.PINTEREST_ACCESS_TOKEN;

  const boardId =
    process.env.PINTEREST_BOARD_ID ||
    "1138073837026954410";

  if (!accessToken) {
    throw new Error(
      "PINTEREST_ACCESS_TOKEN is missing"
    );
  }

  if (!fs.existsSync(videoPath)) {
    throw new Error(
      "Pinterest video file not found"
    );
  }

  if (!coverImageUrl) {
    throw new Error(
      "Pinterest cover image URL is missing"
    );
  }

  // Change to https://api.pinterest.com
  // when moving from Sandbox to production.
  const pinterestApi =
    "https://api-sandbox.pinterest.com/v5";

  // =========================
  // STEP 1 - REGISTER VIDEO
  // =========================

  const registerResponse =
    await axios.post(
      `${pinterestApi}/media`,
      {
        media_type: "video"
      },
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json"
        }
      }
    );

  const mediaId =
    registerResponse.data.media_id;

  const uploadUrl =
    registerResponse.data.upload_url;

  const uploadParameters =
    registerResponse.data.upload_parameters;

  if (
    !mediaId ||
    !uploadUrl ||
    !uploadParameters
  ) {
    throw new Error(
      "Pinterest video upload session was not created"
    );
  }

  console.log(
    `Pinterest media session: ${mediaId}`
  );

  // =========================
  // STEP 2 - UPLOAD MP4
  // =========================

  const form = new FormData();

  for (
    const [key, value]
    of Object.entries(uploadParameters)
  ) {
    form.append(key, value);
  }

  form.append(
    "file",
    fs.createReadStream(videoPath)
  );

  await axios.post(
    uploadUrl,
    form,
    {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    }
  );

  console.log(
    "Pinterest video uploaded to media storage"
  );

  // =========================
  // STEP 3 - WAIT FOR READY
  // =========================

  let ready = false;

  for (
    let attempt = 1;
    attempt <= 20;
    attempt++
  ) {
    await new Promise(resolve =>
      setTimeout(resolve, 3000)
    );

    const statusResponse =
      await axios.get(
        `${pinterestApi}/media/${mediaId}`,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

    const status =
      String(
        statusResponse.data.status || ""
      ).toLowerCase();

    console.log(
      `Pinterest media status: ${status}`
    );

    if (status === "succeeded") {
      ready = true;
      break;
    }

    if (
      status === "failed" ||
      status === "error"
    ) {
      throw new Error(
        `Pinterest video processing failed: ${status}`
      );
    }
  }

  if (!ready) {
    throw new Error(
      "Pinterest video processing timeout"
    );
  }

  // =========================
  // STEP 4 - CREATE VIDEO PIN
  // =========================

  const pinResponse =
    await axios.post(
      `${pinterestApi}/pins`,
      {
        board_id: boardId,

        title,

        description,

        link,

        media_source: {
          source_type: "video_id",
          media_id: mediaId,
          cover_image_url:
            coverImageUrl
        }
      },
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json"
        }
      }
    );

  console.log(
    `Pinterest Video Pin created: ${pinResponse.data.id}`
  );

  return {
    success: true,
    mediaId,
    pinId: pinResponse.data.id
  };
}
// =========================
// FACEBOOK TEST POST
// =========================

app.get("/api/facebook/test-post", async (req, res) => {
  const authorization = req.get("authorization") || "";
  const bearerSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  const manualSecret = req.query.secret || "";
  const cronSecret =
    process.env.CRON_SECRET ||
    process.env.FACEBOOK_CRON_SECRET;

  if (
    !cronSecret ||
    (bearerSecret !== cronSecret &&
      manualSecret !== cronSecret)
  ) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  try {
    const { postToFacebookPage } =
      require("./facebook");

    const testMessage = `🎬 FLICKCANVAS TEST POST

Facebook API connection is working! ✅

This is a test post from the FlickCanvas Node.js server.

#FLICKCANVAS #TestPost`;

    const result = await postToFacebookPage({
      message: testMessage,
      link: process.env.SITE_URL || "http://localhost:3000"
    });

    res.json({
      success: true,
      message: "Facebook test post published successfully",
      facebook: result
    });

  } catch (error) {
    console.error(
      "FACEBOOK TEST POST ERROR:",
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      error:
        error.response?.data || error.message
    });
  }
});
// =========================
// DEBUG TEST
// =========================

app.get("/api/debug", (req, res) => {
  res.json({
    ok: true,
    message: "THIS IS THE CURRENT APP.JS"
  });
});
// =========================
// FACEBOOK CRON
// =========================

app.get("/api/cron", async (req, res) => {
  try {
    const cronSecret =
      process.env.CRON_SECRET ||
      process.env.FACEBOOK_CRON_SECRET;

    const authorization = req.get("authorization") || "";

    const bearerSecret = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!cronSecret || bearerSecret !== cronSecret) {
      return res.status(401).json({
        error: "Unauthorized"
      });
    }

    // =========================
    // RUN FACEBOOK + INSTAGRAM AUTO POST
    // =========================

    const siteUrl = (
      process.env.SITE_URL ||
      "http://localhost:3000"
    ).replace(/\/$/, "");

    const response = await axios.get(
      `${siteUrl}/api/facebook/auto-post`,
      {
        headers: {
          Authorization: `Bearer ${cronSecret}`
        }
      }
    );

    return res.json({
      success: true,
      message: "Cron auto-post completed",
      result: response.data
    });

  } catch (error) {
    console.error(
      "CRON AUTO POST ERROR:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      error:
        error.response?.data || error.message
    });
  }
});
// =========================
// PRIVACY POLICY PAGE   👈 මේ block එකයි අලුතින් add කරන්නේ
// =========================

app.get("/privacy", (req, res) => {
  res.render("privacy", { hideAds: true });
});
app.get("/terms", (req, res) => {
  res.render("terms", { hideAds: true });
});

app.get("/data-deletion", (req, res) => {
  res.render("data-deletion", { hideAds: true });
});
// =========================
// GEMINI TEST
// =========================

app.get("/api/test-gemini", async (req, res) => {
  try {
    const testMovie = {
      title: "Inception",
      overview:
        "A skilled thief who steals secrets through dreams is given a chance to erase his past by planting an idea in someone's mind.",
      genre_ids: [28, 878],
      vote_average: 8.8
    };

    const article = await generateMovieArticle(testMovie);

    res.json({
      success: true,
      article
    });

  } catch (error) {
    console.error(
      "GEMINI TEST ERROR:",
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      error:
        error.response?.data ||
        error.message
    });
  }
});
// =========================
// 404 PAGE
// =========================

app.use((req, res) => {
  res.status(404).send("Page not found");
});

// =========================
// LOCAL SERVER
// =========================

// Vercel එකේදී app.listen() run කරන්න එපා.
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`FLICK CANVAS running at:`);
    console.log(`http://localhost:${PORT}`);
  });
}


// =========================
// EXPORT FOR VERCEL
// =========================

module.exports = app;