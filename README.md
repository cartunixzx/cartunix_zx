# Cartunix Zx — A-Z Production Starter

## Included
- Responsive AI creator dashboard
- Signup/login with hashed passwords
- ₹100 welcome credits
- ₹49 / ₹199 / ₹499 order flow
- QR payment image
- User photo/video/audio upload
- Support tickets with screenshot/video attachment
- Admin-only settings and ticket/order management
- Admin-only QR replacement endpoint
- Server-side JWT authentication
- SQLite database
- Social links and WhatsApp support
- AI endpoint adapters ready for provider integration

## Important before going live
1. Copy `.env.example` to `.env`.
2. Set a long random `JWT_SECRET`.
3. Set a real admin email/password.
4. Connect a real AI provider for image/video/voice/script. The exact provider API keys belong only in `.env`.
5. For automatic payment verification, connect a payment gateway and verify its webhook signature on the server before granting credits.
6. Deploy behind HTTPS on a Node.js host.
7. Change the demo admin credentials before public launch.

## Security
The frontend never contains the admin password or AI secrets. Admin routes require a server-side JWT with role `admin`. Users cannot call admin settings/order/ticket endpoints unless authenticated as admin.

## Run
`npm install`
`npm start`

Then open `http://localhost:3000`.
