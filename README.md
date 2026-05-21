# Net Worth Tracker — Web

A React web app to track assets, liabilities, and net worth over time.

## Tech Stack

- **React 18** + **TypeScript** + **Vite**
- **Material UI (MUI)** for UI components
- **Recharts** for line charts
- **Google Sign-In** for authentication
- **GitHub Pages** for hosting

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
# Install dependencies
npm install

# Copy env file and add your credentials
cp .env.example .env

# Start dev server
npm run dev
```

### Environment Variables

| Variable | Description |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `VITE_API_BASE_URL` | Your backend API URL (AWS Lambda API Gateway endpoint) |

### Build & Deploy

```bash
# Build for production
npm run build

# Preview the production build locally
npm run preview
```

Deployment to GitHub Pages happens automatically via GitHub Actions on push to `main`.

### GitHub Pages Setup

1. Go to your repo **Settings → Pages**
2. Set **Source** to **GitHub Actions**
3. Add secrets in **Settings → Secrets → Actions**:
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_API_BASE_URL`
4. Push to `main` — the site will be live at `https://<username>.github.io/net-worth-web/`
