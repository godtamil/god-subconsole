import { digest } from "./security";
import { config } from "./config";
const timestamp = String(Date.now());
const r = await fetch(
  `http://127.0.0.1:${config.port}/api/auth/bootstrap-local`,
  {
    method: "POST",
    headers: {
      "X-Bootstrap-Time": timestamp,
      "X-Local-Bootstrap": digest("bootstrap:" + timestamp),
    },
  },
).catch(() => {
  throw Error(
    "Start the application with npm run dev first, then run bootstrap in a second terminal.",
  );
});
const data = await r.json();
if (!r.ok) throw Error(data.error);
console.log("One-time owner setup link (expires in 15 minutes):\n" + data.url);
