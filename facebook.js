const axios = require("axios");

async function postToFacebookPage({ message, link, imageUrl }) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const graphVersion = process.env.FACEBOOK_GRAPH_VERSION || "v26.0";

  if (!pageId || !pageAccessToken) {
    throw new Error(
      "FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN is missing"
    );
  }

  // =========================
  // POST WITH TMDB POSTER
  // =========================

  if (imageUrl) {
    const response = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/photos`,
      null,
      {
        params: {
          url: imageUrl,
          caption: message,
          access_token: pageAccessToken
        }
      }
    );

    return response.data;
  }

  // =========================
  // FALLBACK: TEXT + LINK POST
  // =========================

  const response = await axios.post(
    `https://graph.facebook.com/${graphVersion}/${pageId}/feed`,
    null,
    {
      params: {
        message,
        link,
        access_token: pageAccessToken
      }
    }
  );

  return response.data;
}

module.exports = { postToFacebookPage };