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
            // Humor/Relatable
            "Generate a short, funny tweet about a common developer problem or joke. Keep it under 280 characters.",
            "Write a humorous tweet about a typical Monday morning for a developer. Keep it under 280 characters.",
            "Create a funny tweet about debugging code and the 'joy' of finding that one missing semicolon. Keep it under 280 characters.",
            "Compose a tweet about a quirky or funny coding habit you have, or that you've observed. Keep it under 280 characters.",
            "Write a tweet describing what a typical friday feels like after a week of coding Keep it under 280 characters",
        
            // Student/Learning Challenges
            "Create an engaging tweet about a common challenge students face while learning new technologies. Keep it under 280 characters.",
            "Write a tweet asking for tips or advice on dealing with imposter syndrome while learning to code. Keep it under 280 characters.",
            "Generate a tweet asking other learners what they struggle with the most while learning programming and offer your solution. Keep it under 280 characters.",
            "Create a tweet asking other people what their favorite resources are to learn programming. Keep it under 280 characters.",
            "Write a tweet describing what motivates you to keep learning and improving your skills. Keep it under 280 characters.",
        
            // Motivation/Inspiration
            "Write a motivational tweet about overcoming challenges in coding or learning something new. Keep it under 280 characters.",
            "Craft an inspirational tweet about the power of continuous learning in tech. Keep it under 280 characters.",
            "Share a tweet expressing gratitude for the community that supports developers and learners. Keep it under 280 characters.",
            "Generate an upbeat tweet with a positive mindset towards code and the challenges that it brings. Keep it under 280 characters",
            "Write a motivational quote for all the developers and students out there, keep it under 280 characters",
        
            // Book/Resource Engagement
             "Write a short tweet like 'Just finished reading [a relevant book]' and add a small opinion. Keep it under 280 characters.",
             "Create a tweet recommending a useful tool or resource you found for coding. Keep it under 280 characters.",
             "Share your insights from a tech blog article that impressed you. Keep it under 280 characters.",
             "Generate a tweet asking people what their favorite learning platform is and how it has helped them Keep it under 280 characters",
             "Generate a tweet asking other developers what their favorite books are. Keep it under 280 characters",
        
        
            // Conversation Starters
            "Generate a tweet that would start a conversation among developers or students about their workflow. Keep it under 280 characters.",
            "Compose a tweet posing an open question about best practices for a specific programming task. Keep it under 280 characters.",
            "Write a tweet asking the community about their favorite development tools and why. Keep it under 280 characters.",
             "Create a tweet asking people to share their biggest mistakes while coding and what they learned from it Keep it under 280 characters",
            "Write a tweet asking the community what are some of their favorite programming languages and why. Keep it under 280 characters",
            
        
            // Pain Points/Real Talk
              "Share a tweet about the frustration of dealing with legacy code. Keep it under 280 characters.",
              "Generate a tweet asking other developers to share what they find the most frustrating in their job. Keep it under 280 characters.",
              "Write a tweet about the burnout caused by deadlines and code. Keep it under 280 characters.",
              "Create a tweet talking about the biggest problem with coding and asking others for their opinions. Keep it under 280 characters.",
              "Write a tweet that encourages people to take a break and reflect on their progress. Keep it under 280 characters"
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