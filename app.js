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
  const cronSecret = process.env.CRON_SECRET || process.env.FACEBOOK_CRON_SECRET;

  if (!cronSecret || (bearerSecret !== cronSecret && manualSecret !== cronSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

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

    const movie = (trendingResponse.data.results || []).find(item => item.title);

    if (!movie) {
      return res.status(404).json({ error: "No trending movie found" });
    }

    const siteUrl = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
    const link = `${siteUrl}/movie/${movie.id}`;
    const message = `🎬 FLICKCANVAS Movie of the Day\n\n${movie.title}\n⭐ Rating: ${Number(movie.vote_average || 0).toFixed(1)}\n📅 Release: ${movie.release_date || "N/A"}\n\n${movie.overview || "Discover this movie on FLICKCANVAS."}\n\n👉 View movie details: ${link}\n\n#FLICKCANVAS #Movies #MovieOfTheDay`;

    const { postToFacebookPage } = require("./facebook");
    const result = await postToFacebookPage({ message, link });

    res.json({ success: true, movie: movie.title, facebook: result });
  } catch (error) {
    console.error("FACEBOOK AUTO POST ERROR:", error.response?.data || error.message);
    res.status(500).json({
      error: "Facebook post failed",
      details: error.response?.data || error.message
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