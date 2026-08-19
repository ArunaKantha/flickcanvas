const express = require("express");
const path = require("path");
require("dotenv").config();
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const TMDB_BASE_URL = "https://themoviedb.org";
const IMAGE_BASE_URL = "https://tmdb.org";
const BACKDROP_BASE_URL = "https://tmdb.org";

// 1. මුල් පිටුව (Home Route)
app.get("/", async (req, res) => {
  try {
    const [popular, trending, nowPlaying] = await Promise.all([
      axios.get(`${TMDB_BASE_URL}/movie/popular`, {
        params: { api_key: process.env.TMDB_API_KEY, language: "en-US", page: 1 }
      }),
      axios.get(`${TMDB_BASE_URL}/trending/movie/week`, {
        params: { api_key: process.env.TMDB_API_KEY }
      }),
      axios.get(`${TMDB_BASE_URL}/movie/now_playing`, {
        params: { api_key: process.env.TMDB_API_KEY, language: "en-US", page: 1 }
      })
    ]);

    res.render("index", {
      popular: popular.data.results,
      trending: trending.data.results,
      nowPlaying: nowPlaying.data.results,
      imageBase: IMAGE_BASE_URL,
      searchQuery: null // මෙන්න මේක අනිවාර්යයෙන්ම තියෙන්න ඕනේ
    });
  } catch (error) {
    console.error(error.message);
    res.render("index", {
      popular: [],
      trending: [],
      nowPlaying: [],
      imageBase: IMAGE_BASE_URL,
      searchQuery: null
    });
  }
});

// 2. සෙවුම් පිටුව (Search Route)
app.get("/search", async (req, res) => {
  const query = req.query.q;
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
      params: {
        api_key: process.env.TMDB_API_KEY,
        query: query,
        language: "en-US",
        page: 1
      }
    });

    res.render("index", {
      popular: [], 
      trending: response.data.results, 
      nowPlaying: [],
      imageBase: IMAGE_BASE_URL,
      searchQuery: query
    });
  } catch (error) {
    console.error(error.message);
    res.redirect("/");
  }
});

// 3. චිත්‍රපට විස්තර පිටුව (Movie Details Route)
app.get("/movie/:id", async (req, res) => {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${req.params.id}`, {
      params: { api_key: process.env.TMDB_API_KEY, language: "en-US" }
    });

    res.render("movie", {
      movie: response.data,
      imageBase: IMAGE_BASE_URL,
      backdropBase: BACKDROP_BASE_URL
    });
  } catch (error) {
    console.error(error.message);
    res.status(404).send("Movie not found");
  }
});

// 4. නැරඹුම් පිටුව (Watch Route)
app.get("/watch/:id", async (req, res) => {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${req.params.id}`, {
      params: { api_key: process.env.TMDB_API_KEY, language: "en-US" }
    });

    res.render("watch", {
      movie: response.data
    });
  } catch (error) {
    res.status(404).send("Movie not found");
  }
});

// Server එක Start කිරීම
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
