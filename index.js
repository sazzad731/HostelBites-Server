const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors")
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId, Timestamp } = require("mongodb");

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
    app.get('/meals', async(req, res)=>{
      const category = req.query.category;
      let query = {}
      if(category){
        query = {category: category}
      }
      const result = await mealsCollection.find(query).limit(3).toArray();
      res.send(result)
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