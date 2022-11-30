const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let db = null;

// Initialize DataBase and server

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at http://localhost:3000");
    });
  } catch (error) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authenticateJwtToken = (request, response, next) => {
  let jwtToken;
  const authorHeader = request.headers["authorization"];
  if (authorHeader !== undefined) {
    jwtToken = authorHeader.split(" ")[1];
  }
  if (authorHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.user_id = payload.user_id;
        request.username = payload.username;
        next();
      }
    });
  }
};

const getUserLikes = (userDb) => {
  let myArray = [];
  const iterate = (each) => {
    myArray.push(each.name);
  };
  userDb.forEach((each) => iterate(each));
  return { likes: myArray };
};

const getUserReplies = (userDb) => {
  let myArray = [];
  const iterate = (each) => {
    myArray.push({ name: each.name, reply: each.reply });
  };
  userDb.forEach((each) => iterate(each));
  return { replies: myArray };
};

//Create User  API

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `
   SELECT * FROM user
   WHERE username LIKE '${username}';`;
  const userDb = await db.get(getUserQuery);
  if (userDb === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
           INSERT INTO user(name,username,password,gender)
           VALUES(
               '${name}',
               '${username}',
               '${hashedPassword}',
               '${gender}'
           );`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//Login User API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
    SELECT * FROM user
    WHERE username LIKE '${username}';`;
  const userDb = await db.get(getUserQuery);
  if (userDb === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordValid = await bcrypt.compare(password, userDb.password);
    if (isPasswordValid === true) {
      const payload = { user_id: userDb.user_id, username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// GET Tweets Of Whom The User follows

app.get(
  "/user/tweets/feed/",
  authenticateJwtToken,
  async (request, response) => {
    const { user_id, username } = request;
    const getUserFollowingUsers = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id LIKE ${user_id};`;
    const userFollowingUserId = await db.all(getUserFollowingUsers);

    const userFollowingArray = userFollowingUserId.map((each) => {
      return each.following_user_id;
    });
    const getUserTweetsQuery = `
    SELECT 
    user.username,
    tweet.tweet,
    tweet.date_time AS dateTime
    FROM user INNER JOIN
    tweet ON user.user_id = tweet.user_id
    WHERE user.user_id IN (${userFollowingArray})
    ORDER BY tweet.date_time DESC
    LIMIT 4;`;
    const userTweetsArray = await db.all(getUserTweetsQuery);
    response.send(userTweetsArray);
  }
);

//Returns the list of all names of people whom the user follows

app.get("/user/following/", authenticateJwtToken, async (request, response) => {
  const { user_id, username } = request;
  const getUserFollowingUsers = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id LIKE ${user_id};`;
  const userFollowingUserId = await db.all(getUserFollowingUsers);

  const userFollowingArray = userFollowingUserId.map((each) => {
    return each.following_user_id;
  });
  const getUserFollowsQuery = `
   SELECT 
    name
    FROM user 
    WHERE user_id in (${userFollowingArray});`;
  const userFollowsArray = await db.all(getUserFollowsQuery);
  response.send(userFollowsArray);
});

//Returns the list of all names of people who follows the user

app.get("/user/followers/", authenticateJwtToken, async (request, response) => {
  const { user_id, username } = request;
  const getUserFollowers = `
    SELECT follower_user_id FROM follower 
    WHERE following_user_id LIKE ${user_id};`;
  const userFollowersUserId = await db.all(getUserFollowers);
  const userFollowersArray = userFollowersUserId.map((each) => {
    return each.follower_user_id;
  });
  const getUserFollowersQuery = `
    SELECT 
    name
    FROM user
    WHERE user_id IN (${userFollowersArray});`;
  const userFollowers = await db.all(getUserFollowersQuery);
  response.send(userFollowers);
});

// Get All The User Following Replies API
app.get(
  "/tweets/:tweetId/",
  authenticateJwtToken,
  async (request, response) => {
    const { user_id } = request;
    const { tweetId } = request.params;
    const getUserFollowingUsers = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id LIKE ${user_id};`;
    const userFollowingUserId = await db.all(getUserFollowingUsers);

    const userFollowingArray = userFollowingUserId.map((each) => {
      return each.following_user_id;
    });
    const getUserFollowingTweetQuery = `
    SELECT tweet_id FROM tweet
    WHERE user_id IN (${userFollowingArray});`;
    const followingUserTweets = await db.all(getUserFollowingTweetQuery);

    const followingUserTweetArray = followingUserTweets.map((each) => {
      return each.tweet_id;
    });
    if (followingUserTweetArray.includes(parseInt(tweetId))) {
      const getTotalLikes = `
            SELECT COUNT(user_id) AS likes_count
            FROM like 
            WHERE tweet_id LIKE ${tweetId};`;
      const totalLikes = await db.get(getTotalLikes);
      const getTotalReplies = `
            SELECT COUNT(reply) AS reply_count
            FROM reply 
            WHERE tweet_id LIKE ${tweetId};`;
      const totalReplies = await db.get(getTotalReplies);
      const getTweetData = `
            SELECT tweet, date_time
            FROM tweet
            WHERE tweet_id LIKE ${tweetId};`;
      const tweetData = await db.get(getTweetData);
      response.send({
        tweet: tweetData.tweet,
        likes: totalLikes.likes_count,
        replies: totalReplies.reply_count,
        dateTime: tweetData.date_time,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//If the user requests a tweet of a user he is following, return the list of usernames who liked the tweet

app.get(
  "/tweets/:tweetId/likes/",
  authenticateJwtToken,
  async (request, response) => {
    const { user_id } = request;
    const { tweetId } = request.params;
    const getUserFollowingUsers = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id LIKE ${user_id};`;
    const userFollowingUserId = await db.all(getUserFollowingUsers);

    const userFollowingArray = userFollowingUserId.map((each) => {
      return each.following_user_id;
    });
    const getUserFollowingTweetQuery = `
    SELECT tweet_id FROM tweet
    WHERE user_id IN (${userFollowingArray});`;
    const followingUserTweets = await db.all(getUserFollowingTweetQuery);

    const followingUserTweetArray = followingUserTweets.map((each) => {
      return each.tweet_id;
    });
    if (followingUserTweetArray.includes(parseInt(tweetId))) {
      const getUserLikesQuery = `
        SELECT
        user.username AS name
        FROM like INNER JOIN 
        user ON user.user_id = like.user_id
        WHERE like.tweet_id LIKE ${tweetId};`;
      const userLikes = await db.all(getUserLikesQuery);
      response.send(getUserLikes(userLikes));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//If the user requests a tweet of a user he is following, return the list of replies.

app.get(
  "/tweets/:tweetId/replies/",
  authenticateJwtToken,
  async (request, response) => {
    const { user_id } = request;
    const { tweetId } = request.params;

    const getUserFollowingUsers = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id LIKE ${user_id};`;
    const userFollowingUserId = await db.all(getUserFollowingUsers);

    const userFollowingArray = userFollowingUserId.map((each) => {
      return each.following_user_id;
    });
    const getUserFollowingTweetQuery = `
    SELECT tweet_id FROM tweet
    WHERE user_id IN (${userFollowingArray});`;
    const followingUserTweets = await db.all(getUserFollowingTweetQuery);

    const followingUserTweetArray = followingUserTweets.map((each) => {
      return each.tweet_id;
    });
    if (followingUserTweetArray.includes(parseInt(tweetId))) {
      const getUserRepliesQuery = `
          SELECT
            user.name,
            reply.reply
            FROM user INNER JOIN 
            reply ON user.user_id = reply.user_id
            WHERE reply.tweet_id LIKE ${tweetId};`;
      const userReplies = await db.all(getUserRepliesQuery);
      response.send(getUserReplies(userReplies));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Returns a list of all tweets of the user

app.get("/user/tweets/", authenticateJwtToken, async (request, response) => {
  const { username, user_id } = request;
  const getTweetsOfUser = `
  SELECT tweet_id FROM tweet
  WHERE user_id LIKE ${user_id};`;
  const userTweets = await db.all(getTweetsOfUser);
  const userTweetsArray = userTweets.map((each) => {
    return each.tweet_id;
  });
  const tweetDataQuery = `
            SELECT tweet.tweet,
            COUNT(like.user_id) AS likes,
            COUNT(reply.reply) AS replies,
            tweet.date_time AS dateTime
            FROM ( tweet left JOIN like
            ON tweet.tweet_id = like.tweet_id ) AS T
            left JOIN reply ON T.tweet_id = reply.tweet_id
            WHERE tweet.tweet_id In (${userTweetsArray})
            GROUP BY tweet.tweet_id;`;
  const tweetData = await db.all(tweetDataQuery);
  response.send(tweetData);
});

//CREATE Tweet API

app.post("/user/tweets/", authenticateJwtToken, async (request, response) => {
  const { username, user_id } = request;
  const { tweet } = request.body;
  const date = new Date();
  const dateTime = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  const createUserTweetQuery = `
  INSERT INTO tweet (tweet,user_id,date_time)
  VALUES(
      '${tweet}',
       ${user_id},
      '${dateTime}'
  )`;
  await db.run(createUserTweetQuery);
  response.send("Created a Tweet");
});

const isUser = async (request, response, next) => {
  const { user_id } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `
    SELECT DISTINCT(user_id) FROM tweet
    WHERE tweet_id LIKE ${tweetId};`;
  const userDb = await db.get(getTweetQuery);
  if (user_id === userDb.user_id) {
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
};

//Delete Tweet API

app.delete(
  "/tweets/:tweetId",
  authenticateJwtToken,
  isUser,
  async (request, response) => {
    const { username, user_id } = request;
    const { tweetId } = request.params;
    const deleteUserTweetQuery = `
  DELETE FROM tweet
  WHERE tweet_id LIKE ${tweetId}`;
    await db.run(deleteUserTweetQuery);
    response.send("Tweet Removed");
  }
);

module.exports = app;
