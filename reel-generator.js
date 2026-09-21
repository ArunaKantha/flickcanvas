const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { spawnSync } = require("child_process");
const ffmpegPath =
  process.platform === "win32"
    ? require("ffmpeg-static")
    : "ffmpeg";

require("dotenv").config();

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/original";


// =========================
// HELPERS
// =========================

function wrapText(text, maxChars = 22) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line
      ? `${line} ${word}`
      : word;

    if (next.length <= maxChars) {
      line = next;
    } else {
      if (line) {
        lines.push(line);
      }

      line = word;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines.join("\n");
}


function ffmpegPathForFilter(filePath) {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}


function getFontPath() {
  if (process.platform === "win32") {
    return "C:\\Windows\\Fonts\\arial.ttf";
  }

  const linuxFonts = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"
  ];

  return linuxFonts.find(fs.existsSync) || "";
}


async function downloadFile(
  url,
  outputPath
) {
  const response = await axios({
    method: "GET",
    url,
    responseType: "arraybuffer"
  });

  fs.writeFileSync(
    outputPath,
    response.data
  );
}


// =========================
// GET LAST 7 DAYS HISTORY
// FROM FLICKCANVAS / VERCEL
// =========================

async function getRecentlyPostedTexts() {

  const siteUrl = (
    process.env.SITE_URL ||
    "https://flickcanvas.vercel.app"
  ).replace(/\/$/, "");


  const cronSecret =
    process.env.CRON_SECRET ||
    process.env.FACEBOOK_CRON_SECRET;


  if (!cronSecret) {
    throw new Error(
      "CRON_SECRET missing"
    );
  }


  console.log(
    "Getting 7-day post history from FlickCanvas..."
  );


  const response =
    await axios.get(
      `${siteUrl}/api/reels/recent-posts`,
      {
        headers: {
          Authorization:
            `Bearer ${cronSecret}`
        }
      }
    );


  const texts =
    response.data?.texts;


  if (!Array.isArray(texts)) {
    throw new Error(
      "Invalid recent-posts response"
    );
  }


  console.log(
    `Found ${texts.length} recent Facebook/Instagram post records`
  );


  return texts;
}


// =========================
// CHECK MOVIE USED RECENTLY
// =========================

function movieWasUsedRecently(
  title,
  recentTexts
) {

  const normalizedTitle =
    String(title || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();


  if (!normalizedTitle) {
    return false;
  }


  return recentTexts.some(text => {

    const normalizedText =
      String(text || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();


    return normalizedText.includes(
      normalizedTitle
    );
  });
}


// =========================
// CREATE PREMIUM REEL
// =========================

async function createPremiumReel() {

  try {

    // =========================
    // CHECK TMDB KEY
    // =========================

    if (!process.env.TMDB_API_KEY) {
      throw new Error(
        "TMDB_API_KEY missing"
      );
    }


    // =========================
    // GET TRENDING MOVIES
    // =========================

    console.log(
      "Getting trending movie..."
    );


    const response =
      await axios.get(
        `${TMDB_BASE_URL}/trending/movie/day`,
        {
          params: {
            api_key:
              process.env.TMDB_API_KEY,

            language:
              "en-US"
          }
        }
      );


    // =========================
    // QUALITY FILTER
    // Rating 6.5+
    // Vote count 100+
    // =========================

    const movies =
      (response.data.results || [])
        .filter(
          item =>
            item.id &&
            item.title &&
            item.poster_path &&
            Number(
              item.vote_average || 0
            ) >= 6.5 &&
            Number(
              item.vote_count || 0
            ) >= 100
        );


    if (!movies.length) {
      throw new Error(
        "No suitable trending movies found"
      );
    }


    // =========================
    // 7-DAY HISTORY
    // =========================

    console.log(
      "Checking Facebook + Instagram 7-day history..."
    );


    const recentTexts =
      await getRecentlyPostedTexts();


    let movie = null;


    for (const item of movies) {

      const alreadyUsed =
        movieWasUsedRecently(
          item.title,
          recentTexts
        );


      if (alreadyUsed) {

        console.log(
          `7-day duplicate skipped: ${item.title}`
        );

        continue;
      }


      movie = item;


      console.log(
        `Reel movie selected: ${item.title}`
      );


      break;
    }


    if (!movie) {
      throw new Error(
        "No eligible trending movie found after 7-day duplicate check"
      );
    }


    // =========================
    // DIRECTORIES
    // =========================

    const tempDir =
      path.join(
        __dirname,
        "temp-reel"
      );


    const publicDir =
      path.join(
        __dirname,
        "public"
      );


    fs.mkdirSync(
      tempDir,
      {
        recursive: true
      }
    );


    fs.mkdirSync(
      publicDir,
      {
        recursive: true
      }
    );


    // =========================
    // FILE PATHS
    // =========================

    const posterPath =
      path.join(
        tempDir,
        "poster.jpg"
      );


    const titleTextPath =
      path.join(
        tempDir,
        "title.txt"
      );


    const backgroundPath =
      path.join(
        publicDir,
        "flickcanvas-bg.jpg"
      );


    if (
      !fs.existsSync(backgroundPath)
    ) {
      throw new Error(
        "Background image not found: public/flickcanvas-bg.jpg"
      );
    }


    // =========================
    // UNIQUE VIDEO FILENAME
    // =========================

    const reelFileName =
      `auto-reel-${movie.id}.mp4`;


    const outputPath =
      path.join(
        publicDir,
        reelFileName
      );


    const metaPath =
      path.join(
        publicDir,
        "auto-reel-meta.json"
      );


    // =========================
    // DOWNLOAD POSTER
    // =========================

    const posterUrl =
      `${IMAGE_BASE_URL}${movie.poster_path}`;


    console.log(
      "Downloading movie poster..."
    );


    await downloadFile(
      posterUrl,
      posterPath
    );


    // =========================
    // MOVIE DATA
    // =========================

    const rating =
      Number(
        movie.vote_average || 0
      ).toFixed(1);


    fs.writeFileSync(
      titleTextPath,
      wrapText(
        movie.title.toUpperCase(),
        22
      ),
      "utf8"
    );


    // =========================
    // FONT
    // =========================

    const fontPath =
      getFontPath();


    if (
      !fontPath ||
      !fs.existsSync(fontPath)
    ) {
      throw new Error(
        `Font not found: ${fontPath || "unknown"}`
      );
    }


    const font =
      ffmpegPathForFilter(
        fontPath
      );


    const titleFile =
      ffmpegPathForFilter(
        titleTextPath
      );


    // =========================
    // VIDEO FILTER
    // =========================

    const filter = [

      // =========================
      // FLICKCANVAS BACKGROUND
      // =========================

      `[1:v]` +
      `scale=720:1280:force_original_aspect_ratio=increase,` +
      `crop=720:1280,` +
      `boxblur=5:1,` +
      `eq=brightness=-0.12:saturation=0.95,` +
      `format=yuv420p` +
      `[bg]`,


      // =========================
      // MOVIE POSTER
      // SLOW ZOOM IN + OUT
      // =========================

      `[0:v]` +
      `scale=900:-2:flags=lanczos,` +

      `zoompan=` +
      `z='1+0.10*(1-cos(2*PI*on/449))/2':` +
      `x='iw/2-(iw/zoom/2)':` +
      `y='ih/2-(ih/zoom/2)':` +
      `d=1:` +
      `s=470x705:` +
      `fps=30,` +

      `format=rgba,` +

      `fade=` +
      `t=in:` +
      `st=1.5:` +
      `d=0.5:` +
      `alpha=1,` +

      `fade=` +
      `t=out:` +
      `st=12.5:` +
      `d=0.5:` +
      `alpha=1` +

      `[poster]`,


      // =========================
      // POSTER OVER BACKGROUND
      // =========================

      `[bg][poster]` +

      `overlay=` +
      `(W-w)/2:` +
      `210:` +

      `enable='between(t,1.5,13.0)'` +

      `[stage1]`,


      // =========================
      // MOVIE INFO
      // =========================

      `[stage1]` +

      // info box

      `drawbox=` +
      `x=65:` +
      `y=945:` +
      `w=590:` +
      `h=175:` +
      `color=black@0.72:` +
      `t=fill:` +
      `enable='between(t,4.0,12.6)',` +


      // movie title

      `drawtext=` +
      `fontfile='${font}':` +
      `textfile='${titleFile}':` +
      `fontcolor=white:` +
      `fontsize=38:` +
      `line_spacing=8:` +
      `x=(w-text_w)/2:` +
      `y=970:` +
      `enable='between(t,4.0,12.6)',` +


      // rating

      `drawtext=` +
      `fontfile='${font}':` +
      `text='RATING ${rating}/10':` +
      `fontcolor=white:` +
      `fontsize=30:` +
      `x=(w-text_w)/2:` +
      `y=1060:` +
      `enable='between(t,4.0,12.6)',` +


      // =========================
      // CTA
      // =========================

      `drawtext=` +
      `fontfile='${font}':` +
      `text='WATCH TRAILER & DETAILS':` +
      `fontcolor=white:` +
      `fontsize=31:` +
      `x=(w-text_w)/2:` +
      `y=1170:` +
      `enable='between(t,13.0,14.8)',` +


      // =========================
      // FINAL VIDEO FADE
      // =========================

      `fade=t=in:st=0:d=0.4,` +
      `fade=t=out:st=14.5:d=0.5,` +

      `format=yuv420p` +
      `[v]`

    ].join(";");


    // =========================
    // FFMPEG
    // =========================

    const args = [

      "-y",


      // input 0 - movie poster

      "-loop",
      "1",

      "-framerate",
      "30",

      "-i",
      posterPath,


      // input 1 - FlickCanvas background

      "-loop",
      "1",

      "-framerate",
      "30",

      "-i",
      backgroundPath,


      // input 2 - silent audio

      "-f",
      "lavfi",

      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",


      "-filter_complex",
      filter,


      "-map",
      "[v]",

      "-map",
      "2:a",


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


      "-c:a",
      "aac",

      "-b:a",
      "128k",


      "-shortest",

      "-movflags",
      "+faststart",


      outputPath
    ];


    // =========================
    // CREATE VIDEO
    // =========================

    console.log(
      "Creating clean premium Reel..."
    );


    const result =
      spawnSync(
        ffmpegPath,
        args,
        {
          stdio: "inherit"
        }
      );


    if (result.status !== 0) {
      throw new Error(
        "FFmpeg Reel generation failed"
      );
    }


    // =========================
    // SAVE METADATA
    // ONLY AFTER VIDEO SUCCESS
    // =========================

    const generatedAt =
      new Date().toISOString();


    const metadata = {
      movieId:
        movie.id,

      title:
        movie.title,

      rating:
        rating,

      videoFile:
        reelFileName,

      generatedAt:
        generatedAt
    };


    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        metadata,
        null,
        2
      ),
      "utf8"
    );


    console.log(
      `Reel metadata saved: ${metaPath}`
    );


    // =========================
    // SUCCESS
    // =========================

    console.log("");

    console.log(
      "✅ CLEAN PREMIUM REEL CREATED"
    );

    console.log(
      `🎬 Movie: ${movie.title}`
    );

    console.log(
      `⭐ Rating: ${rating}/10`
    );

    console.log(
      `🎞️ Video: ${reelFileName}`
    );

    console.log(
      `📁 ${outputPath}`
    );


  } catch (error) {

    console.error(
      "❌ PREMIUM REEL ERROR:",
      error.response?.data ||
      error.message
    );

    process.exitCode = 1;
  }
}


createPremiumReel();