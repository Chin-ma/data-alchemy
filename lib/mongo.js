import { MongoClient } from "mongodb";

if (!process.env.MONGODB_URI) {
    throw new Error("Please add your Mongo URI to .env.local");
}

if (!process.env.DB_NAME) {
    throw new Error("Please add your Mongo DB to .env.local");
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;

let cachedClient = null;
let cachedDb = null;

export async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }

    const client = new MongoClient(uri)
    try {
        await client.connect();
        const db = client.db(dbName);
        cachedClient = client;
        cachedDb = db;
        return { client, db };
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
        throw new Error("Error connecting to MongoDB");
    }
}