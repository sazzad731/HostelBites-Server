const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors")
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId, Timestamp } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(cors())
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
    const paymentCollection = db.collection("payments")
    const usersCollection = db.collection("users")
    const mealsCollection = db.collection("meals");


    app.post("/users", async(req, res)=>{
      const userInfo = req.body;
      const userExist = await usersCollection.findOne({ email: userInfo.email });
      if(userExist){
        return res.status(400).json({ message: "Email already exists" });
      }
      const result = await usersCollection.insertOne(userInfo);
      res.send(result);
    })


    // get meals by category
    app.get('/mealsByCategory', async(req, res)=>{
      const category = req.query.category;
      let query = {}
      if(category){
        query = {category: category}
      }
      const result = await mealsCollection.find(query).limit(3).toArray();
      res.send(result)
    })


    //get meals by search, category and price range
    app.get("/meals", async(req, res)=>{
      const {page = 1, limit = 10, search, category, priceRange } = req.query;
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
        const [min, max] = priceRange.split("-").map(value=>Number(value.replace("$", "")));
        query.price = { $gte: min, $lte: max };
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const meals = await mealsCollection.find(query).skip(skip).limit(parseInt(limit)).toArray();
      const total = await mealsCollection.countDocuments(query);
      
      res.send({
        meals,
        total,
      });
      
    })


    // get all packages api
    app.get("/packages", async(req, res)=>{
      const result = await packagesCollection.find().toArray();
      res.send(result);
    })


    // get single package by id
    app.get('/package/:id', async(req, res)=>{
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await packagesCollection.findOne(query);
      res.send(result);
    })


    app.get("/already_purchased", async(req, res)=>{
      const { email } = req.query;
      const query = { email }
      const result = await paymentCollection.findOne(query);
      res.send(result);
    });


    app.post("/create-payment-intent", async(req, res)=>{
      const { amountInCents } = req.body;
      try{
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents, // amount in cents
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({clientSecret: paymentIntent.client_secret})
      }catch(error){
        res.status(500).send({error: error.message})
      }
    })



    app.post('/payments', async(req, res)=>{
      const { packageName, email, amount, paymentMethod, transactionId } = req.body;
      try{
        // update user badge
        const updateBadge = await usersCollection.updateOne(
          { email: email },
          {
            $set: {
              badge: packageName
            },
          }
        );

        if(updateBadge.modifiedCount === 0){
          return res.status(404).send({message: "User not found or already subscribed"})
        }

        // insert payment record
        const paymentDoc = {
          packageName,
          email,
          amount,
          paymentMethod,
          transactionId,
          paidAt: new Date()
        };

        const paymentResult = await paymentCollection.insertOne(paymentDoc);
        res.status(201).send(paymentResult)

      }catch(error){
        res.send(error);
      }
    })



    // get Meal details
    app.get('/meal/:id', async(req, res)=>{
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await mealsCollection.findOne(query);
      res.send(result);
    })


    // Meal likes
    app.patch('/like', async(req, res)=>{
      const { id } = req.body;
      const query = { _id: new ObjectId(id) };
      const result = await mealsCollection.updateOne(query, {$inc: {likes: 1}})
      res.send(result)
    })


    app.post('/add-review', async (req, res) =>{
      const data = req.body;
      const { mealId } = req.query
      const query = { _id: new ObjectId(mealId) }
      const addedReview = {
        ...data,
        timeStamp: new Date()
      }
      
      const result = await mealsCollection.updateOne(query, {
        $push: { reviews: addedReview },
      }); 
      res.send(result)
    })




    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.listen(port, ()=>{
  console.log(`Server running on: http://localhost:${port}`)
})