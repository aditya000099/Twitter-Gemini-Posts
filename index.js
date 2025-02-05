require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { TwitterApi } = require("twitter-api-v2");
const schedule = require("node-schedule");
const axios = require("axios");
const https = require("https");

// Configuration
const config = {
  tweetInterval: "0 * * * *", // Every hour at minute 0
  testMode: false,
  newsKeywords: [
    "AI",
    "Tech",
    "SpaceX",
    "NASA",
    "Machine Learning",
    "Innovation",
    "Startups",
    "SAAS",
    "Technology",
  ],
  maxRetries: 3,
  tweetMaxLength: 280,
  aiPromptVariations: 5,
  topTweetKeywords: [
    "ai",
    "saas",
    "google",
    "openai",
    "microsoft",
    "apple",
    "nvidia",
    "memecoins",
    "tech",
    "innovation",
  ],
};

// Validate environment variables
const requiredEnvVars = [
  "GEMINI_API_KEY",
  "TWITTER_API_KEY",
  "TWITTER_API_SECRET",
  "TWITTER_BEARER_TOKEN",
  "TWITTER_ACCESS_TOKEN",
  "TWITTER_ACCESS_SECRET",
  "CURRENTS_API_KEY",
];

requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

// Initialize APIs
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

const rwClient = twitterClient.readWrite;
// Rate limit tracking
const rateLimits = {
  tweets: {
    remaining: 50,
    reset: 0,
  },
};

// Enhanced logger
const logger = {
  info: (...args) =>
    console.log(`[${new Date().toISOString()}] INFO:`, ...args),
  error: (...args) =>
    console.error(`[${new Date().toISOString()}] ERROR:`, ...args),
  debug: (...args) =>
    console.debug(`[${new Date().toISOString()}] DEBUG:`, ...args),
};

// Twitter API Helper
class TwitterHelper {
  static async searchRecentTweets(query) {
    try {
      const result = await twitterClient.v2.search(query, {
        "tweet.fields": ["public_metrics"],
        max_results: 10,
      });

      if (!result?.data?.length) return null;

      // Filter tweets with engagement
      return result.data.filter(
        (t) =>
          t.public_metrics.like_count > 10 || t.public_metrics.retweet_count > 5
      );
    } catch (error) {
      logger.error("Twitter search failed:", error);
      return null;
    }
  }

  static async fetchTopTweets() {
    const randomKeyword =
      config.topTweetKeywords[
        Math.floor(Math.random() * config.topTweetKeywords.length)
      ];
    const options = {
      method: "GET",
      url: "https://twitter-v24.p.rapidapi.com/search/",
      params: {
        query: randomKeyword,
        section: "top",
        limit: "10",
      },
      headers: {
        "x-rapidapi-key": "aa81d9bcc0mshdbcda7e2ad75055p1ced75jsnf5dacefd3151",
        "x-rapidapi-host": "twitter-v24.p.rapidapi.com",
      },
    };
    try {
      const response = await axios.request(options);
      logger.debug("Top Tweets API Response:", response.data);
      if (
        response.data &&
        response.data.search_by_raw_query &&
        response.data.search_by_raw_query.search_timeline &&
        response.data.search_by_raw_query.search_timeline.timeline &&
        response.data.search_by_raw_query.search_timeline.timeline.instructions
      ) {
        const entries =
          response.data.search_by_raw_query.search_timeline.timeline.instructions.find(
            (item) => item.type === "TimelineAddEntries"
          )?.entries;
        if (entries) {
          const validTweets = entries
            .filter(
              (entry) => entry.entryId && entry.entryId.startsWith("tweet-")
            )
            .map((entry) => {
              const tweetData =
                response.data.globalObjects?.tweets?.[
                  entry.entryId.split("-")[1]
                ];
              return tweetData?.full_text;
            })
            .filter(Boolean);
          if (validTweets.length > 0) {
            return validTweets[Math.floor(Math.random() * validTweets.length)];
          } else {
            return null;
          }
        } else {
          return null;
        }
      } else {
        return null;
      }
    } catch (error) {
      logger.error("Top tweets fetch failed:", error);
      return null;
    }
  }

  static async postTweet(text) {
    if (config.testMode) {
      logger.info("Test mode - Would have tweeted:", text);
      return { data: { id: "test_id" } };
    }

    try {
      const response = await rwClient.v2.tweet(text);
      logger.info(`Tweet posted: ${response.data.id}`);
      return response;
    } catch (error) {
      this.handleRateLimits(error);
      throw error;
    }
  }

  static handleRateLimits(error) {
    if (error.rateLimit) {
      rateLimits.tweets = {
        remaining: error.rateLimit.remaining,
        reset: error.rateLimit.reset,
      };
      logger.info(
        `Rate limits updated - Remaining: ${error.rateLimit.remaining}`
      );
    }
  }
}

// AI Helper
class AIHelper {
  static async generateTweet(prompt) {
    let retries = 0;
    while (retries < config.maxRetries) {
      try {
        const result = await aiModel.generateContent(prompt);
        const text = result.response.text().trim();

        if (!text || text.length > config.tweetMaxLength) {
          throw new Error("Invalid tweet length");
        }
        return text;
      } catch (error) {
        logger.error(`AI generation attempt ${retries + 1} failed:`, error);
      }
      retries++;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return null;
  }
}

// Content Generation
class ContentGenerator {
  static async getNewsContext() {
    try {
      const response = await fetch(
        `https://api.currentsapi.services/v1/search?domain=zdnet.com&keywords=${
          config.newsKeywords[
            Math.floor(Math.random() * config.newsKeywords.length)
          ]
        }&language=en&apiKey=${process.env.CURRENTS_API_KEY}`
      );
      logger.debug("News API URL:", response.url);
      const data = await response.json();
      logger.debug("News API Response:", data);
      if (data.news && data.news.length > 0) {
        return data.news[Math.floor(Math.random() * data.news.length)]
          .description;
      } else {
        return null;
      }
    } catch (error) {
      logger.error("News fetch failed:", error);
      return null;
    }
  }

  static async generateTweetContent(useNews) {
    let retries = 0;

    while (retries < config.maxRetries) {
      try {
        let news = null;
        let topTweet = null;
        if (useNews) {
          news = await this.getNewsContext();
          if (!news) {
            logger.debug("News API response null, retrying " + (retries + 1));
          }
        } else {
          topTweet = await TwitterHelper.fetchTopTweets();
          if (!topTweet) {
            logger.debug(
              "Top tweet API response null, retrying " + (retries + 1)
            );
          }
        }

        const prompt = this.createPrompt(news, topTweet);
        const tweet = await AIHelper.generateTweet(prompt);

        if (tweet) {
          if (news) {
            return { text: tweet, source: "news" };
          } else if (topTweet) {
            return { text: tweet, source: "topTweet" };
          }
        }
      } catch (error) {
        logger.error(
          `Content generation attempt ${retries + 1} failed:`,
          error
        );
      }
      retries++;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return null;
  }

  static createPrompt(news, tweet) {
    const prompts = [
      `Create a casual tech-related tweet in the style of a 25-year-old, keeping it under ${
        config.tweetMaxLength
      } characters. Don't include any hashtags or beg for engagement, focus on trending topics. ${
        news ? "React to this news:" + news : ""
      }`,
      `Generate a humorous reaction to ${
        tweet ? "this tweet: " + tweet : "current tech trends"
      }. Keep it conversational, but don't include any hashtags or beg for anything.`,
      `Write a tweet that combines ${
        news ? "this news: " + news : "tech"
      } with everyday life observations. Casual tone. Do not beg for anything or use hashtags.`,
      `Create a tweet posing an interesting question about ${
        news ? "this: " + news : "recent tech developments"
      }. Don't include hashtags or beg.`,
      `Generate a short tech hot-take in the style of a young professional. Do not include hashtags or beg for anything, ${
        tweet ? "Respond to: " + tweet : ""
      }`,
    ];
    return prompts[Math.floor(Math.random() * prompts.length)];
  }
}

let useNewsForNextTweet = true;

// Main Execution
async function executeTweetCycle() {
  try {
    if (rateLimits.tweets.remaining < 1) {
      const resetTime = new Date(rateLimits.tweets.reset * 1000);
      logger.info(
        `Rate limit exhausted. Next reset at: ${resetTime.toISOString()}`
      );
      return;
    }

    const tweetData = await ContentGenerator.generateTweetContent(
      useNewsForNextTweet
    );
    if (tweetData) {
      logger.info(`Tweet will be based on ${tweetData.source}`);
      await TwitterHelper.postTweet(tweetData.text);
      useNewsForNextTweet = !useNewsForNextTweet;
    } else {
      logger.info(
        "Skipping this cycle due to null news and top tweet responses."
      );
      useNewsForNextTweet = !useNewsForNextTweet;
    }
  } catch (error) {
    logger.error("Tweet cycle failed:", error);
  }
}

// Initialization and Scheduling
(async () => {
  logger.info("Starting Twitter bot...");

  // Initial tweet
  await executeTweetCycle();

  // Schedule regular tweets
  schedule.scheduleJob(config.tweetInterval, async () => {
    logger.info("Starting scheduled tweet cycle...");
    await executeTweetCycle();
  });

  if (config.testMode) {
    logger.info("Running in test mode - tweets will not be actually posted");
    schedule.scheduleJob("*/30 * * * * *", executeTweetCycle);
  }
})();
