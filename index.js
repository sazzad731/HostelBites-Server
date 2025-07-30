const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const port = process.env.PORT || 5000;
const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
  Timestamp,
} = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.mlmrnaa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    const db = client.db("HostelBites");
    const packagesCollection = db.collection("packages");
    const paymentCollection = db.collection("payments");
    const usersCollection = db.collection("users");
    const mealsCollection = db.collection("meals");
    const mealRequestCollection = db.collection("mealRequest");

    //find single user
    app.get("/user", async (req, res) => {
      const { email } = req.query;
      const result = await usersCollection.findOne({ email });
      const numberOfMeals = await mealsCollection.estimatedDocumentCount();
      res.send({ result, numberOfMeals });
    });

    // get all users
    app.get("/users", async (req, res) => {
      const { nameOrEmail } = req.query;
      const query = {};

      if (nameOrEmail) {
        query.$or = [
          { name: { $regex: nameOrEmail, $options: "i" } },
          { email: { $regex: nameOrEmail, $options: "i" } },
        ];
      }

      try {
        const users = await usersCollection.find(query).toArray();
        res.send(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ error: "Failed to fetch users" });
      }
    });

    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      const userExist = await usersCollection.findOne({
        email: userInfo.email,
      });
      if (userExist) {
        return res.status(400).json({ message: "Email already exists" });
      }
      const result = await usersCollection.insertOne(userInfo);
      res.send(result);
    });

    // get meals by category
    app.get("/mealsByCategory", async (req, res) => {
      const category = req.query.category;
      let query = {};
      if (category) {
        query = { category: category };
      }
      const result = await mealsCollection.find(query).limit(3).toArray();
      res.send(result);
    });

    //get meals by search, category and price range
    app.get("/meals", async (req, res) => {
      const { page = 1, limit = 10, search, category, priceRange } = req.query;
      let query = {};

      // Search by text (e.g., meal title)
      if (search) {
        query = { title: { $regex: search, $options: "i" } };
      }

      // Filter by category
      if (category && category !== "") {
        query.category = category;
      }

      // Filter by price range
      if (priceRange && priceRange !== "") {
        const [min, max] = priceRange
          .split("-")
          .map((value) => Number(value.replace("$", "")));
        query.price = { $gte: min, $lte: max };
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const meals = await mealsCollection
        .find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();
      const total = await mealsCollection.countDocuments(query);

      res.send({
        meals,
        total,
      });
    });

    // Get All Meals sort by like and reviews count
    app.get("/all-meals", async (req, res) => {
      const { sort } = req.query;

      
      let pipeline = [
        {
          $addFields: {
            likes_count: { $size: { $ifNull: ["$likes", []] } },
            reviews_count: { $size: { $ifNull: ["$reviews", []] } },
          },
        },
      ];

      if (sort.toLowerCase() === "like") {
        pipeline.push({ $sort: { likes_count: -1 } });
      } else if (sort.toLowerCase() === "reviews-count") {
        pipeline.push({ $sort: { reviews_count: -1 } });
      }

      try {
        const meals = await mealsCollection.aggregate(pipeline).toArray();
        res.send(meals);
      } catch (err) {
        console.error("Error fetching sorted meals:", err);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Add meal api
    app.post("/add-meal", async (req, res) => {
      const data = req.body;
      const mealData = {
        ...data,
        postTime: new Date(),
      };
      const result = await mealsCollection.insertOne(mealData);
      res.send(result);
    });

    // get requested meals
    app.get("/requested-meals", async (req, res) => {
      const { email } = req.query;
      try {
        const requestedMeals = await mealRequestCollection
          .aggregate([
            {
              $match: { userEmail: email },
            },
            {
              $addFields: {
                mealId: { $toObjectId: "$mealId" },
              },
            },
            {
              $lookup: {
                from: "meals",
                localField: "mealId",
                foreignField: "_id",
                as: "meal",
              },
            },
            {
              $unwind: "$meal",
            },
            {
              $project: {
                _id: 1,
                mealId: 1,
                status: 1,
                userEmail: 1,
                title: "$meal.title",
                likes: { $size: "$meal.likes" },
                reviews_count: { $size: "$meal.reviews" },
              },
            },
          ])
          .toArray();

        res.send(requestedMeals);
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ message: "Server error retrieving requested meals" });
      }
    });

    //Meal request api
    app.post("/meal-request", async (req, res) => {
      const requestInfo = req.body;
      const existRequest = await mealRequestCollection.findOne({
        mealId: requestInfo.mealId,
      });
      if (existRequest) {
        return res
          .status(208)
          .send({ message: "Already requested for meal", code: 208 });
      }
      const result = await mealRequestCollection.insertOne(requestInfo);
      res.send(result);
    });

    // get all packages api
    app.get("/packages", async (req, res) => {
      const result = await packagesCollection.find().toArray();
      res.send(result);
    });

    // get single package by id
    app.get("/package/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await packagesCollection.findOne(query);
      res.send(result);
    });

    app.get("/already_purchased", async (req, res) => {
      const { email } = req.query;
      const query = { email };
      const result = await paymentCollection.findOne(query);
      res.send(result);
    });

    // get all payment
    app.get("/payment-history", async (req, res) => {
      const { email } = req.query;
      const result = await paymentCollection.find({ email }).toArray();
      res.send(result);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { amountInCents } = req.body;
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: parseInt(amountInCents), // amount in cents
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.put("/payments", async (req, res) => {
      const { packageName, email, amount, paymentMethod, transactionId } =
        req.body;
      try {
        // update user badge
        const updateBadge = await usersCollection.updateOne(
          { email: email },
          {
            $set: {
              badge: packageName,
            },
          }
        );

        if (updateBadge.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "User not found or already subscribed" });
        }

        // update or insert payment record
        const paymentDoc = {
          $set: {
            packageName,
            email,
            amount,
            paymentMethod,
            transactionId,
            paidAt: new Date(),
          },
        };
        const options = { upsert: true };

        const paymentResult = await paymentCollection.updateOne(
          { email: email },
          paymentDoc,
          options
        );
        res.status(201).send(paymentResult);
      } catch (error) {
        res.send(error);
      }
    });

    // get Meal details
    app.get("/meal/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await mealsCollection.findOne(query);
      res.send(result);
    });

    // Meal likes
    app.post("/like", async (req, res) => {
      const { mealId, email } = req.body;
      const query = { _id: new ObjectId(mealId) };
      const result = await mealsCollection.updateOne(query, {
        $push: { likes: email },
      });
      res.send(result);
    });

    // Get all review
    app.get("/reviews", async (req, res) => {
      const { email } = req.query;
      const result = await mealsCollection
        .aggregate([
          { $unwind: "$reviews" },
          { $match: { "reviews.email": email } },
          {
            $project: {
              mealId: "$_id",
              mealTitle: "$title",
              like: { $size: "$likes" },
              review: "$reviews",
            },
          },
        ])
        .toArray();
      res.send(result);
    });

    app.post("/add-review", async (req, res) => {
      const data = req.body;
      const { mealId } = req.query;
      const query = { _id: new ObjectId(mealId) };
      const addedReview = {
        ...data,
        timeStamp: new Date(),
      };

      const result = await mealsCollection.updateOne(query, {
        $push: { reviews: addedReview },
      });
      res.send(result);
    });

    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server running");
});

app.listen(port, () => {
  console.log(`Server running on: http://localhost:${port}`);
});
