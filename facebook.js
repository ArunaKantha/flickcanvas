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

  console.log(
    "FACEBOOK PHOTO RESPONSE:",
    JSON.stringify(result, null, 2)
  );

  // =========================
  // POST LINK AS FIRST COMMENT
  // =========================

  const postId = result.id;

  let commentResult = null;

  if (postId && link) {
    try {
      const commentResponse = await axios.post(
        `https://graph.facebook.com/${graphVersion}/${postId}/comments`,
        null,
        {
          params: {
            message: `🎬 Watch the Trailer & view more details:\n${link}`,
            access_token: pageAccessToken
          }
        }
      );

      commentResult = {
        success: true,
        id: commentResponse.data.id
      };

      console.log(
        "Facebook first comment posted successfully:",
        commentResponse.data
      );

    } catch (commentError) {
      commentResult = {
        success: false,
        error:
          commentError.response?.data ||
          commentError.message
      };

      console.error(
        "Facebook first comment failed:",
        commentError.response?.data ||
        commentError.message
      );
    }
  }

  return {
    ...result,
    comment: commentResult
  };
}

// =========================
// EXPORT
// =========================

module.exports = { postToFacebookPage };