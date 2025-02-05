require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { TwitterApi } = require('twitter-api-v2');
const schedule = require('node-schedule');
const axios = require('axios');
const https = require('https');


// Configuration
const config = {
    tweetInterval: '0 * * * *', // Every hour at minute 0
    testMode: true,
    newsKeywords: ["AI", "Tech", "SpaceX", "NASA", "Machine Learning", "Innovation", "Startups", "SAAS"],
    maxRetries: 3,
    tweetMaxLength: 280,
    aiPromptVariations: 5,
    topTweetKeywords: ["ai", "saas", "google", "openai", "microsoft", "apple", "nvidia", "memecoins"]
  };
  
  // Validate environment variables
  const requiredEnvVars = [
    'GEMINI_API_KEY',
    'TWITTER_API_KEY',
    'TWITTER_API_SECRET',
    'TWITTER_BEARER_TOKEN',
    'TWITTER_ACCESS_TOKEN',
    'TWITTER_ACCESS_SECRET'
  ];
  
  requiredEnvVars.forEach(varName => {
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
  
  // Rate limit tracking
  const rateLimits = {
    tweets: {
      remaining: 50,
      reset: 0
    }
  };
  
  // Enhanced logger
  const logger = {
    info: (...args) => console.log(`[${new Date().toISOString()}] INFO:`, ...args),
    error: (...args) => console.error(`[${new Date().toISOString()}] ERROR:`, ...args)
  };
  
  // Twitter API Helper
  class TwitterHelper {
    static async searchRecentTweets(query) {
     try {
       const result = await twitterClient.v2.search(query, {
         'tweet.fields': ['public_metrics'],
         max_results: 10
       });
       
       if (!result?.data?.length) return null;
       
       // Filter tweets with engagement
       return result.data.filter(t => 
         t.public_metrics.like_count > 10 ||
         t.public_metrics.retweet_count > 5
       );
     } catch (error) {
       logger.error('Twitter search failed:', error);
       return null;
     }
   }
   
  
  
  static async fetchTopTweets() {
      const randomKeyword = config.topTweetKeywords[Math.floor(Math.random() * config.topTweetKeywords.length)];
    const options = {
      method: 'GET',
      url: 'https://twitter-v24.p.rapidapi.com/search/',
      params: {
        query: randomKeyword,
        section: 'top',
        limit: '10'
      },
      headers: {
          'x-rapidapi-key': 'aa81d9bcc0mshdbcda7e2ad75055p1ced75jsnf5dacefd3151',
        'x-rapidapi-host': 'twitter-v24.p.rapidapi.com'
      }
    };
    try {
      const response = await axios.request(options);
         if (response.data && response.data.search_by_raw_query && response.data.search_by_raw_query.search_timeline && response.data.search_by_raw_query.search_timeline.timeline && response.data.search_by_raw_query.search_timeline.timeline.instructions) {
        
             const entries = response.data.search_by_raw_query.search_timeline.timeline.instructions.find(item => item.type === 'TimelineAddEntries')?.entries;
           
             if (entries) {
                    const validTweets = entries.filter(entry => entry.entryId && entry.entryId.startsWith("tweet-")).map(entry => {
                      return entry.content?.itemContent?.tweet_results?.result?.legacy?.full_text;
              }).filter(Boolean);
               if(validTweets.length > 0){
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
      logger.error('Top tweets fetch failed:', error);
      return null;
    }
  }
  
  static async postTweet(text) {
    if (config.testMode) {
      logger.info('Test mode - Would have tweeted:', text);
      return { data: { id: 'test_id' } };
    }

    try {
      const response = await twitterClient.v2.tweet(text);
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
        reset: error.rateLimit.reset
      };
      logger.info(`Rate limits updated - Remaining: ${error.rateLimit.remaining}`);
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
        
            if (!text) {
              throw new Error('Invalid tweet length');
          }
           return text;

        } catch (error) {
          logger.error(`AI generation attempt ${retries + 1} failed:`, error);
        }
       retries++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      return null;
   
    }
}

// Content Generation
class ContentGenerator {
  static async getNewsContext() {
    try {
      const response = await fetch(`https://api.currentsapi.services/v1/search?domain=zdnet.com&keywords=${
        config.newsKeywords[Math.floor(Math.random() * config.newsKeywords.length)]
      }&language=en&apiKey=${process.env.CURRENTS_API_KEY}`);
      
      const data = await response.json();
      return data.news?.[Math.floor(Math.random() * data.news.length)]?.description;
    } catch (error) {
      logger.error('News fetch failed:', error);
      return null;
    }
  }
  
    static async generateTweetContent() {
    let retries = 0;
    
    while (retries < config.maxRetries) {
      try {
          const news = await this.getNewsContext();
           const topTweet = await TwitterHelper.fetchTopTweets();


        const prompt = this.createPrompt(news, topTweet);
        const tweet = await AIHelper.generateTweet(prompt);
        
        if (tweet) {
           if (news) {
                return {text: tweet, source: 'news'}
            } else if (topTweet) {
                 return {text: tweet, source: 'topTweet'}
             }
             else {
                 return {text: tweet, source: 'default'}
                }
            }
      } catch (error) {
        logger.error(`Content generation attempt ${retries + 1} failed:`, error);
      }
      
      retries++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
     const defaultPrompt =  `Generate a short, funny tweet about a trending topic. Don't use hashtags or beg for engagement, keep it under ${config.tweetMaxLength} characters.`
         const tweet = await AIHelper.generateTweet(defaultPrompt);
            if(tweet){
                return {text: tweet, source: 'default'}
            }
     return null;
  }

  static createPrompt(news, tweet) {
    const prompts = [
         `Create a casual tech-related tweet in the style of a 25-year-old, keeping it under ${config.tweetMaxLength} characters. Don't include any hashtags or beg for engagement, focus on trending topics. ${news ? 'React to this news:' + news : ''}`,
        `Generate a humorous reaction to ${tweet ? 'this tweet: ' + tweet : 'current tech trends'}. Keep it conversational, but don't include any hashtags or beg for anything.`,
        `Write a tweet that combines ${news ? 'this news: ' + news : 'tech'} with everyday life observations. Casual tone. Do not beg for anything or use hashtags.`,
        `Create a tweet posing an interesting question about ${news ? 'this: ' + news : 'recent tech developments'}. Don't include hashtags or beg.`,
        `Generate a short tech hot-take in the style of a young professional. Do not include hashtags or beg for anything, ${tweet ? 'Respond to: ' + tweet : ''}`

    ];

    return prompts[Math.floor(Math.random() * prompts.length)];
  }
}


// Main Execution
async function executeTweetCycle() {
  try {
    if (rateLimits.tweets.remaining < 1) {
      const resetTime = new Date(rateLimits.tweets.reset * 1000);
      logger.info(`Rate limit exhausted. Next reset at: ${resetTime.toISOString()}`);
      return;
    }
    
      const tweetData = await ContentGenerator.generateTweetContent();
      if(tweetData){
          logger.info(`Tweet will be based on ${tweetData.source}`);
          await TwitterHelper.postTweet(tweetData.text);
        }
      
    
  } catch (error) {
    logger.error('Tweet cycle failed:', error);
  }
}

// Initialization and Scheduling
(async () => {
  logger.info('Starting Twitter bot...');
  
  // Initial tweet
  await executeTweetCycle();
  
  // Schedule regular tweets
  schedule.scheduleJob(config.tweetInterval, async () => {
    logger.info('Starting scheduled tweet cycle...');
    await executeTweetCycle();
  });

  if (config.testMode) {
    logger.info('Running in test mode - tweets will not be actually posted');
         schedule.scheduleJob('*/30 * * * * *', executeTweetCycle);
    }
})();




// require('dotenv').config();
// const { GoogleGenerativeAI } = require("@google/generative-ai");
// const { TwitterApi } = require('twitter-api-v2');
// const schedule = require('node-schedule');
// const https = require('https');

// // Configuration
// const config = {
//   tweetInterval: '0 * * * *', // Every hour at minute 0
//   testMode: true,
//   newsKeywords: ["AI", "Tech", "SpaceX", "NASA", "Machine Learning", "Innovation", "Startups", "SAAS"],
//   maxRetries: 3,
//   tweetMaxLength: 280,
//   aiPromptVariations: 5
// };

// // Validate environment variables
// const requiredEnvVars = [
//   'GEMINI_API_KEY',
//   'TWITTER_API_KEY',
//   'TWITTER_API_SECRET',
//   'TWITTER_ACCESS_TOKEN',
//   'TWITTER_ACCESS_SECRET'
// ];

// requiredEnvVars.forEach(varName => {
//   if (!process.env[varName]) {
//     console.error(`Missing required environment variable: ${varName}`);
//     process.exit(1);
//   }
// });

// // Initialize APIs
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// const twitterClient = new TwitterApi({
//   appKey: process.env.TWITTER_API_KEY,
//   appSecret: process.env.TWITTER_API_SECRET,
//   accessToken: process.env.TWITTER_ACCESS_TOKEN,
//   accessSecret: process.env.TWITTER_ACCESS_SECRET,
// });

// // Rate limit tracking
// const rateLimits = {
//   tweets: {
//     remaining: 50,
//     reset: 0
//   }
// };

// // Enhanced logger
// const logger = {
//   info: (...args) => console.log(`[${new Date().toISOString()}] INFO:`, ...args),
//   error: (...args) => console.error(`[${new Date().toISOString()}] ERROR:`, ...args)
// };

// // Twitter API Helper
// class TwitterHelper {
//    static async searchRecentTweets(query) {
//     try {
//       const result = await twitterClient.v2.search(query, {
//         'tweet.fields': ['public_metrics'],
//         max_results: 10
//       });
      
//       if (!result?.data?.length) return null;
      
//       // Filter tweets with engagement
//       return result.data.filter(t => 
//         t.public_metrics.like_count > 10 ||
//         t.public_metrics.retweet_count > 5
//       );
//     } catch (error) {
//       logger.error('Twitter search failed:', error);
//       return null;
//     }
//   }
  
//   static async fetchTopTweets() {
//     return new Promise((resolve, reject) => {
//       const options = {
//         method: 'GET',
//         hostname: 'twitter-api47.p.rapidapi.com',
//         port: null,
//         path: '/v2/search?query=spacex&type=Top',
//         headers: {
//             'x-rapidapi-key': 'aa81d9bcc0mshdbcda7e2ad75055p1ced75jsnf5dacefd3151',
//           'x-rapidapi-host': 'twitter-api47.p.rapidapi.com'
//         }
//       };
  
//       const req = https.request(options, function (res) {
//         const chunks = [];
//         res.on('data', function (chunk) {
//             chunks.push(chunk);
//         });
    
//         res.on('end', function () {
//             const body = Buffer.concat(chunks);
//             try {
//               const data = JSON.parse(body.toString());
//               if (data && data.tweets && data.tweets.length > 0) {
//                   const randomTweet = data.tweets[Math.floor(Math.random() * data.tweets.length)];
//                      if (randomTweet.content && randomTweet.content.itemContent && randomTweet.content.itemContent.tweet_results && randomTweet.content.itemContent.tweet_results.result && randomTweet.content.itemContent.tweet_results.result.legacy) {
//                          resolve(randomTweet.content.itemContent.tweet_results.result.legacy.full_text);
//                      } else {
//                           resolve(null);
//                      }
//                   } else {
//                       resolve(null);
//                   }
//             } catch (error) {
//                 reject(error);
//             }
//         });
//         res.on('error', (error) => {
//           reject(error);
//         });
//       });
//       req.on('error', (error) => {
//         reject(error);
//       });
//       req.end();
//     });
//   }

//   static async postTweet(text) {
//     if (config.testMode) {
//       logger.info('Test mode - Would have tweeted:', text);
//       return { data: { id: 'test_id' } };
//     }

//     try {
//       const response = await twitterClient.v2.tweet(text);
//       logger.info(`Tweet posted: ${response.data.id}`);
//       return response;
//     } catch (error) {
//       this.handleRateLimits(error);
//       throw error;
//     }
//   }

//   static handleRateLimits(error) {
//     if (error.rateLimit) {
//       rateLimits.tweets = {
//         remaining: error.rateLimit.remaining,
//         reset: error.rateLimit.reset
//       };
//       logger.info(`Rate limits updated - Remaining: ${error.rateLimit.remaining}`);
//     }
//   }
// }

// // AI Helper
// class AIHelper {
//    static async generateTweet(prompt) {
//     let retries = 0;
//     while (retries < config.maxRetries) {
//       try {
//           const result = await aiModel.generateContent(prompt);
//           const text = result.response.text().trim();
      
//           if (!text || text.length > config.tweetMaxLength) {
//             throw new Error('Invalid tweet length');
//         }
//          return text;

//       } catch (error) {
//         logger.error(`AI generation attempt ${retries + 1} failed:`, error);
//       }
//      retries++;
//       await new Promise(resolve => setTimeout(resolve, 2000));
//     }
//     return null;
   
//   }
// }


// // Content Generation
// class ContentGenerator {
//   static async getNewsContext() {
//     try {
//       const response = await fetch(`https://api.currentsapi.services/v1/search?keywords=${
//         config.newsKeywords[Math.floor(Math.random() * config.newsKeywords.length)]
//       }&language=en&apiKey=${process.env.CURRENTS_API_KEY}`);
      
//       const data = await response.json();
//       return data.news?.[Math.floor(Math.random() * data.news.length)]?.description;
//     } catch (error) {
//       logger.error('News fetch failed:', error);
//       return null;
//     }
//   }
  
//     static async generateTweetContent() {
//     let retries = 0;
    
//     while (retries < config.maxRetries) {
//       try {
//           const news = await this.getNewsContext();
//            const topTweet = await TwitterHelper.fetchTopTweets();


//         const prompt = this.createPrompt(news, topTweet);
//         const tweet = await AIHelper.generateTweet(prompt);
        
//         if (tweet) return tweet;
//       } catch (error) {
//         logger.error(`Content generation attempt ${retries + 1} failed:`, error);
//       }
      
//       retries++;
//       await new Promise(resolve => setTimeout(resolve, 2000));
//     }
    
//     return this.generateFallbackContent();
//   }

//   static createPrompt(news, tweet) {
//     const prompts = [
//           `Create a casual tech-related tweet in the style of a 25-year-old, keeping it under ${config.tweetMaxLength} characters. Don't include any hashtags or beg for engagement, focus on trending topics. ${news ? 'React to this news:' + news : ''}`,
//            `Generate a humorous reaction to ${tweet ? 'this tweet: ' + tweet : 'current tech trends'}. Keep it conversational, but don't include any hashtags or beg for anything.`,
//           `Write a tweet that combines ${news ? 'this news: ' + news : 'tech'} with everyday life observations. Casual tone. Do not beg for anything or use hashtags.`,
//           `Create a tweet posing an interesting question about ${news ? 'this: ' + news : 'recent tech developments'}. Don't include hashtags or beg.`,
//           `Generate a short tech hot-take in the style of a young professional. Do not include hashtags or beg for anything, ${tweet ? 'Respond to: ' + tweet : ''}`
//     ];

//     return prompts[Math.floor(Math.random() * prompts.length)];
//   }

//     static generateFallbackContent() {
//         const fallbacks = [
//             "Just read an interesting tech article but can't share details yet. What's everyone reading in the tech space today?",
//             "Thinking about how fast AI is evolving. What tech development has surprised you most recently?",
//             "Sometimes I wonder if we're living in the future yet. What piece of tech still feels futuristic to you?",
//             "Had a random thought about space exploration and everyday tech. What's your favorite sci-fi tech becoming reality?",
//             "Debating with friends about the most impactful tech of the decade. What would you nominate?",
//             "I'm feeling very philosophical today, what do you think will be the most significant thing in the future, AI or Space?",
//            "Just thinking about the future, what will be the biggest change in the world?",
//            "What should i learn today?",
//            "What is the most useful tech?",
//            "Did anyone else experience that?",

//         ];

//         return fallbacks[Math.floor(Math.random() * fallbacks.length)];
//   }
// }


// // Main Execution
// async function executeTweetCycle() {
//   try {
//     if (rateLimits.tweets.remaining < 1) {
//       const resetTime = new Date(rateLimits.tweets.reset * 1000);
//       logger.info(`Rate limit exhausted. Next reset at: ${resetTime.toISOString()}`);
//       return;
//     }
//      const tweetContent = await ContentGenerator.generateTweetContent();
//      if(tweetContent){
//           await TwitterHelper.postTweet(tweetContent);
//      }

//   } catch (error) {
//     logger.error('Tweet cycle failed:', error);
//   }
// }

// // Initialization and Scheduling
// (async () => {
//     logger.info('Starting Twitter bot...');

//     // Initial tweet
//     await executeTweetCycle();

//     // Schedule regular tweets
//     schedule.scheduleJob(config.tweetInterval, async () => {
//       logger.info('Starting scheduled tweet cycle...');
//       await executeTweetCycle();
//     });

//     if (config.testMode) {
//       logger.info('Running in test mode - tweets will not be actually posted');
//          schedule.scheduleJob('*/30 * * * * *', executeTweetCycle);
//    }
// })();