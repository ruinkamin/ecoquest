# EcoQuest Dnipro

Expo / React Native client for the EcoQuest volunteer platform.

## Connect the backend

The app uses `EXPO_PUBLIC_API_URL` as its HTTP API address (not a database connection string).
The example value in `.env.example` is the intended public host and works only after the API
has actually been deployed there. For local development, copy `.env.example` to `.env.local`
and set the address of a running backend:

- Local backend on iOS simulator: `http://localhost:8000`
- Android emulator: `http://10.0.2.2:8000`
- Physical phone: use the computer's LAN address, for example `http://192.168.1.20:8000`
- Deployed backend: use its HTTPS URL

Run the FastAPI backend with Python 3.11 and its own `requirements.txt`, then run `npx expo start`.
For an isolated local demo, configure the backend with SQLite, a newly generated local `JWT_SECRET`,
`DEV_LOGIN=true`, and `AI_MODE=mock`; do not reuse production credentials or expose this setup to
the internet. Seed demo data only in the local database. Physical phones and the development
computer must be on the same Wi-Fi network, and `.env.local` must use the computer's current LAN IP.
The app reads and writes platform data through the backend API; it does not contain an app-side
demo database. Photo uploads, auth tokens, quest progress, rewards, statistics, and impact evidence
all use the API.

The client includes the documented API flows for account registration and recovery, Google/demo sign-in, quests and reports, team invitations, organization and partner applications, reward management/redemption, and platform/organization moderation. XP starts at zero and is awarded by the backend only for verified quest completions. There is no rating/leaderboard screen. After signing in, open **Профіль → Організації, партнери та модерація** to manage organizations or partner rewards; platform moderation appears for moderator/admin accounts. The server remains authoritative for every permission and action.

Partner reward listings and promo-code redemption are supported. Direct integrations for municipal transit tickets, museum ticketing, or parking payments are not implemented yet and require partner-specific APIs and agreements.

The Neon PostgreSQL connection string is for the backend only; Expo must use the backend's HTTP(S)
URL, never a database connection string. Verify that the backend responds at `/health`.
Expo reads `EXPO_PUBLIC_API_URL` at bundle time; restart Expo after changing `.env.local` and clear
its cache with `npx expo start --clear` if the old address is still used. The map uses OpenStreetMap
tiles and displays contributor attribution. The API client does not bundle backend data or
credentials.

## Google sign-in

Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` in `.env.local` to the corresponding OAuth 2.0 client IDs from the same Google Cloud project. Native client IDs are required on iOS and Android; the web client ID alone cannot be used as a native client ID. Configure the web client ID as `GOOGLE_CLIENT_ID` in the backend and register the redirect URI used by the Expo AuthSession flow in Google Cloud Console. Client IDs are public configuration; never put a client secret in the app.

Google sign-in requires a configured Google OAuth client and backend. Without it, email/password and guest access remain available.
