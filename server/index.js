import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import session from 'express-session'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import { doubleCsrf } from 'csrf-csrf'
import authRouter from "./routes/auth.js"
import scanRouter from "./routes/scan.js"
import trashRouter from "./routes/trash.js"
import activityRouter from "./routes/activity.js"
import { pool } from './db/index.js'
import connectPgSimple from 'connect-pg-simple'

dotenv.config()

const app = express()
const port = process.env.PORT || 4000
const PgSession = connectPgSimple(session)
const isProduction = process.env.NODE_ENV === 'production'
const clientOrigin = process.env.CLIENT_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173'

app.set('trust proxy', 1)

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}))

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(limiter)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (origin === clientOrigin) return callback(null, true)
    if (!isProduction) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))

app.use(cookieParser(process.env.SESSION_SECRET || 'dev-secret'))
app.use(express.json({ limit: '10kb' }))

const sessionStore = new PgSession({
  pool: pool,
  tableName: 'session',
  createTableIfMissing: true,
})

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  name: 'connect.sid',
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  }
}))

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || 'dev-secret',
  getSessionIdentifier: (req) => req.sessionID,
  cookieName: isProduction ? '__Host-psifi.x-csrf-token' : 'x-csrf-token',
  cookieOptions: {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    path: '/',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getTokenFromRequest: (req) => req.headers['x-csrf-token'] || req.body?._csrf,
})

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

app.get('/csrf-token', (req, res) => {
  const token = generateToken(req, res)
  res.json({ csrfToken: token })
})

app.use("/auth", authRouter)
app.use("/scan", scanRouter)
app.use("/trash", doubleCsrfProtection, trashRouter)
app.use("/activity", activityRouter)

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
