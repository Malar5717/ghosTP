import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import session from 'express-session'
import authRouter from "./routes/auth.js"
import scanRouter from "./routes/scan.js"
import trashRouter from "./routes/trash.js"
import { pool } from './db/index.js'
import connectPgSimple from 'connect-pg-simple'

dotenv.config()

const app = express()
const port = process.env.PORT || 4000
const PgSession = connectPgSimple(session)

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}))

app.use(express.json())
app.use(session({
  store: new PgSession({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  }
}))

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

app.use("/auth", authRouter)
app.use("/scan", scanRouter)
app.use("/trash", trashRouter)

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
