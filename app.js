const express = require("express");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

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
          append_to_response: "credits,videos"
        }
      }
    );

    const movie = response.data;
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

        const titles = watchmodeResponse.data.title_results || [];

        if (titles.length > 0) {
          const watchmodeId = titles[0].id;

          const sourcesResponse = await axios.get(
            `https://api.watchmode.com/v1/title/${watchmodeId}/sources/`,
            {
              params: {
                apiKey: process.env.WATCHMODE_API_KEY,
                regions: process.env.WATCHMODE_REGION || "US"
              }
            }
          );

          const sources = Array.isArray(sourcesResponse.data)
            ? sourcesResponse.data
            : [];

          const seen = new Set();

          function addProvider(group, source) {
            if (!source || !source.web_url) return;
            const key = `${source.name || "Provider"}|${source.web_url}`;
            if (seen.has(`${group}|${key}`)) return;
            seen.add(`${group}|${key}`);
            providers[group].push({
              name: source.name || "Official Provider",
              url: source.web_url,
              type: source.type || ""
            });
          }

          // Watch = subscription + free/ad-supported services.
          sources.forEach(source => {
            if (["sub", "free"].includes(source.type)) {
              addProvider("watch", source);
            } else if (source.type === "rent") {
              addProvider("rent", source);
            } else if (source.type === "purchase") {
              addProvider("buy", source);
            }
          });
        }
      } catch (watchmodeError) {
        console.error(
          "WATCHMODE ERROR:",
          watchmodeError.response?.data || watchmodeError.message
        );
      }
    }

    res.render("movie", {
  movie,
  imageBase: IMAGE_BASE_URL,
  backdropBase: BACKDROP_BASE_URL,
  providers,
  cast: movie.credits?.cast || [],
  crew: movie.credits?.crew || []
});

  } catch (error) {
    console.error(
      "MOVIE DETAILS ERROR:",
      error.response?.data || error.message
    );
    res.status(404).send("Movie not found");
  }
});
// =========================
// WATCH PAGE
// =========================
app.get("/watch/:id", async (req, res) => {
  const movieId = req.params.id;

  try {
    // Get movie information from TMDB
    const movieResponse = await axios.get(
      `${TMDB_BASE_URL}/movie/${movieId}`,
      {
        params: {
          api_key: process.env.TMDB_API_KEY,
          language: "en-US"
        }
      }
    );

    // Get YouTube videos / trailers from TMDB
    const videoResponse = await axios.get(
      `${TMDB_BASE_URL}/movie/${movieId}/videos`,
      {
        params: {
          api_key: process.env.TMDB_API_KEY,
          language: "en-US"
        }
      }
    );

    const videos = videoResponse.data.results || [];

    console.log("WATCH MOVIE:", movieResponse.data.title);
    console.log("VIDEOS FOUND:", videos.length);

    res.render("watch", {
      movie: movieResponse.data,
      videos: videos
    });

  } catch (error) {
    console.error(
      "WATCH ERROR:",
      error.response?.data || error.message
    );

    res.status(404).send("Movie not found");
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
    // GET TRENDING MOVIE
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

    const movie = (trendingResponse.data.results || [])
      .find(item => item.title);

    if (!movie) {
      return res.status(404).json({
        error: "No trending movie found"
      });
    }

    const siteUrl = (
      process.env.SITE_URL ||
      "http://localhost:3000"
    ).replace(/\/$/, "");

    const link = `${siteUrl}/movie/${movie.id}`;

    // =========================
// CHECK TODAY'S FACEBOOK POSTS
// =========================

const pageId = process.env.FACEBOOK_PAGE_ID;
const pageAccessToken =
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

const graphVersion =
  process.env.FACEBOOK_GRAPH_VERSION || "v26.0";

const today = new Date().toISOString().slice(0, 10);

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
// DUPLICATE CHECK
// =========================

const alreadyPostedToday = posts.some(post => {
  if (!post.message || !post.created_time) {
    return false;
  }

  const postDate = new Date(post.created_time)
    .toISOString()
    .slice(0, 10);

  return (
    postDate === today &&
    post.message.includes(`TMDB Movie ID: ${movie.id}`)
  );
});

if (alreadyPostedToday) {
  return res.json({
    success: true,
    skipped: true,
    reason: "This movie was already posted today",
    movie: movie.title
  });
}

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

const rating = Number(movie.vote_average || 0).toFixed(1);

// TMDB poster image
const posterUrl = movie.poster_path
  ? `${IMAGE_BASE_URL}${movie.poster_path}`
  : null;

const message = `🎬 FLICKCANVAS Movie of the Day

${movie.title}

⭐ Rating: ${rating}/10
📅 Release Date: ${formattedDate}

${movie.overview || "Discover this movie on FLICKCANVAS."}

💬 Would you watch this movie? Tell us what you think! 👇

❤️ Like this post if you love discovering new movies.

📌 Follow FLICKCANVAS to discover more trending movies, trailers, and movie updates every day!

👉 View movie details:
${link}

TMDB Movie ID: ${movie.id}

#FLICKCANVAS #MovieOfTheDay #Movies #MovieLovers #TrendingMovies`;

// =========================
// POST TO FACEBOOK
// =========================

const { postToFacebookPage } =
  require("./facebook");

const result = await postToFacebookPage({
  message,
  link,
  imageUrl: posterUrl
});
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

    const instagramCaption = `🎬 FLICKCANVAS Movie of the Day

${movie.title}

⭐ Rating: ${rating}/10

📅 Release Date: ${formattedDate}

${movie.overview || "Discover this movie on FLICKCANVAS."}

👉 View movie details:
${link}

TMDB Movie ID: ${movie.id}

#FLICKCANVAS #MovieOfTheDay #Movies #MovieLovers #TrendingMovies`;

    // =========================
    // CHECK TODAY'S INSTAGRAM POSTS
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

    const today = new Date()
      .toISOString()
      .slice(0, 10);

    const alreadyPostedInstagram =
      instagramMedia.some(item => {

        if (!item.caption || !item.timestamp) {
          return false;
        }

        const postDate = new Date(item.timestamp)
          .toISOString()
          .slice(0, 10);

        return (
          postDate === today &&
          item.caption.includes(
            `TMDB Movie ID: ${movie.id}`
          )
        );
      });

    if (alreadyPostedInstagram) {

      instagramResult = {
        success: true,
        skipped: true,
        reason: "This movie was already posted on Instagram today",
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

      instagramResult = {
        success: true,
        skipped: false,
        movie: movie.title,
        instagramMediaId:
          publishResponse.data.id
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

res.json({
  success: true,
  skipped: false,
  movie: movie.title,
  facebook: result,
  instagram: instagramResult
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