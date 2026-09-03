const axios = require("axios");

async function postToFacebookPage({ message, link, imageUrl }) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const graphVersion =
    process.env.FACEBOOK_GRAPH_VERSION || "v26.0";

  if (!pageId || !pageAccessToken) {
    throw new Error(
      "FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN is missing"
    );
  }

  let response;

  // =========================
  // POST WITH TMDB POSTER
  // =========================

  if (imageUrl) {
    response = await axios.post(
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
  } else {

    // =========================
    // FALLBACK: TEXT POST
    // =========================

    response = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/feed`,
      null,
      {
        params: {
          message,
          access_token: pageAccessToken
        }
      }
    );
  }

  const result = response.data;

  // =========================
  // POST LINK AS FIRST COMMENT
  // =========================

  const postId = result.post_id || result.id;

  if (postId && link) {
    await axios.post(
      `https://graph.facebook.com/${graphVersion}/${postId}/comments`,
      null,
      {
        params: {
          message: `🎬 Watch the Trailer & view more details:\n${link}`,
          access_token: pageAccessToken
        }
      }
    );
  }

  return result;
}

module.exports = { postToFacebookPage };