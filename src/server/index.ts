import express from 'express'
import type { Express } from 'express'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import chalk from 'chalk'
import { Neo4jDB } from '../storage/neo4j'
import { SQLiteDB } from '../storage/sqlite'
import { QueryEngine } from '../query/queryEngine'
import { WSServer } from './wsServer'
import { createGraphRouter } from './graphApi'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app: Express = express()
const server = http.createServer(app)

app.use(express.json())
app.use(express.static(path.join(__dirname, '../../dist/ui')))

let neo4j: Neo4jDB
let sqlite: SQLiteDB

async function initializeServer() {
  try {
    const neo4jUrl = process.env.NEO4J_URL || 'bolt://localhost:7687'
    const neo4jUser = process.env.NEO4J_USER || 'neo4j'
    const neo4jPassword = process.env.NEO4J_PASSWORD || 'password'
    const sqlitePath = process.env.SQLITE_PATH || './data/codeflow.db'

    console.log(chalk.blue('🚀 Initializing Codeflow server...'))

    neo4j = new Neo4jDB(neo4jUrl, neo4jUser, neo4jPassword)
    sqlite = new SQLiteDB(sqlitePath)
    const queryEngine = new QueryEngine(neo4j, sqlite)

    console.log(chalk.gray('  Connecting to databases...'))
    sqlite.init()

    console.log(chalk.gray('  Setting up WebSocket server...'))
    new WSServer(server, queryEngine)

    console.log(chalk.gray('  Registering API routes...'))
    app.use('/api/graph', createGraphRouter(queryEngine))

    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() })
    })

    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, '../../dist/ui/index.html'))
    })

    const PORT = process.env.PORT || 5174
    server.listen(PORT, () => {
      console.log(chalk.green('✓ Server running at') + ' ' + chalk.cyan(`http://localhost:${PORT}`))
      console.log(chalk.green('✓ WebSocket ready at') + ' ' + chalk.cyan(`ws://localhost:${PORT}/ws`))
      console.log(chalk.gray('  Press Ctrl+C to stop\n'))
    })
  } catch (error) {
    console.error(chalk.red('❌ Initialization error:'), (error as Error).message)
    process.exit(1)
  }
}

async function shutdown() {
  console.log(chalk.yellow('\n⚠️  Shutting down...'))

  server.close()

  try {
    if (neo4j) await neo4j.close()
    if (sqlite) sqlite.close()
  } catch (_) {}

  console.log(chalk.green('✓ Server stopped'))
  process.exit(0)
}

// Register shutdown handler only once, outside initializeServer
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

initializeServer()
