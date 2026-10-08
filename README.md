# Tank Battle
Free-for-all browser tank game for any number of players. Random point-symmetric maze, random spawns,
first to 10 kills wins. Multiplayer: Vercel function (`api/room.js`) + **Neon Postgres**.

## Deploy
1. Push to GitHub, import the repo in Vercel (Framework preset: Other; `public/` is served, `api/` becomes functions).
2. Vercel -> Storage -> Neon (you already did this) and connect it to the project; it sets `DATABASE_URL`.
   Tables are created automatically on the first request. Redeploy.
3. Put your PNGs in `public/assets/` (exact names, case-sensitive):
   Spawnpoint.png, CenterTile.png, Character.png, Horizontal tile.png, Vertical tile.png, Down to right tile.png,
   Down to left tile.png, Cross Path tile.png, Up to right tile.png, Up to left tile.png
4. Create a room and share the code or invite link.

Local: `npm i && npx vercel link && npx vercel env pull && npx vercel dev`.
Controls: joystick + FIRE, or WASD/arrows + Space.

## Notes
- Each player syncs ~8x/second (one Neon query batch each). Free-tier compute stays awake while people play.
- Keep the Vercel function region close to your Neon region (Project Settings -> Functions) for lower lag.
