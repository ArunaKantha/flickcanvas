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
    // Get movie details from TMDB
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

    let providerLink = null;
    let providerName = null;

    // =========================
    // WATCHMODE
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

console.log("WATCHMODE RESULTS:", watchmodeResponse.data);

        if (titles.length > 0) {
          const watchmodeId = titles[0].id;

          const sourcesResponse = await axios.get(
            `https://api.watchmode.com/v1/title/${watchmodeId}/sources/`,
            {
              params: {
                apiKey: process.env.WATCHMODE_API_KEY,
                regions: "US"
              }
            }
          );

          const sources = sourcesResponse.data || [];

console.log("WATCHMODE SOURCES:", sources);

const source =
  sources.find(
    s => s.web_url && s.type === "purchase"
  ) ||
  sources.find(
    s => s.web_url && s.type === "rent"
  ) ||
  sources.find(
    s => s.web_url && s.type === "sub"
  ) ||
  sources.find(
    s => s.web_url && s.type === "free"
  );

          if (source) {
            providerLink = source.web_url;
            providerName = source.name || "Official Provider";
          }
        }

      } catch (watchmodeError) {
        console.error(
          "WATCHMODE ERROR:",
          watchmodeError.response?.data ||
          watchmodeError.message
        );
      }
    }

    console.log("Movie:", movie.title);
    console.log("Provider:", providerName);
    console.log("Provider URL:", providerLink);

    res.render("movie", {
      movie: movie,
      imageBase: IMAGE_BASE_URL,
      backdropBase: BACKDROP_BASE_URL,
      providerLink: providerLink,
      providerName: providerName
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