import { migrate, closeDb } from "./db";
await migrate();
await closeDb();
console.log("Database migration complete.");
