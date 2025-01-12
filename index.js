require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { TwitterApi } = require('twitter-api-v2');
const schedule = require('node-schedule');

// Check if required environment variables are set
const requiredEnvVars = [
    'GEMINI_API_KEY',
    'TWITTER_API_KEY',
    'TWITTER_API_SECRET',
    'TWITTER_BEARER_TOKEN',
    'TWITTER_ACCESS_TOKEN',
    'TWITTER_ACCESS_SECRET',
  ];
  
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      console.error(`Error: Missing environment variable ${varName}`);
      process.exit(1);
    }
  }


// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Initialize Twitter API client
const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

const rwClient = twitterClient.readWrite;

// Function to generate a tweet from AI
async function generateTweet() {
    try {
      const prompts = [
        // Elon Musk Style (Bold, Visionary, A bit Provocative)
        "Generate a tweet in Elon Musk's style about the future of AI and its potential impact on humanity. Keep it under 280 characters. Don't include any hashtags. Make it sound very ambitious.",
        "Write a tweet like Elon Musk discussing a breakthrough in AI and how it will disrupt the SAAS market. Keep it under 280 characters. Don't include any hashtags. Make it sound like he discovered it himself.",
        "Create a tweet in Elon Musk's tone about the challenges of building a startup in the AI space. Keep it under 280 characters. Don't include any hashtags. Add some humor like he always makes.",
         "Write a tweet from the perspective of Elon Musk explaining the importance of open source AI. Keep it under 280 characters. Don't include any hashtags.",
        "Write a tweet in Elon Musk's style about his next AI project. Keep it under 280 characters. Don't include any hashtags.",
    
        // Kunal Shah Style (Analytical, Business-Focused, Insightful)
        "Write a tweet in Kunal Shah's style analyzing the current SAAS market and predicting future trends. Keep it under 280 characters. Don't include any hashtags. Use business terminology",
        "Generate a tweet like Kunal Shah about a unique AI tool he believes is poised to disrupt the startup ecosystem. Keep it under 280 characters. Don't include any hashtags. Try to sound very smart.",
        "Create a tweet with Kunal Shah's tone about the importance of a great product and business. Keep it under 280 characters. Don't include any hashtags. Use business terminology.",
        "Write a tweet in Kunal Shah's style about common misconceptions about AI and startups. Keep it under 280 characters. Don't include any hashtags.",
        "Write a tweet from the perspective of Kunal Shah about how AI can improve the efficiency of startups. Keep it under 280 characters. Don't include any hashtags.",
          
    
        // Lex Fridman Style (Philosophical, Thought-Provoking, Deep)
        "Generate a tweet in Lex Fridman's style reflecting on the ethical implications of AI. Keep it under 280 characters. Don't include any hashtags. Try to sound very philosophical.",
        "Write a tweet from Lex Fridman about how AI can impact the meaning of life. Keep it under 280 characters. Don't include any hashtags. Be very insightful.",
        "Create a tweet with Lex Fridman's tone exploring the human element in tech development. Keep it under 280 characters. Don't include any hashtags. Try to be very thoughtful.",
         "Write a tweet in the style of Lex Fridman about the future of education in the age of AI. Keep it under 280 characters. Don't include any hashtags. Try to keep it thought provoking.",
        "Write a tweet from the perspective of Lex Fridman about the role of human creativity in an AI driven world. Keep it under 280 characters. Don't include any hashtags",
    
        // Tones Style (Direct, Pragmatic, Developer-Centric)
         "Write a tweet in a developer's tone about the pros and cons of the latest AI tools for development. Keep it under 280 characters. Don't include any hashtags. Be very honest and pragmatic.",
        "Create a tweet using a dev's tone about how to solve the most frustrating problems with AI for developers. Keep it under 280 characters. Don't include any hashtags. Talk like a developer.",
          "Generate a tweet from the perspective of a developer using a funny way on the joys and frustrations of working with AI tools. Keep it under 280 characters. Don't include any hashtags. Talk like a developer.",
          "Write a tweet in a pragmatic tone like a developer discussing a common pain point in the workflow of developing with AI tools. Keep it under 280 characters. Don't include any hashtags. Talk like a developer.",
        "Write a tweet in a developer tone asking what are the best AI tools a developer can use to improve their work. Keep it under 280 characters. Don't include any hashtags",
        
       //Startup focused
        "Write a tweet about a new approach to raising funds for a AI startup, and make it a hot take. Keep it under 280 characters. Don't include any hashtags.",
          "Generate a tweet about what are some of the things a startup should look at before deciding to use AI tools. Keep it under 280 characters. Don't include any hashtags.",
        "Write a tweet that talks about the challenges that startups face when deciding to implement AI. Keep it under 280 characters. Don't include any hashtags",
        "Write a tweet about what are the 3 most important things when creating an AI powered SAAS. Keep it under 280 characters. Don't include any hashtags",
        "Write a tweet that encourages startup founders to explore new and innovative AI applications in their business. Keep it under 280 characters. Don't include any hashtags",
    ];
    
        const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
        const result = await model.generateContent(randomPrompt);
        const tweetText = result.response.text();
        return tweetText;
    
      } catch (error) {
        console.error("Error generating tweet:", error);
        return null;
      }
}

// Function to post a tweet to Twitter
async function postTweet(tweetText) {
    if(!tweetText){
        console.error("No tweet text provided, cannot post to twitter")
        return;
    }
  try {
    const response = await rwClient.v2.tweet(tweetText);
    console.log("Tweet posted:", response.data.id);
  } catch (error) {
    console.error("Error posting tweet:", error);
    throw error; // rethrow error to trigger retry logic
  }
}


// Main function to generate and post a tweet
async function main() {
    const tweetText = await generateTweet();
    console.log("Generated tweet:", tweetText);
  
    if (tweetText) {
        try{
            await postTweet(tweetText);
        } catch (error) {
            console.error("Error posting tweet:", error);
            console.log("Retrying to post tweet after 30 seconds");
            setTimeout(async () => {
                try {
                    await postTweet(tweetText);
                  } catch (retryError) {
                    console.error("Retry failed:", retryError);
                  }
            }, 30000);
        }
    }
}

// Immediately run the main function on start
(async () => {
    console.log("Running initial tweet generation and posting on startup");
    await main();
})();



// Schedule the job to run every 1.5 hours
const job = schedule.scheduleJob('0 */1.5 * * *', async () => {
    console.log('Running scheduled tweet generation and posting at:', new Date());
    await main();
  });


console.log("Scheduled tweet job to run every 1.5 hours.");

// Keep the script running indefinitely
setInterval(() => {
    // This does nothing, but keeps the script alive
}, 10000);